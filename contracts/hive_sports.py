# { "Depends": "py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng" }
"""HIVE Match — pari-mutuel 1X2 markets for Europe's top five leagues.

One contract hosts many fixtures. Anyone may register an upcoming fixture,
stake on HOME / DRAW / AWAY before kickoff, and trigger settlement after it.

Settlement is 2-of-2 under ``gl.eq_principle.strict_eq``. Every validator:

  * reads ESPN's public scoreboard JSON for the league + kickoff date and
    extracts the fixture by its ESPN event id (deterministic parser)
  * renders BBC Sport's scores page for the same date, narrows it to the text
    around this pairing, and asks its own LLM for a *structured* reading
    {status, home_goals, away_goals} with the competition named and a club
    alias guide — never free-form prose

The canonical JSON they must agree on carries both readings plus the derived
outcome. A result is only final when both sources report the same finished
score. Unfinished / conflicting / unavailable evidence leaves the fixture
open and retryable; both sources reporting a postponement opens 1:1 refunds;
evidence that never converges within 7 days of kickoff refunds everyone.

No owner, no admin, no resolver key, no rake.
"""

import json
import unicodedata
from dataclasses import dataclass

import genlayer as gl
from genlayer.storage import allow as allow_storage


GEN = 10**18
MIN_STAKE = 2 * GEN
DAY = 86_400
HOUR = 3_600
RESOLVE_DELAY = 90 * 60  # a league match cannot be over sooner
POSTPONE_GRACE = 3 * HOUR
TERMINAL_REFUND_DELAY = 7 * DAY
MIN_LEAD = 10 * 60
MAX_FORWARD = 60 * DAY
MAX_PAGE = 50
MAX_BATCH = 40
MAX_ESPN_BYTES = 600_000
WINDOW_RADIUS = 350
MAX_WINDOWS = 4
# ESPN rejects many generic/browser user agents; this honest curl-style one is accepted.
HTTP_HEADERS = {"Accept": "application/json", "User-Agent": "curl/8.5.0 (HIVE GenLayer validator)"}

# code -> (competition name used in prompts, ESPN league slug)
LEAGUES = {
    "PL": ("English Premier League", "eng.1"),
    "PD": ("Spanish La Liga", "esp.1"),
    "BL1": ("German Bundesliga", "ger.1"),
    "SA": ("Italian Serie A", "ita.1"),
    "FL1": ("French Ligue 1", "fra.1"),
}
LEAGUE_CODES = ("PL", "PD", "BL1", "SA", "FL1")

PICK_HOME = "HOME"
PICK_DRAW = "DRAW"
PICK_AWAY = "AWAY"
PICKS = (PICK_HOME, PICK_DRAW, PICK_AWAY)

# Source reading statuses
SRC_FINISHED = "FINISHED"
SRC_POSTPONED = "POSTPONED"
SRC_NOT_FINISHED = "NOT_FINISHED"
SRC_NOT_FOUND = "NOT_FOUND"
SRC_UNAVAILABLE = "UNAVAILABLE"

# Agreed outcomes
OUT_PENDING = "PENDING"
OUT_CONFLICT = "CONFLICT"
OUT_POSTPONED = "POSTPONED"
OUT_UNAVAILABLE = "UNAVAILABLE"

# Stored status
ST_OPEN = "OPEN"
ST_SETTLED = "SETTLED"
ST_POSTPONED = "POSTPONED"
ST_REFUNDED = "REFUNDED"

ESPN_POSTPONED = ("STATUS_POSTPONED", "STATUS_CANCELED", "STATUS_CANCELLED", "STATUS_ABANDONED", "STATUS_SUSPENDED")

ALIASES = {
    "PL": """English Premier League name guide (match by club identity, not spelling):
  "Man City" / "Manchester City FC" = "Manchester City"
  "Man Utd" / "Man United" / "Manchester United FC" = "Manchester United"
  "Spurs" / "Tottenham" = "Tottenham Hotspur"
  "Wolves" / "Wolverhampton" = "Wolverhampton Wanderers"
  "Newcastle" = "Newcastle United"; "West Ham" = "West Ham United"
  "Brighton" / "Brighton and Hove Albion" = "Brighton & Hove Albion"
  "Nott'm Forest" / "Nottm Forest" / "Forest" = "Nottingham Forest"
  "Bournemouth" / "AFC Bournemouth"; "Leeds" = "Leeds United"; "Ipswich" = "Ipswich Town"
Traps: Manchester City and Manchester United are different clubs. Men's Premier
League only — ignore Women's Super League, Premier League 2, cups and the EFL.""",
    "PD": """Spanish La Liga name guide (match by club identity, not spelling):
  "Barca" / "FC Barcelona" = "Barcelona"; "Real Madrid CF" = "Real Madrid"
  "Atletico" / "Atlético de Madrid" / "Atl Madrid" = "Atletico Madrid"
  "Athletic Club" / "Athletic Bilbao" / "Athletic" = "Athletic Club"
  "Real Betis Balompié" / "Betis" = "Real Betis"; "Real Sociedad de Fútbol" = "Real Sociedad"
  "Celta" / "RC Celta" = "Celta Vigo"; "Deportivo Alavés" / "Alaves" = "Alaves"
  "RCD Mallorca" = "Mallorca"; "RCD Espanyol" = "Espanyol"; "Rayo" = "Rayo Vallecano"
  "Deportivo" / "Deportivo La Coruña" / "Depor" = "Deportivo La Coruna"; "Malaga CF" = "Malaga"
Traps: Athletic Club (Bilbao) and Atletico Madrid are different clubs; Real Madrid,
Real Betis, Real Sociedad, Real Oviedo are four different clubs. Accents may be stripped.""",
    "BL1": """German Bundesliga name guide (match by club identity, not spelling):
  "FC Bayern" / "Bayern München" / "Bayern Munchen" = "Bayern Munich"
  "BVB" / "Dortmund" = "Borussia Dortmund"; "Leipzig" = "RB Leipzig"
  "Bayer 04 Leverkusen" / "Leverkusen" = "Bayer Leverkusen"
  "Borussia Mönchengladbach" / "Borussia M'gladbach" / "Gladbach" = "Borussia Monchengladbach"
  "1. FC Köln" / "FC Koln" / "Cologne" = "Koln"; "1. FSV Mainz 05" / "Mainz" = "Mainz 05"
  "Hamburg SV" / "HSV" / "Hamburg" = "Hamburger SV"; "SV 07 Elversberg" = "Elversberg"
  "TSG Hoffenheim" / "1899 Hoffenheim" = "Hoffenheim"; "Werder" = "Werder Bremen"
  "1. FC Union Berlin" / "Union" = "Union Berlin"; "FC St. Pauli" = "St Pauli"
Traps: Borussia Dortmund and Borussia Monchengladbach are different clubs; Union Berlin
and Hertha BSC are different clubs. Umlaut and stripped spellings are the same club.""",
    "SA": """Italian Serie A name guide (match by club identity, not spelling):
  "Inter" / "Internazionale" / "Inter Milan" / "FC Internazionale Milano" = "Inter Milan"
  "AC Milan" / "Milan" = "AC Milan"; "Juve" / "Juventus FC" = "Juventus"
  "AS Roma" / "Roma" = "Roma"; "SS Lazio" = "Lazio"; "SSC Napoli" = "Napoli"
  "Atalanta BC" = "Atalanta"; "ACF Fiorentina" = "Fiorentina"; "Hellas Verona" / "Verona" = "Verona"
  "US Lecce" = "Lecce"; "AC Monza" = "Monza"; "US Sassuolo" = "Sassuolo"; "Torino FC" = "Torino"
Traps: Inter Milan and AC Milan are different clubs; Roma and Lazio are different clubs.
Serie A only — ignore Serie B, Coppa Italia and women's football.""",
    "FL1": """French Ligue 1 name guide (match by club identity, not spelling):
  "PSG" / "Paris SG" / "Paris Saint Germain" = "Paris Saint-Germain"
  "Paris FC" is a different club from Paris Saint-Germain; a bare "Paris" is ambiguous.
  "OM" / "Olympique de Marseille" = "Marseille"; "OL" / "Olympique Lyonnais" / "Lyon" = "Lyon"
  "AS Monaco" = "Monaco"; "LOSC" / "Lille OSC" = "Lille"; "Stade Rennais" = "Rennes"
  "OGC Nice" = "Nice"; "RC Lens" = "Lens"; "Stade Brestois 29" = "Brest"
  "RC Strasbourg Alsace" = "Strasbourg"; "ESTAC Troyes" = "Troyes"; "Le Mans FC" = "Le Mans"
  "AS Saint-Étienne" / "Saint-Etienne" = "Saint-Etienne"; "AJ Auxerre" = "Auxerre"
Traps: Le Havre and Le Mans are different clubs; Lens and Lille are different clubs.""",
}


@gl.evm.contract_interface
class _Wallet:
    """Payout target. Winners are wallets (EVM accounts), so payouts are external
    EVM value transfers; an internal GenLayer message to a wallet is skipped and
    its value returned to the sender (observed on Studio Next)."""

    class View:
        pass

    class Write:
        pass


# ---------------------------------------------------------------------------
# Time helpers
# ---------------------------------------------------------------------------

_DAYS_IN_MONTH = (31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31)


def _days_in_month(y: int, m: int) -> int:
    if m == 2 and ((y % 4 == 0 and y % 100 != 0) or y % 400 == 0):
        return 29
    return _DAYS_IN_MONTH[m - 1]


def _days_from_civil(y: int, m: int, d: int) -> int:
    y -= 1 if m <= 2 else 0
    era = (y if y >= 0 else y - 399) // 400
    yoe = y - era * 400
    doy = (153 * (m + (-3 if m > 2 else 9)) + 2) // 5 + d - 1
    doe = yoe * 365 + yoe // 4 - yoe // 100 + doy
    return era * 146097 + doe - 719468


def utc_date(ts: int) -> tuple:
    z = ts // DAY + 719468
    era = (z if z >= 0 else z - 146096) // 146097
    doe = z - era * 146097
    yoe = (doe - doe // 1460 + doe // 36524 - doe // 146096) // 365
    doy = doe - (365 * yoe + yoe // 4 - yoe // 100)
    mp = (5 * doy + 2) // 153
    d = doy - (153 * mp + 2) // 5 + 1
    m = mp + 3 if mp < 10 else mp - 9
    y = yoe + era * 400 + (1 if m <= 2 else 0)
    return y, m, d


def parse_iso_utc(s: str) -> int:
    if not isinstance(s, str) or len(s) < 19 or s[4] != "-" or s[7] != "-" or s[13] != ":" or s[16] != ":":
        raise gl.vm.UserError("INVARIANT: bad transaction datetime")
    parts = (s[0:4], s[5:7], s[8:10], s[11:13], s[14:16], s[17:19])
    for p in parts:
        if not p.isdigit():
            raise gl.vm.UserError("INVARIANT: bad transaction datetime")
    y, mo, d, hh, mi, sec = (int(p) for p in parts)
    if mo < 1 or mo > 12 or d < 1 or d > _days_in_month(y, mo) or hh > 23 or mi > 59 or sec > 60:
        raise gl.vm.UserError("INVARIANT: bad transaction datetime")
    return _days_from_civil(y, mo, d) * DAY + hh * 3600 + mi * 60 + sec


def consensus_now() -> int:
    return parse_iso_utc(str(gl.message.raw["datetime"]))


# ---------------------------------------------------------------------------
# Source templates + deterministic parsing
# ---------------------------------------------------------------------------


def espn_url(league: str, kickoff_ts: int) -> str:
    y, m, d = utc_date(kickoff_ts)
    return (
        "https://site.api.espn.com/apis/site/v2/sports/soccer/"
        + LEAGUES[league][1]
        + f"/scoreboard?dates={y:04d}{m:02d}{d:02d}"
    )


def bbc_url(kickoff_ts: int) -> str:
    y, m, d = utc_date(kickoff_ts)
    return f"https://www.bbc.com/sport/football/scores-fixtures/{y:04d}-{m:02d}-{d:02d}"


def _goals(value) -> int:
    if isinstance(value, bool):
        return -1
    if isinstance(value, int):
        return value if 0 <= value <= 99 else -1
    if isinstance(value, str) and value.strip().isdigit():
        g = int(value.strip())
        return g if g <= 99 else -1
    return -1


def reading(status: str, home_goals: int = -1, away_goals: int = -1) -> dict:
    if status != SRC_FINISHED:
        home_goals, away_goals = -1, -1
    return {"status": status, "home_goals": home_goals, "away_goals": away_goals}


def parse_espn(raw: str, event_id: str) -> dict:
    """ESPN scoreboard JSON -> {status, home_goals, away_goals}."""
    if not raw or len(raw) > MAX_ESPN_BYTES:
        return reading(SRC_UNAVAILABLE)
    try:
        data = json.loads(raw)
    except Exception:
        return reading(SRC_UNAVAILABLE)
    events = data.get("events") if isinstance(data, dict) else None
    if not isinstance(events, list):
        return reading(SRC_UNAVAILABLE)
    for event in events:
        if not isinstance(event, dict) or str(event.get("id", "")) != event_id:
            continue
        comps = event.get("competitions") or []
        if not comps or not isinstance(comps[0], dict):
            return reading(SRC_UNAVAILABLE)
        comp = comps[0]
        st = (comp.get("status") or event.get("status") or {}).get("type") or {}
        name = str(st.get("name", ""))
        if name in ESPN_POSTPONED:
            return reading(SRC_POSTPONED)
        if st.get("completed") is True and st.get("state") == "post":
            home, away = -1, -1
            for c in comp.get("competitors") or []:
                if not isinstance(c, dict):
                    continue
                if c.get("homeAway") == "home":
                    home = _goals(c.get("score"))
                elif c.get("homeAway") == "away":
                    away = _goals(c.get("score"))
            if home < 0 or away < 0:
                return reading(SRC_UNAVAILABLE)
            return reading(SRC_FINISHED, home, away)
        return reading(SRC_NOT_FINISHED)
    return reading(SRC_NOT_FOUND)


def fold(text: str) -> str:
    decomposed = unicodedata.normalize("NFKD", text)
    return "".join(ch for ch in decomposed if not unicodedata.combining(ch)).lower()


def _key_token(name: str) -> str:
    words = [w for w in fold(name).replace("-", " ").replace(".", " ").split() if len(w) >= 4]
    if not words:
        return fold(name)
    return max(words, key=len)


def narrow_page(page: str, home: str, away: str) -> str:
    """Return short windows of page text where the two clubs appear together.

    Deterministic, so every validator sends its LLM the same slice of the
    same page. Empty string when the pairing is absent.
    """
    folded = fold(page)
    for h, a in ((fold(home), fold(away)), (_key_token(home), _key_token(away))):
        windows = []
        start = 0
        while len(windows) < MAX_WINDOWS:
            i = folded.find(h, start)
            if i < 0:
                break
            lo = max(0, i - WINDOW_RADIUS)
            hi = min(len(page), i + len(h) + WINDOW_RADIUS)
            if folded.find(a, lo, hi) >= 0:
                windows.append(page[lo:hi])
            start = i + len(h)
        if windows:
            return "\n...\n".join(windows)
    return ""


def derive_outcome(espn: dict, bbc: dict) -> str:
    es, bs = espn["status"], bbc["status"]
    if es == SRC_UNAVAILABLE or bs == SRC_UNAVAILABLE:
        return OUT_UNAVAILABLE
    if es == SRC_FINISHED and bs == SRC_FINISHED:
        if espn["home_goals"] != bbc["home_goals"] or espn["away_goals"] != bbc["away_goals"]:
            return OUT_CONFLICT
        if espn["home_goals"] > espn["away_goals"]:
            return PICK_HOME
        if espn["home_goals"] < espn["away_goals"]:
            return PICK_AWAY
        return PICK_DRAW
    if es == SRC_POSTPONED and bs == SRC_POSTPONED:
        return OUT_POSTPONED
    if (es == SRC_FINISHED and bs == SRC_POSTPONED) or (es == SRC_POSTPONED and bs == SRC_FINISHED):
        return OUT_CONFLICT
    return OUT_PENDING


def bbc_prompt(league: str, home: str, away: str, kickoff_date: str, snippet: str) -> str:
    return f"""You are one of several independent validators settling a football fixture.
Read ONLY the page excerpt below (BBC Sport scores page for {kickoff_date}).

Competition: {LEAGUES[league][0]}
Home team: {home}
Away team: {away}

{ALIASES[league]}

The page lists many competitions. Judge only the {LEAGUES[league][0]} fixture
between these two clubs, with {home} at home.

Classify it:
- "FINISHED": the page shows a full-time (FT) score for this fixture.
- "POSTPONED": the page explicitly says postponed, called off, cancelled or abandoned.
- "NOT_FINISHED": scheduled, kick-off time shown, or still in play.
- "NOT_FOUND": this fixture is not in the excerpt.

Excerpt:
<<<
{snippet}
>>>

Respond with JSON only:
{{"status": "FINISHED" | "POSTPONED" | "NOT_FINISHED" | "NOT_FOUND", "home_goals": int, "away_goals": int}}
Use -1 for both goal fields unless status is FINISHED. home_goals are {home}'s goals."""


def normalize_llm(result) -> dict:
    if isinstance(result, str):
        text = result.strip().replace("```json", "").replace("```", "")
        lo, hi = text.find("{"), text.rfind("}")
        try:
            result = json.loads(text[lo : hi + 1]) if lo >= 0 and hi > lo else {}
        except Exception:
            result = {}
    if not isinstance(result, dict):
        return reading(SRC_UNAVAILABLE)
    status = str(result.get("status", "")).strip().upper().replace(" ", "_")
    if status not in (SRC_FINISHED, SRC_POSTPONED, SRC_NOT_FINISHED, SRC_NOT_FOUND):
        return reading(SRC_UNAVAILABLE)
    if status == SRC_FINISHED:
        home, away = _goals(result.get("home_goals")), _goals(result.get("away_goals"))
        if home < 0 or away < 0:
            return reading(SRC_UNAVAILABLE)
        return reading(SRC_FINISHED, home, away)
    return reading(status)


def canonical(payload: dict) -> str:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"))


def collect_evidence(match_id: str, league: str, event_id: str, home: str, away: str, kickoff_ts: int) -> str:
    """Nondet worker: both readings + derived outcome as canonical JSON."""
    try:
        resp = gl.nondet.web.get(espn_url(league, kickoff_ts), headers=HTTP_HEADERS)
        body = resp.body.decode("utf-8", errors="replace") if resp.status == 200 and resp.body else ""
        espn = parse_espn(body, event_id)
    except Exception:
        espn = reading(SRC_UNAVAILABLE)

    try:
        page = gl.nondet.web.render(bbc_url(kickoff_ts), mode="text")
        snippet = narrow_page(page or "", home, away)
        if not snippet:
            bbc = reading(SRC_NOT_FOUND)
        else:
            y, m, d = utc_date(kickoff_ts)
            prompt = bbc_prompt(league, home, away, f"{y:04d}-{m:02d}-{d:02d}", snippet)
            bbc = normalize_llm(gl.nondet.exec_prompt(prompt, response_format="json"))
    except Exception:
        bbc = reading(SRC_UNAVAILABLE)

    return canonical({
        "match_id": match_id,
        "source_a": "espn",
        "source_b": "bbc",
        "espn": espn,
        "bbc": bbc,
        "outcome": derive_outcome(espn, bbc),
    })


def validate_agreed(agreed: str, match_id: str) -> dict:
    try:
        payload = json.loads(agreed)
    except Exception:
        raise gl.vm.UserError("INVARIANT: malformed agreed evidence")
    if not isinstance(payload, dict) or payload.get("match_id") != match_id:
        raise gl.vm.UserError("INVARIANT: evidence bound to wrong fixture")
    for src in ("espn", "bbc"):
        r = payload.get(src)
        if not isinstance(r, dict) or canonical(reading(str(r.get("status")), r.get("home_goals", -1), r.get("away_goals", -1))) != canonical(r):
            raise gl.vm.UserError("INVARIANT: malformed source reading")
    if derive_outcome(payload["espn"], payload["bbc"]) != payload.get("outcome"):
        raise gl.vm.UserError("INVARIANT: outcome contradicts source readings")
    return payload


# ---------------------------------------------------------------------------
# AI Call: validators' pre-match pick (holds and moves no funds)
# ---------------------------------------------------------------------------

AI_CONFIDENCE = ("low", "medium", "high")
MAX_AI_RAW = 1200
USERNAME_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-."


def standings_url(league: str) -> str:
    return "https://site.api.espn.com/apis/v2/sports/soccer/" + LEAGUES[league][1] + "/standings"


def compact_standings(raw: str) -> str:
    """ESPN standings JSON -> one short line per club, deterministic ordering."""
    data = json.loads(raw)
    children = data.get("children") or []
    if not children:
        raise gl.vm.UserError("EXTERNAL: standings unavailable")
    entries = (children[0].get("standings") or {}).get("entries") or []
    rows = []
    for e in entries:
        team = (e.get("team") or {}).get("displayName", "?")
        stats = {}
        for st in e.get("stats") or []:
            stats[str(st.get("name"))] = str(st.get("displayValue", ""))
        rows.append((int(stats.get("rank", "99") or 99), team, stats))
    rows.sort(key=lambda r: r[0])
    lines = []
    for rank, team, st in rows:
        lines.append(
            f"{rank}. {team} P{st.get('gamesPlayed', '?')} W{st.get('wins', '?')} D{st.get('ties', '?')} "
            f"L{st.get('losses', '?')} GF{st.get('pointsFor', '?')} GA{st.get('pointsAgainst', '?')} Pts{st.get('points', '?')}"
        )
    if not lines:
        raise gl.vm.UserError("EXTERNAL: standings empty")
    return "\n".join(lines)


def ai_task(league: str, home: str, away: str) -> str:
    return (
        f"Predict the full-time result of this {LEAGUES[league][0]} fixture: {home} (home) vs {away} (away). "
        "The input is the current league table. Use it (form, points, goal difference, home advantage) as evidence. "
        'Respond with JSON only: {"pick": "HOME" | "DRAW" | "AWAY", "confidence": "low" | "medium" | "high", '
        '"reason": "one sentence under 200 characters citing the table"}'
    )


AI_CRITERIA = (
    "The output is JSON with pick exactly HOME, DRAW or AWAY, confidence exactly low, medium or high, and a single-sentence "
    "reason under 200 characters. The reason refers to the two named clubs and is consistent with the league table in the "
    "input; the pick is a defensible forecast from that evidence (it need not be the only reasonable pick)."
)


def parse_ai_call(raw: str, home: str, away: str) -> dict:
    """Deterministic post-consensus normalisation of the agreed model output."""
    text = str(raw).strip().replace("```json", "").replace("```", "").strip()
    obj = {}
    lo, hi = text.find("{"), text.rfind("}")
    if lo >= 0 and hi > lo:
        try:
            parsed = json.loads(text[lo : hi + 1])
            if isinstance(parsed, dict):
                obj = parsed
        except Exception:
            obj = {}
    pick = str(obj.get("pick", "")).strip().upper().replace(" WIN", "")
    aliases = {"H": PICK_HOME, "1": PICK_HOME, "A": PICK_AWAY, "2": PICK_AWAY, "D": PICK_DRAW, "X": PICK_DRAW, "TIE": PICK_DRAW}
    pick = aliases.get(pick, pick)
    if pick not in PICKS:
        name = fold(pick)
        if name and name == fold(home):
            pick = PICK_HOME
        elif name and name == fold(away):
            pick = PICK_AWAY
    if pick not in PICKS:
        raise gl.vm.UserError("EXTERNAL: AI call did not produce a HOME/DRAW/AWAY pick")
    confidence = str(obj.get("confidence", "medium")).strip().lower()
    if confidence not in AI_CONFIDENCE:
        confidence = "medium"
    reason = " ".join(str(obj.get("reason", "")).split())[:280]
    return {"pick": pick, "confidence": confidence, "reason": reason}


# ---------------------------------------------------------------------------
# Storage
# ---------------------------------------------------------------------------


@allow_storage
@dataclass
class Fixture:
    match_id: str
    league: str
    home: str
    away: str
    espn_event_id: str
    kickoff_ts: gl.u256
    creator: str
    created_at: gl.u256
    status: str
    result: str
    home_goals: gl.u256
    away_goals: gl.u256
    pool_home: gl.u256
    pool_draw: gl.u256
    pool_away: gl.u256
    paid_out: gl.u256
    winning_stake_claimed: gl.u256
    positions_count: gl.u256
    refund_all: bool
    resolved_at: gl.u256


@allow_storage
@dataclass
class Position:
    match_id: str
    owner: str
    pick: str
    stake: gl.u256
    claimed: bool
    payout: gl.u256


class HiveSports(gl.contract.Contract):
    fixture_count: gl.u256
    fixture_ids: gl.storage.TreeMap[gl.u256, str]  # 1-based index -> match_id
    fixtures: gl.storage.TreeMap[str, Fixture]
    positions: gl.storage.TreeMap[str, Position]  # "match_id|owner"
    user_count: gl.storage.TreeMap[str, gl.u256]
    user_index: gl.storage.TreeMap[str, str]  # "owner|i" -> match_id
    evidence: gl.storage.TreeMap[str, str]  # match_id -> agreed canonical JSON
    position_count: gl.u256
    position_keys: gl.storage.TreeMap[gl.u256, str]  # 1-based -> "match_id|owner"
    usernames: gl.storage.TreeMap[str, str]  # owner -> display name
    username_owner: gl.storage.TreeMap[str, str]  # lowercase name -> owner
    ai_calls: gl.storage.TreeMap[str, str]  # match_id -> canonical JSON (includes the exact agreed text)

    def __init__(self) -> None:
        self.fixture_count = 0
        self.position_count = 0

    # ---- helpers ------------------------------------------------------------

    def _sender(self) -> str:
        return gl.message.sender_address.as_hex.lower()

    def _fixture(self, match_id: str) -> Fixture:
        if match_id not in self.fixtures:
            raise gl.vm.UserError("EXPECTED: unknown fixture")
        return self.fixtures[match_id]

    def _phase(self, f: Fixture, now: int) -> str:
        if f.status == ST_SETTLED:
            return "SETTLED"
        if f.status == ST_POSTPONED:
            return "POSTPONED"
        if f.status == ST_REFUNDED:
            return "INCONCLUSIVE"
        kickoff = int(f.kickoff_ts)
        if now < kickoff:
            return "OPEN"
        if now < kickoff + RESOLVE_DELAY:
            return "CLOSED"
        return "READY_TO_SETTLE"

    def _add(self, league: str, espn_event_id: str, home: str, away: str, kickoff_ts: int, now: int) -> str:
        league = str(league).upper()
        if league not in LEAGUES:
            raise gl.vm.UserError("EXPECTED: league must be PL, PD, BL1, SA or FL1")
        event_id = str(espn_event_id).strip()
        if not event_id.isdigit() or len(event_id) > 12:
            raise gl.vm.UserError("EXPECTED: invalid ESPN event id")
        home, away = str(home).strip(), str(away).strip()
        if not (2 <= len(home) <= 48 and 2 <= len(away) <= 48) or fold(home) == fold(away):
            raise gl.vm.UserError("EXPECTED: invalid team names")
        if "|" in home or "|" in away:
            raise gl.vm.UserError("EXPECTED: invalid team names")
        kickoff = int(kickoff_ts)
        if kickoff < now + MIN_LEAD:
            raise gl.vm.UserError("EXPECTED: kickoff must be at least 10 minutes ahead")
        if kickoff > now + MAX_FORWARD:
            raise gl.vm.UserError("EXPECTED: kickoff too far ahead")
        match_id = f"{league.lower()}-{event_id}"
        if match_id in self.fixtures:
            raise gl.vm.UserError("EXPECTED: fixture already registered")
        idx = int(self.fixture_count) + 1
        self.fixture_count = idx
        self.fixture_ids[idx] = match_id
        self.fixtures[match_id] = Fixture(
            match_id=match_id, league=league, home=home, away=away, espn_event_id=event_id,
            kickoff_ts=kickoff, creator=self._sender(), created_at=now, status=ST_OPEN, result="",
            home_goals=0, away_goals=0, pool_home=0, pool_draw=0, pool_away=0, paid_out=0,
            winning_stake_claimed=0, positions_count=0, refund_all=False, resolved_at=0,
        )
        return match_id

    # ---- writes: registry ---------------------------------------------------

    @gl.public.write
    def add_fixture(self, league: str, espn_event_id: str, home: str, away: str, kickoff_ts: int) -> str:
        """Any caller. match_id is derived as '<league>-<espn_event_id>'."""
        return self._add(league, espn_event_id, home, away, kickoff_ts, consensus_now())

    @gl.public.write
    def add_fixtures(self, fixtures_json: str) -> int:
        """Any caller. JSON list of {league, espn_event_id, home, away, kickoff_ts};
        already-registered fixtures are skipped."""
        try:
            rows = json.loads(fixtures_json)
        except Exception:
            raise gl.vm.UserError("EXPECTED: fixtures_json is not valid JSON")
        if not isinstance(rows, list) or len(rows) > MAX_BATCH:
            raise gl.vm.UserError("EXPECTED: fixtures_json must be a list of at most 40 rows")
        now = consensus_now()
        added = 0
        for row in rows:
            if not isinstance(row, dict):
                raise gl.vm.UserError("EXPECTED: fixture row must be an object")
            mid = f"{str(row.get('league', '')).lower()}-{str(row.get('espn_event_id', '')).strip()}"
            if mid in self.fixtures:
                continue
            self._add(row.get("league", ""), row.get("espn_event_id", ""), row.get("home", ""),
                      row.get("away", ""), int(row.get("kickoff_ts", 0)), now)
            added += 1
        return added

    # ---- writes: staking ----------------------------------------------------

    @gl.public.write.payable
    def predict(self, match_id: str, pick: str) -> None:
        f = self._fixture(match_id)
        if f.status != ST_OPEN or consensus_now() >= int(f.kickoff_ts):
            raise gl.vm.UserError("EXPECTED: betting closed at kickoff")
        pick = str(pick).upper()
        if pick not in PICKS:
            raise gl.vm.UserError("EXPECTED: pick must be HOME, DRAW or AWAY")
        value = int(gl.message.value)
        if value < MIN_STAKE:
            raise gl.vm.UserError("EXPECTED: minimum stake is 2 GEN")
        owner = self._sender()
        pkey = f"{match_id}|{owner}"
        if pkey in self.positions:
            pos = self.positions[pkey]
            if pos.pick != pick:
                raise gl.vm.UserError("EXPECTED: one side per wallet; same-side top-ups only")
            pos.stake = int(pos.stake) + value
        else:
            self.positions[pkey] = Position(match_id=match_id, owner=owner, pick=pick, stake=value, claimed=False, payout=0)
            i = int(self.user_count.get(owner, 0))
            self.user_index[f"{owner}|{i}"] = match_id
            self.user_count[owner] = i + 1
            f.positions_count = int(f.positions_count) + 1
            n = int(self.position_count) + 1
            self.position_keys[n] = pkey
            self.position_count = n
        if pick == PICK_HOME:
            f.pool_home = int(f.pool_home) + value
        elif pick == PICK_DRAW:
            f.pool_draw = int(f.pool_draw) + value
        else:
            f.pool_away = int(f.pool_away) + value

    # ---- writes: settlement -------------------------------------------------

    def _agree(self, f: Fixture) -> tuple:
        match_id, league, event_id = f.match_id, f.league, f.espn_event_id
        home, away, kickoff = f.home, f.away, int(f.kickoff_ts)

        def worker() -> str:
            return collect_evidence(match_id, league, event_id, home, away, kickoff)

        agreed = gl.eq_principle.strict_eq(worker)
        return validate_agreed(agreed, match_id), agreed

    @gl.public.write
    def resolve(self, match_id: str) -> str:
        """Any caller, 90 minutes after kickoff. Settles only on 2-of-2 agreement."""
        f = self._fixture(match_id)
        if f.status != ST_OPEN:
            raise gl.vm.UserError("EXPECTED: fixture already closed out")
        now = consensus_now()
        if now < int(f.kickoff_ts) + RESOLVE_DELAY:
            raise gl.vm.UserError("EXPECTED: too early to resolve")
        payload, agreed = self._agree(f)
        outcome = payload["outcome"]

        if outcome in PICKS:
            self.evidence[match_id] = agreed
            f.status = ST_SETTLED
            f.result = outcome
            f.home_goals = payload["espn"]["home_goals"]
            f.away_goals = payload["espn"]["away_goals"]
            f.refund_all = self._pool_for(f, outcome) == 0
            f.resolved_at = now
            return outcome

        if now >= int(f.kickoff_ts) + TERMINAL_REFUND_DELAY:
            self.evidence[match_id] = agreed
            f.status = ST_REFUNDED
            f.refund_all = True
            f.resolved_at = now
            return "REFUNDED"

        if outcome == OUT_POSTPONED:
            raise gl.vm.UserError("EXPECTED: sources report a postponement; call mark_postponed")
        raise gl.vm.UserError(f"TRANSIENT: no 2-of-2 result yet ({outcome}); retry later")

    @gl.public.write
    def mark_postponed(self, match_id: str) -> str:
        """Any caller, 3h after kickoff. Refunds only if BOTH sources confirm."""
        f = self._fixture(match_id)
        if f.status != ST_OPEN:
            raise gl.vm.UserError("EXPECTED: fixture already closed out")
        now = consensus_now()
        if now < int(f.kickoff_ts) + POSTPONE_GRACE:
            raise gl.vm.UserError("EXPECTED: too early: match may still be in play")
        payload, agreed = self._agree(f)
        if payload["outcome"] != OUT_POSTPONED:
            raise gl.vm.UserError(f"EXPECTED: sources do not both confirm a postponement ({payload['outcome']})")
        self.evidence[match_id] = agreed
        f.status = ST_POSTPONED
        f.refund_all = True
        f.resolved_at = now
        return ST_POSTPONED

    # ---- writes: payouts ----------------------------------------------------

    @gl.public.write
    def claim(self, match_id: str) -> int:
        return self._claim(match_id)

    @gl.public.write
    def refund(self, match_id: str) -> int:
        """Alias of claim for postponed / refunded fixtures."""
        if not self._fixture(match_id).refund_all:
            raise gl.vm.UserError("EXPECTED: refunds not available for this fixture")
        return self._claim(match_id)

    def _claim(self, match_id: str) -> int:
        f = self._fixture(match_id)
        if f.status == ST_OPEN:
            raise gl.vm.UserError("EXPECTED: fixture not settled yet")
        owner = self._sender()
        pkey = f"{match_id}|{owner}"
        if pkey not in self.positions:
            raise gl.vm.UserError("EXPECTED: no position")
        pos = self.positions[pkey]
        if pos.claimed:
            raise gl.vm.UserError("EXPECTED: already claimed")
        payout = self._payout(f, pos)
        if payout <= 0:
            raise gl.vm.UserError("EXPECTED: nothing to claim")
        if int(f.paid_out) + payout > self._total(f):
            raise gl.vm.UserError("INVARIANT: payout exceeds pool")

        # Transfer first; a failed emit reverts everything and keeps it claimable.
        _Wallet(gl.message.sender_address).emit_transfer(payout)

        pos.claimed = True
        pos.payout = payout
        f.paid_out = int(f.paid_out) + payout
        if not f.refund_all:
            f.winning_stake_claimed = int(f.winning_stake_claimed) + int(pos.stake)
        return payout

    def _total(self, f: Fixture) -> int:
        return int(f.pool_home) + int(f.pool_draw) + int(f.pool_away)

    def _pool_for(self, f: Fixture, pick: str) -> int:
        if pick == PICK_HOME:
            return int(f.pool_home)
        if pick == PICK_DRAW:
            return int(f.pool_draw)
        return int(f.pool_away)

    def _payout(self, f: Fixture, pos: Position) -> int:
        stake = int(pos.stake)
        if f.status == ST_OPEN:
            return 0
        if f.refund_all:
            return stake
        if pos.pick != f.result:
            return 0
        winning_pool = self._pool_for(f, f.result)
        total = self._total(f)
        if int(f.winning_stake_claimed) + stake >= winning_pool:
            return total - int(f.paid_out)  # last winner sweeps rounding dust
        return (stake * total) // winning_pool

    # ---- writes: profile + AI call ------------------------------------------

    @gl.public.write
    def set_username(self, name: str) -> str:
        """Any wallet. 3–20 chars of letters, digits, _ - . ; unique (case-insensitive)."""
        name = str(name).strip()
        if not (3 <= len(name) <= 20) or any(ch not in USERNAME_CHARS for ch in name):
            raise gl.vm.UserError("EXPECTED: username must be 3-20 letters, digits, _ - or .")
        owner = self._sender()
        key = name.lower()
        holder = self.username_owner.get(key, "")
        if holder and holder != owner:
            raise gl.vm.UserError("EXPECTED: username already taken")
        previous = self.usernames.get(owner, "")
        if previous and previous.lower() != key:
            self.username_owner[previous.lower()] = ""
        self.usernames[owner] = name
        self.username_owner[key] = owner
        return name

    @gl.public.write
    def request_ai_call(self, match_id: str) -> str:
        """Any caller, before kickoff, once per fixture. Validators publish a pre-match pick.

        Uses the non-comparative equivalence principle: the leader's model forecasts
        from the live league table, and every validator's model checks the forecast
        against fixed criteria. The agreed text is stored verbatim next to the
        normalised pick. No funds are touched.
        """
        f = self._fixture(match_id)
        if f.status != ST_OPEN or consensus_now() >= int(f.kickoff_ts):
            raise gl.vm.UserError("EXPECTED: AI calls close at kickoff")
        if match_id in self.ai_calls:
            raise gl.vm.UserError("EXPECTED: AI call already published for this fixture")
        league, home, away = f.league, f.home, f.away
        url = standings_url(league)

        def evidence() -> str:
            resp = gl.nondet.web.get(url, headers=HTTP_HEADERS)
            if resp.status != 200 or not resp.body:
                raise gl.vm.UserError("EXTERNAL: standings unavailable")
            return compact_standings(resp.body.decode("utf-8", errors="replace"))

        raw = gl.eq_principle.prompt_non_comparative(evidence, task=ai_task(league, home, away), criteria=AI_CRITERIA)
        raw = str(raw)[:MAX_AI_RAW]
        call = parse_ai_call(raw, home, away)
        call["raw"] = raw
        call["requested_by"] = self._sender()
        call["requested_at"] = consensus_now()
        self.ai_calls[match_id] = canonical(call)
        return call["pick"]

    # ---- views --------------------------------------------------------------

    @gl.public.view
    def get_leagues(self) -> list:
        return [{"code": c, "name": LEAGUES[c][0], "espn_slug": LEAGUES[c][1]} for c in LEAGUE_CODES]

    @gl.public.view
    def get_config(self) -> dict:
        return {
            "min_stake": MIN_STAKE,
            "resolve_delay": RESOLVE_DELAY,
            "postpone_grace": POSTPONE_GRACE,
            "terminal_refund_delay": TERMINAL_REFUND_DELAY,
            "fixture_count": int(self.fixture_count),
            "now": consensus_now(),
        }

    @gl.public.view
    def get_fixture(self, match_id: str) -> dict:
        return self._fixture_dict(self._fixture(match_id), consensus_now())

    @gl.public.view
    def get_fixtures(self, offset: int, limit: int) -> list:
        """Registration order, oldest first."""
        now = consensus_now()
        lim = min(max(int(limit), 0), MAX_PAGE)
        i = max(int(offset), 0) + 1
        total = int(self.fixture_count)
        out = []
        while i <= total and len(out) < lim:
            out.append(self._fixture_dict(self.fixtures[self.fixture_ids[i]], now))
            i += 1
        return out

    @gl.public.view
    def get_position(self, match_id: str, wallet: str) -> dict:
        owner = str(wallet).lower()
        pkey = f"{match_id}|{owner}"
        if pkey not in self.positions:
            return {"exists": False, "match_id": match_id, "pick": "", "stake": 0, "claimed": False,
                    "payout": 0, "claimable": 0}
        p = self.positions[pkey]
        f = self.fixtures[match_id]
        return {
            "exists": True, "match_id": match_id, "pick": p.pick, "stake": int(p.stake),
            "claimed": p.claimed, "payout": int(p.payout),
            "claimable": 0 if p.claimed else self._payout(f, p),
        }

    @gl.public.view
    def get_user_positions(self, wallet: str, offset: int, limit: int) -> list:
        owner = str(wallet).lower()
        now = consensus_now()
        cnt = int(self.user_count.get(owner, 0))
        lim = min(max(int(limit), 0), MAX_PAGE)
        i = cnt - 1 - max(int(offset), 0)
        out = []
        while i >= 0 and len(out) < lim:
            mid = self.user_index[f"{owner}|{i}"]
            f = self.fixtures[mid]
            p = self.positions[f"{mid}|{owner}"]
            out.append({
                "fixture": self._fixture_dict(f, now), "pick": p.pick, "stake": int(p.stake),
                "claimed": p.claimed, "payout": int(p.payout),
                "claimable": 0 if p.claimed else self._payout(f, p),
            })
            i -= 1
        return out

    @gl.public.view
    def get_evidence(self, match_id: str) -> dict:
        if match_id not in self.evidence:
            return {"exists": False}
        payload = json.loads(self.evidence[match_id])
        payload["exists"] = True
        return payload

    @gl.public.view
    def get_evidence_raw(self, match_id: str) -> str:
        """The exact canonical JSON validators agreed on, byte for byte ("" if none)."""
        return self.evidence.get(match_id, "")

    @gl.public.view
    def get_source_urls(self, match_id: str) -> dict:
        f = self._fixture(match_id)
        return {"espn": espn_url(f.league, int(f.kickoff_ts)), "bbc": bbc_url(int(f.kickoff_ts))}

    @gl.public.view
    def get_positions(self, offset: int, limit: int) -> list:
        """Every position ever opened, oldest first — enough to rebuild a leaderboard."""
        lim = min(max(int(limit), 0), MAX_PAGE)
        i = max(int(offset), 0) + 1
        total = int(self.position_count)
        out = []
        while i <= total and len(out) < lim:
            p = self.positions[self.position_keys[i]]
            f = self.fixtures[p.match_id]
            out.append({
                "match_id": p.match_id, "league": f.league, "owner": p.owner,
                "username": self.usernames.get(p.owner, ""), "pick": p.pick, "stake": int(p.stake),
                "claimed": p.claimed, "payout": int(p.payout),
                "claimable": 0 if p.claimed else self._payout(f, p),
                "fixture_status": f.status, "fixture_result": f.result, "refund_all": f.refund_all,
            })
            i += 1
        return out

    @gl.public.view
    def get_position_count(self) -> int:
        return int(self.position_count)

    @gl.public.view
    def get_username(self, wallet: str) -> str:
        return self.usernames.get(str(wallet).lower(), "")

    @gl.public.view
    def get_ai_call(self, match_id: str) -> dict:
        if match_id not in self.ai_calls:
            return {"exists": False}
        call = json.loads(self.ai_calls[match_id])
        call["exists"] = True
        return call

    @gl.public.view
    def get_ai_calls(self, offset: int, limit: int) -> list:
        """AI calls in fixture registration order, with the fixture outcome for scoring."""
        lim = min(max(int(limit), 0), MAX_PAGE)
        i = max(int(offset), 0) + 1
        total = int(self.fixture_count)
        out = []
        while i <= total and len(out) < lim:
            mid = self.fixture_ids[i]
            if mid in self.ai_calls:
                call = json.loads(self.ai_calls[mid])
                f = self.fixtures[mid]
                out.append({"match_id": mid, "league": f.league, "pick": call["pick"], "confidence": call["confidence"],
                            "fixture_status": f.status, "fixture_result": f.result})
            i += 1
        return out

    def _fixture_dict(self, f: Fixture, now: int) -> dict:
        return {
            "match_id": f.match_id, "league": f.league, "league_name": LEAGUES[f.league][0],
            "home": f.home, "away": f.away, "espn_event_id": f.espn_event_id,
            "kickoff_ts": int(f.kickoff_ts), "creator": f.creator, "created_at": int(f.created_at),
            "status": f.status, "result": f.result,
            "home_goals": int(f.home_goals), "away_goals": int(f.away_goals),
            "pool_home": int(f.pool_home), "pool_draw": int(f.pool_draw), "pool_away": int(f.pool_away),
            "total_pool": self._total(f), "paid_out": int(f.paid_out),
            "positions_count": int(f.positions_count), "refund_all": f.refund_all,
            "resolved_at": int(f.resolved_at), "phase": self._phase(f, now),
            "ai_pick": json.loads(self.ai_calls[f.match_id])["pick"] if f.match_id in self.ai_calls else "",
        }
