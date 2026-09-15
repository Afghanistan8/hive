"""Regression tests: what validators agree on is exactly what gets stored.

For both contracts the extracted values (scaled prices, directions, per-source
score readings) must survive the full path — nondet worker -> strict_eq ->
re-validation -> storage -> view — byte for byte. These tests recompute the
expected canonical payload independently from the mocked source data and
compare it to the stored value.

Real validator re-execution (independent fetches + LLM, strict_eq agreement) is
covered on the live network by scripts/smoke (see tests/runtime/README.md);
gltest's direct runner only executes the leader side.
"""

import json

from tests.direct import test_hive_crypto as crypto_t
from tests.direct import test_hive_sports as sports_t
from tests.direct.test_hive_sports import sports  # noqa: F401  (pytest fixture)
from tests.direct.conftest import DAY, GEN, warp


def _canonical(obj) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"))


# ---------------------------------------------------------------- crypto


def _gate_rows(open_s: str, close_s: str):
    rows = []
    for i in range(24):
        ts = crypto_t.DAY_START + i * 3600
        o = open_s if i == 0 else "100.5"
        c = close_s if i == 23 else "100.5"
        rows.append([str(ts), "1", c, "101", "99", o, "1", "true"])
    return json.dumps(rows)


def _cg_body(open_v, close_v):
    prices = [[(crypto_t.DAY_START + i * 3600) * 1000, 100.5] for i in range(24)]
    prices[0][1] = open_v
    prices[-1][1] = close_v
    return json.dumps({"prices": prices})


def test_crypto_exact_agreed_payload_is_stored(direct_vm, direct_deploy, direct_alice):
    warp(direct_vm, crypto_t.BEFORE)
    c = direct_deploy(crypto_t.CONTRACT)
    warp(direct_vm, crypto_t.BEFORE)
    direct_vm.sender = direct_alice
    mid = c.create_market("ATOM", crypto_t.TARGET_DAY)

    direct_vm.clear_mocks()
    # Awkward real-world precision: more than 8 decimals must truncate, not round.
    direct_vm.mock_web(crypto_t.CG_URL, {"status": 200, "body": _cg_body(1.575852869999, 1.580710599)})
    direct_vm.mock_web(crypto_t.GATE_URL, {"status": 200, "body": _gate_rows("1.583", "1.58")})
    warp(direct_vm, crypto_t.SETTLES_AT + 60)
    assert c.resolve_market(mid) == "INCONCLUSIVE"

    expected = "|".join([
        str(mid), "ATOM", "cosmos", "ATOM_USDT", crypto_t.TARGET_DAY,
        "157585286", "158071059", "UP",
        "158300000", "158000000", "DOWN",
        "INCONCLUSIVE",
    ])
    ev = c.get_evidence(mid)
    assert ev["agreed_payload"] == expected
    assert (ev["coingecko_open"], ev["coingecko_close"]) == (157585286, 158071059)
    assert (ev["gate_open"], ev["gate_close"]) == (158300000, 158000000)
    assert ev["coingecko_direction"] == "UP" and ev["gate_direction"] == "DOWN"


def test_crypto_terminal_refund_keeps_agreed_unavailable_payload(direct_vm, direct_deploy, direct_alice):
    warp(direct_vm, crypto_t.BEFORE)
    c = direct_deploy(crypto_t.CONTRACT)
    warp(direct_vm, crypto_t.BEFORE)
    direct_vm.sender = direct_alice
    mid = c.create_market("BTC", crypto_t.TARGET_DAY)
    crypto_t.mock_sources(direct_vm, gate_status=503)
    warp(direct_vm, crypto_t.REFUND_AT)
    assert c.resolve_market(mid) == "INCONCLUSIVE"
    assert c.get_evidence(mid)["agreed_payload"] == f"UNAVAILABLE|{mid}|gate"


# ---------------------------------------------------------------- sports


def test_sports_exact_agreed_payload_is_stored(direct_vm, sports, direct_bob):
    sports_t.stake(direct_vm, sports, direct_bob, "HOME", 2 * GEN)
    sports_t.mock_sources(direct_vm)
    warp(direct_vm, sports_t.AFTER_FT)
    assert sports.resolve(sports_t.MATCH_ID) == "HOME"

    expected = _canonical({
        "match_id": sports_t.MATCH_ID,
        "source_a": "espn",
        "source_b": "bbc",
        "espn": {"status": "FINISHED", "home_goals": 2, "away_goals": 1},
        "bbc": {"status": "FINISHED", "home_goals": 2, "away_goals": 1},
        "outcome": "HOME",
    })
    assert sports.get_evidence_raw(sports_t.MATCH_ID) == expected
    # The structured reading also surfaces through the parsed view unchanged.
    ev = sports.get_evidence(sports_t.MATCH_ID)
    assert ev["bbc"] == {"status": "FINISHED", "home_goals": 2, "away_goals": 1}


def test_sports_distinct_source_readings_both_survive(direct_vm, sports, direct_bob):
    """When sources disagree, each source's own extracted score is preserved."""
    sports_t.stake(direct_vm, sports, direct_bob, "AWAY", 2 * GEN)
    sports_t.mock_sources(direct_vm, llm={"status": "FINISHED", "home_goals": 3, "away_goals": 3})
    warp(direct_vm, sports_t.KICKOFF + 7 * DAY)
    assert sports.resolve(sports_t.MATCH_ID) == "REFUNDED"
    raw = sports.get_evidence_raw(sports_t.MATCH_ID)
    assert raw == _canonical({
        "match_id": sports_t.MATCH_ID,
        "source_a": "espn",
        "source_b": "bbc",
        "espn": {"status": "FINISHED", "home_goals": 2, "away_goals": 1},
        "bbc": {"status": "FINISHED", "home_goals": 3, "away_goals": 3},
        "outcome": "CONFLICT",
    })


def test_sports_empty_raw_evidence_before_settlement(direct_vm, sports):
    assert sports.get_evidence_raw(sports_t.MATCH_ID) == ""
