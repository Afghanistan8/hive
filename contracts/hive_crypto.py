# { "Depends": "py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng" }
"""HIVE Daily — permissionless UP/DOWN markets on completed GMT+1 daily candles.

Settlement is 2-of-2 and contract-owned. Callers of ``resolve_market`` pass a
market id and nothing else: the contract owns the asset registry, the URL
templates, the parsers, the direction math and the result.

Inside one ``gl.eq_principle.strict_eq`` block every validator independently:

  * reconstructs the GMT+1 daily candle from CoinGecko ``market_chart/range``
  * reconstructs the SAME 24h window from Gate.io hourly spot candles
  * derives a direction per source (UP if close > open, else DOWN)

The canonical string they agree on carries every field that is later
persisted, so storage is a pure function of the consensus result. No web
fetch happens after consensus.

UP+UP -> UP, DOWN+DOWN -> DOWN, mismatch -> INCONCLUSIVE (refund).
Sources down -> revert (retryable). Still down 5 days after eligibility ->
terminal refund. A direction is never fabricated.

There is no owner, no admin, no pause and no withdrawal path other than
``claim``.
"""

# Deliberately NO `from __future__ import annotations`: the GenVM schema
# extractor reads annotations through inspect.signature() and needs real types.

import json
from dataclasses import dataclass

import genlayer as gl
from genlayer.storage import allow as allow_storage


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

DAY = 86_400
HOUR = 3_600
GMT_PLUS_ONE = 3_600  # fixed +1h offset, no DST
GEN = 10**18
MIN_STAKE = 2 * GEN
MAX_STAKE = 8 * GEN
MAX_FORWARD_DAYS = 60
TERMINAL_REFUND_DELAY = 5 * DAY
MAX_PAGE = 50
MAX_SOURCE_BYTES = 120_000
PRICE_SCALE = 10**8
EDGE_TOLERANCE = 90 * 60  # CoinGecko hourly samples must hug both window edges
HTTP_HEADERS = {"Accept": "application/json", "User-Agent": "curl/8.5.0 (HIVE GenLayer validator)"}

# asset -> (CoinGecko coin id, Gate.io spot pair). Every entry is verified
# against both public endpoints by scripts/check_sources.py.
ASSET_SOURCES = {
    "BTC": ("bitcoin", "BTC_USDT"),
    "ETH": ("ethereum", "ETH_USDT"),
    "SOL": ("solana", "SOL_USDT"),
    "BNB": ("binancecoin", "BNB_USDT"),
    "XRP": ("ripple", "XRP_USDT"),
    "ADA": ("cardano", "ADA_USDT"),
    "DOGE": ("dogecoin", "DOGE_USDT"),
    "AVAX": ("avalanche-2", "AVAX_USDT"),
    "LINK": ("chainlink", "LINK_USDT"),
    "DOT": ("polkadot", "DOT_USDT"),
    "ATOM": ("cosmos", "ATOM_USDT"),
    "LTC": ("litecoin", "LTC_USDT"),
    "UNI": ("uniswap", "UNI_USDT"),
    "AAVE": ("aave", "AAVE_USDT"),
    "SUI": ("sui", "SUI_USDT"),
    "NEAR": ("near", "NEAR_USDT"),
    "APT": ("aptos", "APT_USDT"),
    "ARB": ("arbitrum", "ARB_USDT"),
    "OP": ("optimism", "OP_USDT"),
    "JUP": ("jupiter-exchange-solana", "JUP_USDT"),
    "ZRO": ("layerzero", "ZRO_USDT"),
    "ZAMA": ("zama", "ZAMA_USDT"),
}
ASSETS = tuple(ASSET_SOURCES.keys())

SIDE_UP = "UP"
SIDE_DOWN = "DOWN"
RESULT_INCONCLUSIVE = "INCONCLUSIVE"
UNAVAILABLE = "UNAVAILABLE"

# Stored lifecycle state
STATE_PENDING = "PENDING"
STATE_UP = "UP"
STATE_DOWN = "DOWN"
STATE_INCONCLUSIVE = "INCONCLUSIVE"
STATE_REFUNDED = "REFUNDED"  # terminal refund, evidence never became available

# Visible phase (derived from state + consensus time)
PHASE_OPEN = "OPEN"
PHASE_CLOSED = "CLOSED"
PHASE_READY = "READY_TO_SETTLE"
PHASE_SETTLED = "SETTLED"
PHASE_INCONCLUSIVE = "INCONCLUSIVE"

ERR_EXPECTED = "EXPECTED"
ERR_INVARIANT = "INVARIANT"
ERR_TRANSIENT = "TRANSIENT"
ERR_EXTERNAL = "EXTERNAL"

EVIDENCE_FIELDS = 12


@gl.evm.contract_interface
class _Wallet:
    """Payout target. Winners are wallets (EVM accounts), so payouts are external
    EVM value transfers; an internal GenLayer message to a wallet is skipped and
    its value returned to the sender (observed on Studio Next)."""

    class View:
        pass

    class Write:
        pass


class SourceError(Exception):
    """Raised inside the nondet block when a source cannot produce a candle."""


# ---------------------------------------------------------------------------
# Date / time helpers (GMT+1, no DST) — pure integer math
# ---------------------------------------------------------------------------

_DAYS_IN_MONTH = (31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31)


def _is_leap(y: int) -> bool:
    return (y % 4 == 0 and y % 100 != 0) or (y % 400 == 0)


def _days_in_month(y: int, m: int) -> int:
    if m == 2 and _is_leap(y):
        return 29
    return _DAYS_IN_MONTH[m - 1]


def _days_from_civil(y: int, m: int, d: int) -> int:
    y -= 1 if m <= 2 else 0
    era = (y if y >= 0 else y - 399) // 400
    yoe = y - era * 400
    doy = (153 * (m + (-3 if m > 2 else 9)) + 2) // 5 + d - 1
    doe = yoe * 365 + yoe // 4 - yoe // 100 + doy
    return era * 146097 + doe - 719468


def _parse_date(s: str) -> tuple:
    if not isinstance(s, str) or len(s) != 10 or s[4] != "-" or s[7] != "-":
        raise gl.vm.UserError(f"{ERR_EXPECTED}: invalid date format, use YYYY-MM-DD")
    y_s, m_s, d_s = s[0:4], s[5:7], s[8:10]
    if not (y_s.isdigit() and m_s.isdigit() and d_s.isdigit()):
        raise gl.vm.UserError(f"{ERR_EXPECTED}: invalid date digits")
    y, m, d = int(y_s), int(m_s), int(d_s)
    if y < 2020 or y > 2100 or m < 1 or m > 12:
        raise gl.vm.UserError(f"{ERR_EXPECTED}: date out of range")
    if d < 1 or d > _days_in_month(y, m):
        raise gl.vm.UserError(f"{ERR_EXPECTED}: day out of range for month")
    return y, m, d


def gmt1_day_start_utc(target_day: str) -> int:
    y, m, d = _parse_date(target_day)
    return _days_from_civil(y, m, d) * DAY - GMT_PLUS_ONE


def parse_iso_utc(s: str) -> int:
    """Parse the ISO-8601 UTC string GenVM puts in message.raw['datetime']."""
    if not isinstance(s, str) or len(s) < 19:
        raise gl.vm.UserError(f"{ERR_INVARIANT}: bad transaction datetime")
    if s[4] != "-" or s[7] != "-" or s[10] not in ("T", " ") or s[13] != ":" or s[16] != ":":
        raise gl.vm.UserError(f"{ERR_INVARIANT}: bad transaction datetime")
    parts = (s[0:4], s[5:7], s[8:10], s[11:13], s[14:16], s[17:19])
    for p in parts:
        if not p.isdigit():
            raise gl.vm.UserError(f"{ERR_INVARIANT}: bad transaction datetime")
    y, mo, d, hh, mi, sec = (int(p) for p in parts)
    if mo < 1 or mo > 12 or d < 1 or d > _days_in_month(y, mo) or hh > 23 or mi > 59 or sec > 60:
        raise gl.vm.UserError(f"{ERR_INVARIANT}: bad transaction datetime")
    return _days_from_civil(y, mo, d) * DAY + hh * 3600 + mi * 60 + sec


def consensus_now() -> int:
    # Consensus transaction time — identical for every validator. Never the
    # node wall clock, which would make validators disagree on phase edges.
    return parse_iso_utc(str(gl.message.raw["datetime"]))


# ---------------------------------------------------------------------------
# Source URL templates (contract-owned)
# ---------------------------------------------------------------------------


def coingecko_url(asset: str, day_start_utc: int) -> str:
    coin_id = ASSET_SOURCES[asset][0]
    return (
        "https://api.coingecko.com/api/v3/coins/"
        + coin_id
        + "/market_chart/range?vs_currency=usd"
        + f"&from={day_start_utc - HOUR}&to={day_start_utc + DAY + HOUR}"
    )


def gate_url(asset: str, day_start_utc: int) -> str:
    # interval=1h on purpose: Gate's 1d candles are UTC-aligned, not GMT+1.
    pair = ASSET_SOURCES[asset][1]
    return (
        "https://api.gateio.ws/api/v4/spot/candlesticks"
        + f"?currency_pair={pair}&interval=1h"
        + f"&from={day_start_utc - HOUR}&to={day_start_utc + DAY + HOUR}"
    )


# ---------------------------------------------------------------------------
# Deterministic parsers (also used by scripts/check_sources.py)
# ---------------------------------------------------------------------------


def _load_json(raw: str):
    if raw is None or len(raw) == 0:
        raise SourceError("empty body")
    if len(raw) > MAX_SOURCE_BYTES:
        raise SourceError("response too large")
    try:
        return json.loads(raw)
    except Exception:
        raise SourceError("invalid JSON")


def decimal_to_scaled(s: str) -> int:
    """'0.12345678901' -> 12345678 (truncated to 8 decimals). No floats."""
    s = s.strip()
    if s.startswith("+"):
        s = s[1:]
    if s.startswith("-") or "e" in s or "E" in s or not s:
        raise SourceError("unsupported price notation")
    int_part, _, frac_part = s.partition(".")
    if int_part == "":
        int_part = "0"
    if not int_part.isdigit() or (frac_part and not frac_part.isdigit()):
        raise SourceError("invalid price digits")
    frac_part = (frac_part + "00000000")[:8]
    val = int(int_part) * PRICE_SCALE + int(frac_part)
    if val <= 0:
        raise SourceError("non-positive price")
    return val


def price_to_scaled(v) -> int:
    if isinstance(v, bool):
        raise SourceError("bad price type")
    if isinstance(v, int):
        if v <= 0:
            raise SourceError("non-positive price")
        return v * PRICE_SCALE
    if isinstance(v, float):
        if v != v or v <= 0 or v in (float("inf"), float("-inf")):
            raise SourceError("non-finite price")
        # repr() is the shortest round-trip form, identical on every
        # validator; very small prices come back in exponent form.
        text = repr(v)
        if "e" in text or "E" in text:
            text = "%.12f" % v
        return decimal_to_scaled(text)
    if isinstance(v, str):
        return decimal_to_scaled(v)
    raise SourceError("bad price type")


def parse_coingecko(raw: str, day_start_utc: int) -> tuple:
    data = _load_json(raw)
    if not isinstance(data, dict):
        raise SourceError("coingecko root not object")
    prices = data.get("prices")
    if not isinstance(prices, list) or len(prices) == 0:
        raise SourceError("coingecko missing prices")
    end_utc = day_start_utc + DAY
    window = []
    for row in prices:
        if not isinstance(row, list) or len(row) < 2:
            raise SourceError("coingecko bad row")
        ts_ms = row[0]
        if isinstance(ts_ms, bool) or not isinstance(ts_ms, (int, float)):
            raise SourceError("coingecko bad timestamp")
        ts = int(ts_ms) // 1000
        if day_start_utc <= ts < end_utc:
            window.append((ts, row[1]))
    if len(window) == 0:
        raise SourceError("coingecko window empty")
    window.sort(key=lambda r: r[0])
    if window[0][0] - day_start_utc > EDGE_TOLERANCE:
        raise SourceError("coingecko window incomplete at start")
    if (end_utc - 1) - window[-1][0] > EDGE_TOLERANCE:
        raise SourceError("coingecko window incomplete at end")
    return price_to_scaled(window[0][1]), price_to_scaled(window[-1][1])


def parse_gate(raw: str, day_start_utc: int) -> tuple:
    data = _load_json(raw)
    if not isinstance(data, list) or len(data) == 0:
        raise SourceError("gate empty candles")
    end_utc = day_start_utc + DAY
    seen = set()
    window = []
    for row in data:
        # [ts, quote_volume, close, high, low, open, base_volume, is_closed]
        if not isinstance(row, list) or len(row) < 6:
            raise SourceError("gate bad row")
        try:
            ts = int(row[0])
        except Exception:
            raise SourceError("gate bad timestamp")
        if ts in seen:
            raise SourceError("gate duplicate candle")
        seen.add(ts)
        if day_start_utc <= ts < end_utc:
            closed = row[7] if len(row) > 7 else "true"
            window.append((ts, row[5], row[2], str(closed).lower()))
    window.sort(key=lambda r: r[0])
    if len(window) != 24:
        raise SourceError("gate window incomplete")
    if window[0][0] != day_start_utc or window[-1][0] != end_utc - HOUR:
        raise SourceError("gate candles misaligned")
    if window[-1][3] != "true":
        raise SourceError("gate last candle still open")
    return price_to_scaled(window[0][1]), price_to_scaled(window[-1][2])


def direction(open_p: int, close_p: int) -> str:
    return SIDE_UP if close_p > open_p else SIDE_DOWN  # flat counts as DOWN


def combine(cg_dir: str, gt_dir: str) -> str:
    return cg_dir if cg_dir == gt_dir else RESULT_INCONCLUSIVE


# ---------------------------------------------------------------------------
# Storage records
# ---------------------------------------------------------------------------


@allow_storage
@dataclass
class Market:
    id: gl.u256
    asset: str
    coingecko_id: str
    gate_pair: str
    target_day: str
    creator: str
    created_at: gl.u256
    cutoff_at: gl.u256
    settles_at: gl.u256
    terminal_refund_at: gl.u256
    up_pool: gl.u256
    down_pool: gl.u256
    paid_out: gl.u256
    winning_stake_claimed: gl.u256
    positions_count: gl.u256
    state: str
    result: str
    refund_all: bool
    resolved_at: gl.u256


@allow_storage
@dataclass
class Position:
    market_id: gl.u256
    owner: str
    side: str
    stake: gl.u256
    claimed: bool
    payout: gl.u256


@allow_storage
@dataclass
class Evidence:
    market_id: gl.u256
    resolved_at: gl.u256
    coingecko_open: gl.u256
    coingecko_close: gl.u256
    coingecko_direction: str
    gate_open: gl.u256
    gate_close: gl.u256
    gate_direction: str
    final_result: str
    terminal_refund: bool
    agreed_payload: str  # the exact string validators agreed on, stored verbatim


# ---------------------------------------------------------------------------
# Contract
# ---------------------------------------------------------------------------


class HiveCrypto(gl.contract.Contract):
    market_count: gl.u256
    markets: gl.storage.TreeMap[gl.u256, Market]
    market_keys: gl.storage.TreeMap[str, gl.u256]  # "ASSET|YYYY-MM-DD" -> id
    positions: gl.storage.TreeMap[str, Position]  # "id|owner" -> position
    user_market_count: gl.storage.TreeMap[str, gl.u256]
    user_market_index: gl.storage.TreeMap[str, gl.u256]  # "owner|i" -> id
    evidence: gl.storage.TreeMap[gl.u256, Evidence]

    def __init__(self) -> None:
        self.market_count = 0

    # ---- internal helpers ---------------------------------------------------

    def _sender(self) -> str:
        return gl.message.sender_address.as_hex.lower()

    def _get_market(self, market_id: int) -> Market:
        mid = int(market_id)
        if mid not in self.markets:
            raise gl.vm.UserError(f"{ERR_EXPECTED}: unknown market")
        return self.markets[mid]

    def _phase(self, m: Market, now: int) -> str:
        if m.state in (STATE_UP, STATE_DOWN):
            return PHASE_SETTLED
        if m.state in (STATE_INCONCLUSIVE, STATE_REFUNDED):
            return PHASE_INCONCLUSIVE
        if now < int(m.cutoff_at):
            return PHASE_OPEN
        if now < int(m.settles_at):
            return PHASE_CLOSED
        return PHASE_READY

    def _create(self, asset: str, target_day: str, now: int) -> int:
        day_start = gmt1_day_start_utc(target_day)
        if day_start <= now:
            raise gl.vm.UserError(f"{ERR_EXPECTED}: target day already started")
        if day_start - now > MAX_FORWARD_DAYS * DAY:
            raise gl.vm.UserError(f"{ERR_EXPECTED}: target day too far ahead")
        key = f"{asset}|{target_day}"
        if key in self.market_keys:
            raise gl.vm.UserError(f"{ERR_EXPECTED}: duplicate market")
        mid = int(self.market_count) + 1
        self.market_count = mid
        settles = day_start + DAY
        coin_id, pair = ASSET_SOURCES[asset]
        self.markets[mid] = Market(
            id=mid,
            asset=asset,
            coingecko_id=coin_id,
            gate_pair=pair,
            target_day=target_day,
            creator=self._sender(),
            created_at=now,
            cutoff_at=day_start,
            settles_at=settles,
            terminal_refund_at=settles + TERMINAL_REFUND_DELAY,
            up_pool=0,
            down_pool=0,
            paid_out=0,
            winning_stake_claimed=0,
            positions_count=0,
            state=STATE_PENDING,
            result="",
            refund_all=False,
            resolved_at=0,
        )
        self.market_keys[key] = mid
        return mid

    # ---- writes: creation ---------------------------------------------------

    @gl.public.write
    def create_market(self, asset: str, target_day: str) -> int:
        """Any caller. One market per asset per future GMT+1 day."""
        asset = str(asset).upper()
        if asset not in ASSET_SOURCES:
            raise gl.vm.UserError(f"{ERR_EXPECTED}: unsupported asset")
        return self._create(asset, target_day, consensus_now())

    @gl.public.write
    def create_daily_markets(self, target_day: str) -> int:
        """Any caller. Opens every supported asset for a day, skipping existing."""
        now = consensus_now()
        created = 0
        for asset in ASSETS:
            if f"{asset}|{target_day}" in self.market_keys:
                continue
            self._create(asset, target_day, now)
            created += 1
        return created

    # ---- writes: staking ----------------------------------------------------

    @gl.public.write.payable
    def take_position(self, market_id: int, side: str) -> None:
        m = self._get_market(market_id)
        mid = int(m.id)
        if m.state != STATE_PENDING or consensus_now() >= int(m.cutoff_at):
            raise gl.vm.UserError(f"{ERR_EXPECTED}: entries closed")
        side = str(side).upper()
        if side not in (SIDE_UP, SIDE_DOWN):
            raise gl.vm.UserError(f"{ERR_EXPECTED}: invalid side")
        value = int(gl.message.value)
        if value < MIN_STAKE:
            raise gl.vm.UserError(f"{ERR_EXPECTED}: stake below minimum (2 GEN)")

        owner = self._sender()
        pkey = f"{mid}|{owner}"
        if pkey not in self.positions:
            if value > MAX_STAKE:
                raise gl.vm.UserError(f"{ERR_EXPECTED}: stake above maximum (8 GEN)")
            self.positions[pkey] = Position(
                market_id=mid, owner=owner, side=side, stake=value, claimed=False, payout=0
            )
            idx = int(self.user_market_count.get(owner, 0))
            self.user_market_index[f"{owner}|{idx}"] = mid
            self.user_market_count[owner] = idx + 1
            m.positions_count = int(m.positions_count) + 1
        else:
            pos = self.positions[pkey]
            if pos.side != side:
                raise gl.vm.UserError(f"{ERR_EXPECTED}: side switch not allowed")
            new_stake = int(pos.stake) + value
            if new_stake > MAX_STAKE:
                raise gl.vm.UserError(f"{ERR_EXPECTED}: stake above maximum (8 GEN)")
            pos.stake = new_stake

        if side == SIDE_UP:
            m.up_pool = int(m.up_pool) + value
        else:
            m.down_pool = int(m.down_pool) + value

    # ---- writes: settlement -------------------------------------------------

    @gl.public.write
    def resolve_market(self, market_id: int) -> str:
        """Any caller, once the candle has closed. Caller supplies no data."""
        m = self._get_market(market_id)
        mid = int(m.id)
        if m.state != STATE_PENDING:
            raise gl.vm.UserError(f"{ERR_EXPECTED}: already resolved")
        now = consensus_now()
        if now < int(m.settles_at):
            raise gl.vm.UserError(f"{ERR_EXPECTED}: candle not closed yet")

        agreed = self._agree_evidence(mid, m.asset, m.target_day)
        parts = agreed.split("|")

        if len(parts) >= 1 and parts[0] == UNAVAILABLE:
            if now >= int(m.terminal_refund_at):
                return self._terminal_refund(m, now, agreed)
            raise gl.vm.UserError(f"{ERR_TRANSIENT}: sources unavailable ({agreed}); retry later")

        cg_open, cg_close, cg_dir, gt_open, gt_close, gt_dir, final = validate_agreed(
            parts, mid, m.asset, m.coingecko_id, m.gate_pair, m.target_day
        )

        self.evidence[mid] = Evidence(
            market_id=mid,
            resolved_at=now,
            coingecko_open=cg_open,
            coingecko_close=cg_close,
            coingecko_direction=cg_dir,
            gate_open=gt_open,
            gate_close=gt_close,
            gate_direction=gt_dir,
            final_result=final,
            terminal_refund=False,
            agreed_payload=agreed,
        )

        if final == SIDE_UP:
            m.state = STATE_UP
            winner_pool = int(m.up_pool)
        elif final == SIDE_DOWN:
            m.state = STATE_DOWN
            winner_pool = int(m.down_pool)
        else:
            m.state = STATE_INCONCLUSIVE
            winner_pool = 0
        m.result = final
        m.refund_all = final == RESULT_INCONCLUSIVE or winner_pool == 0
        m.resolved_at = now
        return final

    def _agree_evidence(self, mid: int, asset: str, target_day: str) -> str:
        # The contract's only non-deterministic block. Worker passed by name so
        # the calling scope stays deterministic for the storage writes.
        day_start = gmt1_day_start_utc(target_day)
        coin_id, pair = ASSET_SOURCES[asset]
        cg = coingecko_url(asset, day_start)
        gt = gate_url(asset, day_start)

        def fetch_evidence() -> str:
            return normalized_evidence(mid, asset, coin_id, pair, target_day, cg, gt, day_start)

        return gl.eq_principle.strict_eq(fetch_evidence)

    def _terminal_refund(self, m: Market, now: int, agreed: str) -> str:
        mid = int(m.id)
        self.evidence[mid] = Evidence(
            market_id=mid,
            resolved_at=now,
            coingecko_open=0,
            coingecko_close=0,
            coingecko_direction="",
            gate_open=0,
            gate_close=0,
            gate_direction="",
            final_result=RESULT_INCONCLUSIVE,
            terminal_refund=True,
            agreed_payload=agreed,
        )
        m.state = STATE_REFUNDED
        m.result = RESULT_INCONCLUSIVE
        m.refund_all = True
        m.resolved_at = now
        return RESULT_INCONCLUSIVE

    # ---- writes: claim ------------------------------------------------------

    @gl.public.write
    def claim(self, market_id: int) -> int:
        m = self._get_market(market_id)
        mid = int(m.id)
        if m.state == STATE_PENDING:
            raise gl.vm.UserError(f"{ERR_EXPECTED}: not resolved yet")
        owner = self._sender()
        pkey = f"{mid}|{owner}"
        if pkey not in self.positions:
            raise gl.vm.UserError(f"{ERR_EXPECTED}: no position")
        pos = self.positions[pkey]
        if pos.claimed:
            raise gl.vm.UserError(f"{ERR_EXPECTED}: already claimed")

        payout = self._payout(m, pos, sweep=True)
        if payout <= 0:
            raise gl.vm.UserError(f"{ERR_EXPECTED}: nothing to claim")
        total_pool = int(m.up_pool) + int(m.down_pool)
        if int(m.paid_out) + payout > total_pool:
            raise gl.vm.UserError(f"{ERR_INVARIANT}: payout exceeds pool")

        # Transfer FIRST. If it cannot be emitted the whole transaction reverts
        # and claimed stays False, so the position remains claimable.
        _Wallet(gl.message.sender_address).emit_transfer(payout)

        pos.claimed = True
        pos.payout = payout
        m.paid_out = int(m.paid_out) + payout
        if not m.refund_all:
            m.winning_stake_claimed = int(m.winning_stake_claimed) + int(pos.stake)
        return payout

    def _winner_pool(self, m: Market) -> int:
        if m.state == STATE_UP:
            return int(m.up_pool)
        if m.state == STATE_DOWN:
            return int(m.down_pool)
        return 0

    def _payout(self, m: Market, pos: Position, sweep: bool) -> int:
        stake = int(pos.stake)
        if m.state == STATE_PENDING:
            return 0
        if m.refund_all:
            return stake
        if pos.side != m.state:
            return 0
        winner_pool = self._winner_pool(m)
        total_pool = int(m.up_pool) + int(m.down_pool)
        if winner_pool <= 0:
            return stake
        share = (stake * total_pool) // winner_pool
        # The last winner to claim sweeps integer-division dust so the market
        # pays out exactly its pool — never more, never stranded wei.
        if sweep and int(m.winning_stake_claimed) + stake >= winner_pool:
            return total_pool - int(m.paid_out)
        return share

    # ---- views --------------------------------------------------------------

    @gl.public.view
    def get_supported_assets(self) -> list:
        return [
            {"asset": a, "coingecko_id": ASSET_SOURCES[a][0], "gate_pair": ASSET_SOURCES[a][1]}
            for a in ASSETS
        ]

    @gl.public.view
    def get_config(self) -> dict:
        return {
            "min_stake": MIN_STAKE,
            "max_stake": MAX_STAKE,
            "price_scale": PRICE_SCALE,
            "gmt_offset_seconds": GMT_PLUS_ONE,
            "terminal_refund_delay": TERMINAL_REFUND_DELAY,
            "max_forward_days": MAX_FORWARD_DAYS,
            "market_count": int(self.market_count),
            "now": consensus_now(),
        }

    @gl.public.view
    def get_market(self, market_id: int) -> dict:
        return self._market_dict(self._get_market(market_id), consensus_now())

    @gl.public.view
    def get_market_by_asset_day(self, asset: str, target_day: str) -> dict:
        key = f"{str(asset).upper()}|{target_day}"
        if key not in self.market_keys:
            return {"exists": False}
        return self._market_dict(self.markets[int(self.market_keys[key])], consensus_now())

    @gl.public.view
    def get_markets(self, offset: int, limit: int) -> list:
        """Newest first."""
        now = consensus_now()
        lim = min(max(int(limit), 0), MAX_PAGE)
        i = int(self.market_count) - max(int(offset), 0)
        out = []
        while i >= 1 and len(out) < lim:
            if i in self.markets:
                out.append(self._market_dict(self.markets[i], now))
            i -= 1
        return out

    @gl.public.view
    def get_position(self, market_id: int, wallet: str) -> dict:
        owner = str(wallet).lower()
        pkey = f"{int(market_id)}|{owner}"
        if pkey not in self.positions:
            return {"exists": False, "market_id": int(market_id), "owner": owner, "side": "", "stake": 0,
                    "claimed": False, "payout": 0, "claimable": 0}
        p = self.positions[pkey]
        claimable = 0
        if int(market_id) in self.markets and not p.claimed:
            claimable = self._payout(self.markets[int(market_id)], p, sweep=True)
        return {
            "exists": True,
            "market_id": int(p.market_id),
            "owner": p.owner,
            "side": p.side,
            "stake": int(p.stake),
            "claimed": p.claimed,
            "payout": int(p.payout),
            "claimable": claimable,
        }

    @gl.public.view
    def get_user_positions(self, wallet: str, offset: int, limit: int) -> list:
        owner = str(wallet).lower()
        now = consensus_now()
        cnt = int(self.user_market_count.get(owner, 0))
        lim = min(max(int(limit), 0), MAX_PAGE)
        i = cnt - 1 - max(int(offset), 0)
        out = []
        while i >= 0 and len(out) < lim:
            mid = int(self.user_market_index[f"{owner}|{i}"])
            m = self.markets[mid]
            p = self.positions[f"{mid}|{owner}"]
            out.append({
                "market": self._market_dict(m, now),
                "side": p.side,
                "stake": int(p.stake),
                "claimed": p.claimed,
                "payout": int(p.payout),
                "claimable": 0 if p.claimed else self._payout(m, p, sweep=True),
            })
            i -= 1
        return out

    @gl.public.view
    def get_evidence(self, market_id: int) -> dict:
        mid = int(market_id)
        if mid not in self.evidence:
            return {"exists": False}
        e = self.evidence[mid]
        return {
            "exists": True,
            "market_id": int(e.market_id),
            "resolved_at": int(e.resolved_at),
            "coingecko_open": int(e.coingecko_open),
            "coingecko_close": int(e.coingecko_close),
            "coingecko_direction": e.coingecko_direction,
            "gate_open": int(e.gate_open),
            "gate_close": int(e.gate_close),
            "gate_direction": e.gate_direction,
            "final_result": e.final_result,
            "terminal_refund": e.terminal_refund,
            "agreed_payload": e.agreed_payload,
            "price_scale": PRICE_SCALE,
        }

    @gl.public.view
    def get_source_urls(self, market_id: int) -> dict:
        m = self._get_market(market_id)
        day_start = gmt1_day_start_utc(m.target_day)
        return {"coingecko": coingecko_url(m.asset, day_start), "gate": gate_url(m.asset, day_start)}

    def _market_dict(self, m: Market, now: int) -> dict:
        return {
            "exists": True,
            "id": int(m.id),
            "asset": m.asset,
            "coingecko_id": m.coingecko_id,
            "gate_pair": m.gate_pair,
            "target_day": m.target_day,
            "creator": m.creator,
            "created_at": int(m.created_at),
            "cutoff_at": int(m.cutoff_at),
            "settles_at": int(m.settles_at),
            "terminal_refund_at": int(m.terminal_refund_at),
            "up_pool": int(m.up_pool),
            "down_pool": int(m.down_pool),
            "total_pool": int(m.up_pool) + int(m.down_pool),
            "paid_out": int(m.paid_out),
            "positions_count": int(m.positions_count),
            "state": m.state,
            "result": m.result,
            "refund_all": m.refund_all,
            "resolved_at": int(m.resolved_at),
            "phase": self._phase(m, now),
        }


# ---------------------------------------------------------------------------
# Nondet worker — runs on the leader and is re-run by every validator.
#
# Canonical payload (pipe-joined, compared byte-for-byte by strict_eq):
#   market_id | asset | coingecko_id | gate_pair | target_day
#     | cg_open | cg_close | cg_dir | gt_open | gt_close | gt_dir | final
# or, when a source cannot produce a complete candle:
#   UNAVAILABLE | market_id | coingecko|gate
# ---------------------------------------------------------------------------


def _http_get(url: str) -> str:
    resp = gl.nondet.web.get(url, headers=HTTP_HEADERS)
    if resp.status != 200:
        raise SourceError(f"http {resp.status}")
    body = resp.body
    if body is None:
        raise SourceError("no body")
    return body.decode("utf-8", errors="replace")


def normalized_evidence(
    mid: int, asset: str, coin_id: str, pair: str, target_day: str, cg: str, gt: str, day_start: int
) -> str:
    try:
        cg_open, cg_close = parse_coingecko(_http_get(cg), day_start)
    except Exception:
        return f"{UNAVAILABLE}|{mid}|coingecko"
    try:
        gt_open, gt_close = parse_gate(_http_get(gt), day_start)
    except Exception:
        return f"{UNAVAILABLE}|{mid}|gate"
    cg_dir = direction(cg_open, cg_close)
    gt_dir = direction(gt_open, gt_close)
    return "|".join([
        str(mid), asset, coin_id, pair, target_day,
        str(cg_open), str(cg_close), cg_dir,
        str(gt_open), str(gt_close), gt_dir,
        combine(cg_dir, gt_dir),
    ])


def validate_agreed(parts: list, mid: int, asset: str, coin_id: str, pair: str, target_day: str) -> tuple:
    """Re-validate the agreed payload before any storage write."""
    if len(parts) != EVIDENCE_FIELDS:
        raise gl.vm.UserError(f"{ERR_INVARIANT}: malformed agreed evidence")
    if parts[0] != str(mid) or parts[1] != asset or parts[2] != coin_id or parts[3] != pair or parts[4] != target_day:
        raise gl.vm.UserError(f"{ERR_INVARIANT}: evidence bound to wrong market")
    prices = []
    for idx in (5, 6, 8, 9):
        if not parts[idx].isdigit() or int(parts[idx]) <= 0:
            raise gl.vm.UserError(f"{ERR_INVARIANT}: evidence has bad price")
        prices.append(int(parts[idx]))
    cg_open, cg_close, gt_open, gt_close = prices
    cg_dir, gt_dir, final = parts[7], parts[10], parts[11]
    if direction(cg_open, cg_close) != cg_dir:
        raise gl.vm.UserError(f"{ERR_INVARIANT}: coingecko direction contradicts prices")
    if direction(gt_open, gt_close) != gt_dir:
        raise gl.vm.UserError(f"{ERR_INVARIANT}: gate direction contradicts prices")
    if combine(cg_dir, gt_dir) != final:
        raise gl.vm.UserError(f"{ERR_INVARIANT}: result contradicts directions")
    return cg_open, cg_close, cg_dir, gt_open, gt_close, gt_dir, final
