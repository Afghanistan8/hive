"""Direct-mode tests: position index, usernames and the AI Call."""

import json

from tests.direct import test_hive_sports as sports_t
from tests.direct.test_hive_sports import sports  # noqa: F401  (pytest fixture)
from tests.direct.conftest import GEN, HOUR, hex_addr, warp

STANDINGS_URL = r".*site\.api\.espn\.com/apis/v2/sports/soccer/eng\.1/standings.*"
AI_PROMPT = r"(?s).*Predict the full-time result.*"


def standings_body():
    def entry(rank, name, played, w, d, l, gf, ga, pts):
        stats = {"rank": rank, "gamesPlayed": played, "wins": w, "ties": d, "losses": l,
                 "pointsFor": gf, "pointsAgainst": ga, "points": pts}
        return {"team": {"displayName": name}, "stats": [{"name": k, "displayValue": str(v)} for k, v in stats.items()]}

    return json.dumps({"children": [{"standings": {"entries": [
        entry(2, "Manchester United", 4, 1, 1, 2, 4, 6, 4),
        entry(1, "Manchester City", 4, 4, 0, 0, 8, 2, 12),
    ]}}]})


def mock_ai(vm, output):
    vm.clear_mocks()
    vm.mock_web(STANDINGS_URL, {"status": 200, "body": standings_body()})
    vm.mock_llm(AI_PROMPT, output if isinstance(output, str) else json.dumps(output))


# ---------------------------------------------------------------- positions


def test_global_position_index_lists_every_position(direct_vm, sports, direct_alice, direct_bob):
    sports_t.stake(direct_vm, sports, direct_alice, "HOME", 2 * GEN)
    sports_t.stake(direct_vm, sports, direct_bob, "AWAY", 3 * GEN)
    sports_t.stake(direct_vm, sports, direct_alice, "HOME", 1 * GEN + GEN)  # top-up: no new row
    assert sports.get_position_count() == 2
    rows = sports.get_positions(0, 10)
    assert [(r["owner"], r["pick"], r["stake"]) for r in rows] == [
        (hex_addr(direct_alice), "HOME", 4 * GEN),
        (hex_addr(direct_bob), "AWAY", 3 * GEN),
    ]
    assert rows[0]["league"] == "PL" and rows[0]["fixture_status"] == "OPEN"

    sports_t.mock_sources(direct_vm)
    warp(direct_vm, sports_t.AFTER_FT)
    sports.resolve(sports_t.MATCH_ID)
    rows = sports.get_positions(0, 10)
    assert rows[0]["fixture_result"] == "HOME" and rows[0]["claimable"] == 7 * GEN
    assert rows[1]["claimable"] == 0


# ---------------------------------------------------------------- usernames


def test_usernames_are_unique_and_shown_on_positions(direct_vm, sports, direct_alice, direct_bob):
    direct_vm.sender = direct_alice
    assert sports.set_username("sharp_eye") == "sharp_eye"
    assert sports.get_username(hex_addr(direct_alice)) == "sharp_eye"

    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("already taken"):
        sports.set_username("SHARP_EYE")
    with direct_vm.expect_revert("3-20"):
        sports.set_username("no spaces!")

    direct_vm.sender = direct_alice
    sports.set_username("renamed")  # frees the old name
    direct_vm.sender = direct_bob
    assert sports.set_username("sharp_eye") == "sharp_eye"

    sports_t.stake(direct_vm, sports, direct_bob, "DRAW", 2 * GEN)
    assert sports.get_positions(0, 5)[0]["username"] == "sharp_eye"


# ---------------------------------------------------------------- AI call


def test_ai_call_publishes_pick_and_keeps_exact_agreed_text(direct_vm, sports, direct_charlie):
    output = '```json\n{"pick": "away", "confidence": "HIGH", "reason": "City top with 12 points; United have 4."}\n```'
    mock_ai(direct_vm, output)
    warp(direct_vm, sports_t.KICKOFF - 2 * HOUR)
    direct_vm.sender = direct_charlie
    assert sports.request_ai_call(sports_t.MATCH_ID) == "AWAY"

    call = sports.get_ai_call(sports_t.MATCH_ID)
    assert call["exists"] is True
    assert call["pick"] == "AWAY" and call["confidence"] == "high"
    assert call["reason"] == "City top with 12 points; United have 4."
    assert call["raw"] == output  # the exact agreed text survives
    assert call["requested_by"] == hex_addr(direct_charlie)
    assert sports.get_fixture(sports_t.MATCH_ID)["ai_pick"] == "AWAY"
    assert sports.get_ai_calls(0, 10) == [{
        "match_id": sports_t.MATCH_ID, "league": "PL", "pick": "AWAY", "confidence": "high",
        "fixture_status": "OPEN", "fixture_result": "",
    }]

    with direct_vm.expect_revert("already published"):
        sports.request_ai_call(sports_t.MATCH_ID)


def test_ai_call_accepts_team_name_pick(direct_vm, sports):
    mock_ai(direct_vm, {"pick": "Manchester City", "confidence": "medium", "reason": "Leaders."})
    warp(direct_vm, sports_t.KICKOFF - HOUR)
    assert sports.request_ai_call(sports_t.MATCH_ID) == "HOME"


def test_ai_call_rejects_unusable_output_and_late_requests(direct_vm, sports):
    mock_ai(direct_vm, {"pick": "maybe", "confidence": "low", "reason": "?"})
    warp(direct_vm, sports_t.KICKOFF - HOUR)
    with direct_vm.expect_revert("HOME/DRAW/AWAY"):
        sports.request_ai_call(sports_t.MATCH_ID)
    assert sports.get_ai_call(sports_t.MATCH_ID) == {"exists": False}

    mock_ai(direct_vm, {"pick": "DRAW", "confidence": "low", "reason": "Close."})
    warp(direct_vm, sports_t.KICKOFF)
    with direct_vm.expect_revert("close at kickoff"):
        sports.request_ai_call(sports_t.MATCH_ID)
