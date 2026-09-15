"""Direct-mode tests for HIVE Match (contracts/hive_sports.py)."""

import json

import pytest

from tests.direct.conftest import DAY, GEN, HOUR, hex_addr, mock_json_llm, warp

CONTRACT = "contracts/hive_sports.py"

KICKOFF = 1791036000  # 2026-10-03T14:00:00Z
BEFORE = KICKOFF - 2 * DAY
AFTER_FT = KICKOFF + 2 * HOUR
EVENT_ID = "401879999"
MATCH_ID = "pl-401879999"
HOME, AWAY = "Manchester City", "Manchester United"

ESPN_URL = r".*site\.api\.espn\.com/apis/site/v2/sports/soccer/eng\.1/scoreboard\?dates=20261003.*"
BBC_URL = r".*bbc\.com/sport/football/scores-fixtures/2026-10-03.*"
LLM_PROMPT = r".*independent validators settling a football fixture.*"


def espn_body(status="STATUS_FULL_TIME", home=2, away=1, event_id=EVENT_ID):
    completed = status == "STATUS_FULL_TIME"
    event = {
        "id": event_id,
        "competitions": [{
            "status": {"type": {"name": status, "state": "post" if completed else "pre", "completed": completed}},
            "competitors": [
                {"homeAway": "home", "score": str(home), "team": {"displayName": HOME}},
                {"homeAway": "away", "score": str(away), "team": {"displayName": AWAY}},
            ],
        }],
    }
    decoy = json.loads(json.dumps(event))
    decoy["id"] = "401870000"
    return json.dumps({"events": [decoy, event]})


def bbc_page(line=f"{HOME} 2 , {AWAY} 1 at Full time"):
    return (
        "Premier League\nArsenal 1 , Chelsea 1 at Full time\n"
        f"{line}\nFT\nWomen's Super League\nManchester United 0 , Chelsea 5 at Full time\n"
    )


def mock_sources(vm, espn=None, bbc_text=None, llm=None, espn_status=200):
    vm.clear_mocks()
    vm.mock_web(ESPN_URL, {"status": espn_status, "body": espn if espn is not None else espn_body()})
    vm.mock_web(BBC_URL, {"status": 200, "body": bbc_text if bbc_text is not None else bbc_page()})
    mock_json_llm(vm, LLM_PROMPT, llm if llm is not None else {"status": "FINISHED", "home_goals": 2, "away_goals": 1})


@pytest.fixture
def sports(direct_vm, direct_deploy, direct_alice):
    warp(direct_vm, BEFORE)
    contract = direct_deploy(CONTRACT)
    warp(direct_vm, BEFORE)
    direct_vm.sender = direct_alice
    assert contract.add_fixture("PL", EVENT_ID, HOME, AWAY, KICKOFF) == MATCH_ID
    return contract


def stake(vm, contract, who, pick, amount, at=KICKOFF - HOUR, match_id=MATCH_ID):
    warp(vm, at)
    vm.sender = who
    vm.value = amount
    try:
        contract.predict(match_id, pick)
    finally:
        vm.value = 0


# ---------------------------------------------------------------- registry


def test_fixture_registry(direct_vm, sports):
    f = sports.get_fixture(MATCH_ID)
    assert f["league"] == "PL" and f["home"] == HOME and f["away"] == AWAY
    assert f["kickoff_ts"] == KICKOFF and f["phase"] == "OPEN" and f["status"] == "OPEN"
    urls = sports.get_source_urls(MATCH_ID)
    assert urls["espn"].endswith("/eng.1/scoreboard?dates=20261003")
    assert urls["bbc"].endswith("/scores-fixtures/2026-10-03")
    with direct_vm.expect_revert("already registered"):
        sports.add_fixture("PL", EVENT_ID, HOME, AWAY, KICKOFF)
    with direct_vm.expect_revert("league must be"):
        sports.add_fixture("MLS", "1", HOME, AWAY, KICKOFF)
    with direct_vm.expect_revert("at least 10 minutes"):
        sports.add_fixture("PL", "402", HOME, AWAY, BEFORE + 60)


def test_batch_registration_skips_existing(direct_vm, sports):
    rows = [
        {"league": "PL", "espn_event_id": EVENT_ID, "home": HOME, "away": AWAY, "kickoff_ts": KICKOFF},
        {"league": "SA", "espn_event_id": "401874000", "home": "Inter Milan", "away": "AC Milan", "kickoff_ts": KICKOFF + DAY},
        {"league": "FL1", "espn_event_id": "401876000", "home": "Paris Saint-Germain", "away": "Paris FC", "kickoff_ts": KICKOFF + DAY},
    ]
    assert sports.add_fixtures(json.dumps(rows)) == 2
    fixtures = sports.get_fixtures(0, 10)
    assert [f["match_id"] for f in fixtures] == [MATCH_ID, "sa-401874000", "fl1-401876000"]
    assert sports.get_config()["fixture_count"] == 3


# ---------------------------------------------------------------- staking


def test_stake_before_and_after_kickoff(direct_vm, sports, direct_bob):
    with direct_vm.expect_revert("minimum stake"):
        stake(direct_vm, sports, direct_bob, "HOME", GEN)
    with direct_vm.expect_revert("pick must be"):
        stake(direct_vm, sports, direct_bob, "WIN", 2 * GEN)
    stake(direct_vm, sports, direct_bob, "HOME", 2 * GEN)
    with direct_vm.expect_revert("betting closed"):
        stake(direct_vm, sports, direct_bob, "HOME", 2 * GEN, at=KICKOFF)


def test_1x2_pools_topups_and_side_lock(direct_vm, sports, direct_alice, direct_bob, direct_charlie):
    stake(direct_vm, sports, direct_alice, "HOME", 3 * GEN)
    stake(direct_vm, sports, direct_bob, "DRAW", 2 * GEN)
    stake(direct_vm, sports, direct_charlie, "AWAY", 5 * GEN)
    stake(direct_vm, sports, direct_alice, "home", 2 * GEN)
    with direct_vm.expect_revert("same-side top-ups"):
        stake(direct_vm, sports, direct_alice, "AWAY", 2 * GEN)
    f = sports.get_fixture(MATCH_ID)
    assert (f["pool_home"], f["pool_draw"], f["pool_away"]) == (5 * GEN, 2 * GEN, 5 * GEN)
    assert f["total_pool"] == 12 * GEN and f["positions_count"] == 3
    rows = sports.get_user_positions(hex_addr(direct_alice), 0, 5)
    assert rows[0]["pick"] == "HOME" and rows[0]["stake"] == 5 * GEN


# ---------------------------------------------------------------- settlement


def test_both_sources_agree_settles_and_pays(direct_vm, sports, direct_alice, direct_bob, direct_charlie):
    stake(direct_vm, sports, direct_alice, "HOME", 2 * GEN)
    stake(direct_vm, sports, direct_bob, "HOME", 6 * GEN)
    stake(direct_vm, sports, direct_charlie, "AWAY", 3 * GEN)

    warp(direct_vm, KICKOFF + HOUR)
    with direct_vm.expect_revert("too early"):
        sports.resolve(MATCH_ID)

    mock_sources(direct_vm)
    warp(direct_vm, AFTER_FT)
    assert sports.resolve(MATCH_ID) == "HOME"
    f = sports.get_fixture(MATCH_ID)
    assert f["status"] == "SETTLED" and f["phase"] == "SETTLED"
    assert (f["home_goals"], f["away_goals"]) == (2, 1)

    ev = sports.get_evidence(MATCH_ID)
    assert ev["exists"] is True and ev["outcome"] == "HOME"
    assert ev["espn"] == {"status": "FINISHED", "home_goals": 2, "away_goals": 1}
    assert ev["bbc"] == ev["espn"]
    assert ev["source_a"] == "espn" and ev["source_b"] == "bbc"

    direct_vm.sender = direct_alice
    alice = sports.claim(MATCH_ID)
    assert alice == (2 * GEN * 11 * GEN) // (8 * GEN)
    direct_vm.sender = direct_bob
    assert alice + sports.claim(MATCH_ID) == 11 * GEN
    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("nothing to claim"):
        sports.claim(MATCH_ID)
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("already claimed"):
        sports.claim(MATCH_ID)
    with direct_vm.expect_revert("already closed out"):
        sports.resolve(MATCH_ID)


def test_draw_result(direct_vm, sports, direct_bob):
    stake(direct_vm, sports, direct_bob, "DRAW", 2 * GEN)
    mock_sources(direct_vm, espn=espn_body(home=1, away=1), bbc_text=bbc_page(f"{HOME} 1 , {AWAY} 1 at Full time"),
                 llm={"status": "FINISHED", "home_goals": 1, "away_goals": 1})
    warp(direct_vm, AFTER_FT)
    assert sports.resolve(MATCH_ID) == "DRAW"
    direct_vm.sender = direct_bob
    assert sports.claim(MATCH_ID) == 2 * GEN


def test_sources_disagree_stays_open(direct_vm, sports, direct_bob):
    stake(direct_vm, sports, direct_bob, "HOME", 2 * GEN)
    mock_sources(direct_vm, llm={"status": "FINISHED", "home_goals": 1, "away_goals": 1})
    warp(direct_vm, AFTER_FT)
    with direct_vm.expect_revert("CONFLICT"):
        sports.resolve(MATCH_ID)
    assert sports.get_fixture(MATCH_ID)["status"] == "OPEN"
    assert sports.get_evidence(MATCH_ID)["exists"] is False


def test_not_finished_and_unavailable_are_retryable(direct_vm, sports):
    mock_sources(direct_vm, espn=espn_body(status="STATUS_SECOND_HALF"), llm={"status": "NOT_FINISHED", "home_goals": -1, "away_goals": -1})
    warp(direct_vm, AFTER_FT)
    with direct_vm.expect_revert("PENDING"):
        sports.resolve(MATCH_ID)
    mock_sources(direct_vm, espn_status=503, espn="")
    with direct_vm.expect_revert("UNAVAILABLE"):
        sports.resolve(MATCH_ID)
    mock_sources(direct_vm)
    assert sports.resolve(MATCH_ID) == "HOME"


def test_pairing_missing_from_bbc_is_not_found(direct_vm, sports):
    mock_sources(direct_vm, bbc_text="Premier League\nArsenal 1 , Chelsea 1 at Full time\n")
    warp(direct_vm, AFTER_FT)
    with direct_vm.expect_revert("PENDING"):
        sports.resolve(MATCH_ID)


def test_malformed_llm_reading_is_unavailable(direct_vm, sports):
    mock_sources(direct_vm, llm={"status": "FINISHED", "home_goals": "two", "away_goals": 1})
    warp(direct_vm, AFTER_FT)
    with direct_vm.expect_revert("UNAVAILABLE"):
        sports.resolve(MATCH_ID)


def test_postpone_and_refund(direct_vm, sports, direct_alice, direct_bob):
    stake(direct_vm, sports, direct_alice, "HOME", 4 * GEN)
    stake(direct_vm, sports, direct_bob, "AWAY", 3 * GEN)
    mock_sources(direct_vm, espn=espn_body(status="STATUS_POSTPONED"),
                 bbc_text=bbc_page(f"{HOME} versus {AWAY} Postponed"),
                 llm={"status": "POSTPONED", "home_goals": -1, "away_goals": -1})
    warp(direct_vm, KICKOFF + 2 * HOUR)
    with direct_vm.expect_revert("too early"):
        sports.mark_postponed(MATCH_ID)
    with direct_vm.expect_revert("call mark_postponed"):
        sports.resolve(MATCH_ID)
    warp(direct_vm, KICKOFF + 3 * HOUR)
    assert sports.mark_postponed(MATCH_ID) == "POSTPONED"
    f = sports.get_fixture(MATCH_ID)
    assert f["phase"] == "POSTPONED" and f["refund_all"] is True
    direct_vm.sender = direct_alice
    assert sports.refund(MATCH_ID) == 4 * GEN
    direct_vm.sender = direct_bob
    assert sports.claim(MATCH_ID) == 3 * GEN


def test_postpone_requires_both_sources(direct_vm, sports):
    mock_sources(direct_vm, espn=espn_body(status="STATUS_POSTPONED"))
    warp(direct_vm, KICKOFF + 4 * HOUR)
    with direct_vm.expect_revert("do not both confirm"):
        sports.mark_postponed(MATCH_ID)
    mock_sources(direct_vm)
    with direct_vm.expect_revert("do not both confirm"):
        sports.mark_postponed(MATCH_ID)
    assert sports.get_fixture(MATCH_ID)["status"] == "OPEN"


def test_refund_alias_rejected_for_settled_fixture(direct_vm, sports, direct_bob):
    stake(direct_vm, sports, direct_bob, "HOME", 2 * GEN)
    mock_sources(direct_vm)
    warp(direct_vm, AFTER_FT)
    sports.resolve(MATCH_ID)
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("refunds not available"):
        sports.refund(MATCH_ID)


def test_terminal_refund_after_seven_days(direct_vm, sports, direct_bob):
    stake(direct_vm, sports, direct_bob, "AWAY", 5 * GEN)
    mock_sources(direct_vm, llm={"status": "FINISHED", "home_goals": 0, "away_goals": 0})
    warp(direct_vm, KICKOFF + 7 * DAY)
    assert sports.resolve(MATCH_ID) == "REFUNDED"
    f = sports.get_fixture(MATCH_ID)
    assert f["phase"] == "INCONCLUSIVE" and f["refund_all"] is True
    assert sports.get_evidence(MATCH_ID)["outcome"] == "CONFLICT"
    direct_vm.sender = direct_bob
    assert sports.claim(MATCH_ID) == 5 * GEN


def test_winning_pool_empty_refunds_all(direct_vm, sports, direct_bob):
    stake(direct_vm, sports, direct_bob, "AWAY", 2 * GEN)
    mock_sources(direct_vm)
    warp(direct_vm, AFTER_FT)
    assert sports.resolve(MATCH_ID) == "HOME"
    direct_vm.sender = direct_bob
    assert sports.get_position(MATCH_ID, hex_addr(direct_bob))["claimable"] == 2 * GEN
    assert sports.claim(MATCH_ID) == 2 * GEN
