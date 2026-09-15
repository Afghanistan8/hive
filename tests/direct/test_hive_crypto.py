"""Direct-mode tests for HIVE Daily (contracts/hive_crypto.py)."""

import json

import pytest

from tests.direct.conftest import DAY, GEN, HOUR, hex_addr, warp

CONTRACT = "contracts/hive_crypto.py"

# Target GMT+1 day 2026-10-01 starts at 2026-09-30T23:00:00Z.
TARGET_DAY = "2026-10-01"
DAY_START = 1790809200
CUTOFF = DAY_START
SETTLES_AT = DAY_START + DAY
REFUND_AT = SETTLES_AT + 5 * DAY
BEFORE = DAY_START - 2 * DAY

CG_URL = r".*api\.coingecko\.com.*"
GATE_URL = r".*api\.gateio\.ws.*"


def coingecko_body(open_p: float, close_p: float) -> str:
    prices = []
    for i in range(24):
        ts = DAY_START + i * HOUR
        p = open_p + (close_p - open_p) * i / 23
        prices.append([ts * 1000, round(p, 6)])
    return json.dumps({"prices": prices, "market_caps": [], "total_volumes": []})


def gate_body(open_p: float, close_p: float) -> str:
    rows = []
    for i in range(24):
        ts = DAY_START + i * HOUR
        o = open_p + (close_p - open_p) * i / 24
        c = open_p + (close_p - open_p) * (i + 1) / 24
        rows.append([str(ts), "1000", f"{c:.6f}", f"{max(o, c):.6f}", f"{min(o, c):.6f}",
                     f"{o:.6f}", "10", "true"])
    return json.dumps(rows)


def mock_sources(vm, cg=(100.0, 110.0), gate=(100.0, 110.0), cg_status=200, gate_status=200):
    vm.clear_mocks()
    vm.mock_web(CG_URL, {"status": cg_status, "body": coingecko_body(*cg) if cg_status == 200 else "rate limited"})
    vm.mock_web(GATE_URL, {"status": gate_status, "body": gate_body(*gate) if gate_status == 200 else "down"})


@pytest.fixture
def market(direct_vm, direct_deploy, direct_alice):
    warp(direct_vm, BEFORE)
    contract = direct_deploy(CONTRACT)
    warp(direct_vm, BEFORE)
    direct_vm.sender = direct_alice
    mid = contract.create_market("BTC", TARGET_DAY)
    return contract, int(mid)


def stake(vm, contract, who, mid, side, amount, at=DAY_START - HOUR):
    warp(vm, at)
    vm.sender = who
    vm.value = amount
    try:
        contract.take_position(mid, side)
    finally:
        vm.value = 0


def settle(vm, contract, mid, at=SETTLES_AT + 60, **sources):
    mock_sources(vm, **sources)
    warp(vm, at)
    return contract.resolve_market(mid)


# ---------------------------------------------------------------- creation


def test_create_market_sets_gmt1_lifecycle(direct_vm, market):
    contract, mid = market
    m = contract.get_market(mid)
    assert mid == 1
    assert m["asset"] == "BTC"
    assert m["coingecko_id"] == "bitcoin"
    assert m["gate_pair"] == "BTC_USDT"
    assert m["cutoff_at"] == CUTOFF
    assert m["settles_at"] == SETTLES_AT
    assert m["terminal_refund_at"] == REFUND_AT
    assert m["phase"] == "OPEN"


def test_create_market_rejects_duplicate_unknown_and_past(direct_vm, market):
    contract, _ = market
    with direct_vm.expect_revert("duplicate market"):
        contract.create_market("BTC", TARGET_DAY)
    with direct_vm.expect_revert("unsupported asset"):
        contract.create_market("SHIB", TARGET_DAY)
    with direct_vm.expect_revert("invalid date"):
        contract.create_market("ETH", "20261001")
    warp(direct_vm, DAY_START + 1)
    with direct_vm.expect_revert("already started"):
        contract.create_market("ETH", TARGET_DAY)


def test_create_daily_markets_opens_all_assets_once(direct_vm, market):
    contract, _ = market
    created = contract.create_daily_markets(TARGET_DAY)
    assets = contract.get_supported_assets()
    assert created == len(assets) - 1  # BTC already existed
    assert contract.create_daily_markets(TARGET_DAY) == 0
    assert contract.get_market_by_asset_day("eth", TARGET_DAY)["exists"] is True
    assert len(assets) >= 20


# ---------------------------------------------------------------- staking


def test_stake_bounds(direct_vm, market, direct_bob):
    contract, mid = market
    with direct_vm.expect_revert("below minimum"):
        stake(direct_vm, contract, direct_bob, mid, "UP", 1 * GEN)
    with direct_vm.expect_revert("above maximum"):
        stake(direct_vm, contract, direct_bob, mid, "UP", 9 * GEN)
    stake(direct_vm, contract, direct_bob, mid, "UP", 2 * GEN)
    assert contract.get_market(mid)["up_pool"] == 2 * GEN


def test_same_side_topup_and_side_lock(direct_vm, market, direct_bob):
    contract, mid = market
    stake(direct_vm, contract, direct_bob, mid, "UP", 3 * GEN)
    stake(direct_vm, contract, direct_bob, mid, "up", 4 * GEN)
    pos = contract.get_position(mid, hex_addr(direct_bob))
    assert pos["stake"] == 7 * GEN and pos["side"] == "UP"
    with direct_vm.expect_revert("side switch"):
        stake(direct_vm, contract, direct_bob, mid, "DOWN", 2 * GEN)
    with direct_vm.expect_revert("above maximum"):
        stake(direct_vm, contract, direct_bob, mid, "UP", 2 * GEN)
    assert contract.get_market(mid)["positions_count"] == 1


def test_entries_close_at_cutoff(direct_vm, market, direct_bob):
    contract, mid = market
    with direct_vm.expect_revert("entries closed"):
        stake(direct_vm, contract, direct_bob, mid, "UP", 2 * GEN, at=CUTOFF)


def test_phases_follow_consensus_time(direct_vm, market):
    contract, mid = market
    warp(direct_vm, DAY_START + HOUR)
    assert contract.get_market(mid)["phase"] == "CLOSED"
    warp(direct_vm, SETTLES_AT)
    assert contract.get_market(mid)["phase"] == "READY_TO_SETTLE"


def test_resolve_before_candle_close_rejected(direct_vm, market):
    contract, mid = market
    mock_sources(direct_vm)
    warp(direct_vm, SETTLES_AT - 1)
    with direct_vm.expect_revert("candle not closed"):
        contract.resolve_market(mid)


# ---------------------------------------------------------------- settlement


def test_both_up_pays_winners_pro_rata(direct_vm, market, direct_alice, direct_bob, direct_charlie):
    contract, mid = market
    stake(direct_vm, contract, direct_alice, mid, "UP", 2 * GEN)
    stake(direct_vm, contract, direct_bob, mid, "UP", 4 * GEN)
    stake(direct_vm, contract, direct_charlie, mid, "DOWN", 5 * GEN)

    assert settle(direct_vm, contract, mid, cg=(100.0, 105.5), gate=(100.1, 105.2)) == "UP"
    m = contract.get_market(mid)
    assert m["state"] == "UP" and m["phase"] == "SETTLED" and m["refund_all"] is False

    ev = contract.get_evidence(mid)
    assert ev["coingecko_direction"] == "UP" and ev["gate_direction"] == "UP"
    assert ev["coingecko_open"] == 100 * 10**8
    assert ev["gate_close"] == 10520000000
    assert ev["final_result"] == "UP" and ev["terminal_refund"] is False

    direct_vm.sender = direct_alice
    alice_pay = contract.claim(mid)
    assert alice_pay == (2 * GEN * 11 * GEN) // (6 * GEN)
    direct_vm.sender = direct_bob
    bob_pay = contract.claim(mid)
    assert alice_pay + bob_pay == 11 * GEN  # last winner sweeps dust
    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("nothing to claim"):
        contract.claim(mid)
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("already claimed"):
        contract.claim(mid)
    assert contract.get_market(mid)["paid_out"] == 11 * GEN


def test_both_down_settles_down(direct_vm, market, direct_alice, direct_bob):
    contract, mid = market
    stake(direct_vm, contract, direct_alice, mid, "UP", 3 * GEN)
    stake(direct_vm, contract, direct_bob, mid, "DOWN", 2 * GEN)
    assert settle(direct_vm, contract, mid, cg=(100.0, 90.0), gate=(100.0, 90.0)) == "DOWN"
    direct_vm.sender = direct_bob
    assert contract.claim(mid) == 5 * GEN
    assert contract.get_position(mid, hex_addr(direct_bob))["claimed"] is True


def test_flat_candle_counts_as_down(direct_vm, market):
    contract, mid = market
    assert settle(direct_vm, contract, mid, cg=(100.0, 100.0), gate=(100.0, 100.0)) == "DOWN"


def test_disagreement_is_inconclusive_and_refunds(direct_vm, market, direct_alice, direct_bob):
    contract, mid = market
    stake(direct_vm, contract, direct_alice, mid, "UP", 3 * GEN)
    stake(direct_vm, contract, direct_bob, mid, "DOWN", 2 * GEN)
    assert settle(direct_vm, contract, mid, cg=(100.0, 101.0), gate=(100.0, 99.0)) == "INCONCLUSIVE"
    m = contract.get_market(mid)
    assert m["phase"] == "INCONCLUSIVE" and m["refund_all"] is True
    direct_vm.sender = direct_alice
    assert contract.claim(mid) == 3 * GEN
    direct_vm.sender = direct_bob
    assert contract.claim(mid) == 2 * GEN


def test_zero_winning_pool_refunds_everyone(direct_vm, market, direct_alice):
    contract, mid = market
    stake(direct_vm, contract, direct_alice, mid, "DOWN", 4 * GEN)
    assert settle(direct_vm, contract, mid) == "UP"
    direct_vm.sender = direct_alice
    assert contract.claim(mid) == 4 * GEN


def test_transient_failure_reverts_and_stays_retryable(direct_vm, market, direct_alice):
    contract, mid = market
    stake(direct_vm, contract, direct_alice, mid, "UP", 2 * GEN)
    mock_sources(direct_vm, cg_status=429)
    warp(direct_vm, SETTLES_AT + 60)
    with direct_vm.expect_revert("TRANSIENT"):
        contract.resolve_market(mid)
    m = contract.get_market(mid)
    assert m["state"] == "PENDING" and m["phase"] == "READY_TO_SETTLE"

    mock_sources(direct_vm, gate_status=500)
    with direct_vm.expect_revert("TRANSIENT"):
        contract.resolve_market(mid)

    assert settle(direct_vm, contract, mid) == "UP"


def test_incomplete_gate_window_is_unavailable(direct_vm, market):
    contract, mid = market
    mock_sources(direct_vm)
    rows = json.loads(gate_body(100.0, 110.0))[:-1]
    direct_vm.clear_mocks()
    direct_vm.mock_web(CG_URL, {"status": 200, "body": coingecko_body(100.0, 110.0)})
    direct_vm.mock_web(GATE_URL, {"status": 200, "body": json.dumps(rows)})
    warp(direct_vm, SETTLES_AT + 60)
    with direct_vm.expect_revert("TRANSIENT"):
        contract.resolve_market(mid)


def test_terminal_refund_after_five_days(direct_vm, market, direct_alice, direct_bob):
    contract, mid = market
    stake(direct_vm, contract, direct_alice, mid, "UP", 2 * GEN)
    stake(direct_vm, contract, direct_bob, mid, "DOWN", 6 * GEN)
    mock_sources(direct_vm, cg_status=503, gate_status=503)
    warp(direct_vm, REFUND_AT - 1)
    with direct_vm.expect_revert("TRANSIENT"):
        contract.resolve_market(mid)
    warp(direct_vm, REFUND_AT)
    assert contract.resolve_market(mid) == "INCONCLUSIVE"
    ev = contract.get_evidence(mid)
    assert ev["terminal_refund"] is True and ev["coingecko_direction"] == ""
    assert contract.get_market(mid)["state"] == "REFUNDED"
    direct_vm.sender = direct_bob
    assert contract.claim(mid) == 6 * GEN
    with direct_vm.expect_revert("already resolved"):
        contract.resolve_market(mid)


def test_claim_guards(direct_vm, market, direct_alice, direct_bob):
    contract, mid = market
    stake(direct_vm, contract, direct_alice, mid, "UP", 2 * GEN)
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("not resolved"):
        contract.claim(mid)
    settle(direct_vm, contract, mid)
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("no position"):
        contract.claim(mid)


def test_user_positions_view(direct_vm, market, direct_alice):
    contract, mid = market
    other = contract.create_market("ETH", TARGET_DAY)
    stake(direct_vm, contract, direct_alice, mid, "UP", 2 * GEN)
    stake(direct_vm, contract, direct_alice, other, "DOWN", 3 * GEN)
    rows = contract.get_user_positions(hex_addr(direct_alice), 0, 10)
    assert [r["market"]["asset"] for r in rows] == ["ETH", "BTC"]
    assert rows[0]["side"] == "DOWN" and rows[0]["stake"] == 3 * GEN
    assert len(contract.get_markets(0, 10)) == 2
