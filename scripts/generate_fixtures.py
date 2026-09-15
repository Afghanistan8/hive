"""Build the HIVE Match fixture list for Europe's top five leagues.

Upcoming fixtures come from ESPN's public scoreboard (no key). Each fixture is
checked against the BBC Sport scores page for its date with the contract's own
``narrow_page``, so we only register pairings validators will actually find.
When FOOTBALL_DATA_API_KEY is set, fixtures are also cross-checked against
football-data.org (same kickoff within 15 minutes).

    python scripts/generate_fixtures.py                    # 14 days, 4 per league
    python scripts/generate_fixtures.py --days 10 --per-league 6
    python scripts/generate_fixtures.py --out fixtures.demo.json --dry
"""

import argparse
import html
import json
import os
import re
import sys
import time
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _contract_import import ROOT, load_contract  # noqa: E402

sports = load_contract("hive_sports")

UA = sports.HTTP_HEADERS["User-Agent"]

# football-data.org competition codes for the same five leagues
FOOTBALL_DATA_CODES = {"PL": "PL", "PD": "PD", "BL1": "BL1", "SA": "SA", "FL1": "FL1"}

# ESPN display name -> the label BBC Sport prints, where they differ.
BBC_NAMES = {
    "Hamburg SV": "Hamburger SV",
    "Internazionale": "Inter Milan",
    "Atlético Madrid": "Atletico Madrid",
    "FC Cologne": "Cologne",
    "1. FC Heidenheim 1846": "Heidenheim",
    "Mainz": "Mainz 05",
    "Borussia Mönchengladbach": "Borussia Mönchengladbach",
    "Hellas Verona": "Verona",
    "AS Roma": "Roma",
    "Paris FC": "Paris FC",
    "Stade Rennais": "Rennes",
    "AS Monaco": "Monaco",
    "Olympique Lyonnais": "Lyon",
    "Olympique de Marseille": "Marseille",
    "Deportivo La Coruña": "Deportivo La Coruña",
}


def get(url: str, headers=None) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA, **(headers or {})})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", errors="replace")


def page_text(raw_html: str) -> str:
    text = re.sub(r"<script.*?</script>|<style.*?</style>", " ", raw_html, flags=re.S)
    text = html.unescape(re.sub(r"<[^>]+>", "\n", text))
    return re.sub(r"\n\s*\n+", "\n", text)


def espn_fixtures(league: str, start: datetime, end: datetime) -> list:
    slug = sports.LEAGUES[league][1]
    url = (f"https://site.api.espn.com/apis/site/v2/sports/soccer/{slug}/scoreboard"
           f"?dates={start:%Y%m%d}-{end:%Y%m%d}&limit=200")
    data = json.loads(get(url))
    rows = []
    for event in data.get("events", []):
        comp = event["competitions"][0]
        if comp["status"]["type"].get("state") != "pre":
            continue
        teams = {c["homeAway"]: c["team"] for c in comp["competitors"]}
        kickoff = int(datetime.strptime(event["date"], "%Y-%m-%dT%H:%MZ").replace(tzinfo=timezone.utc).timestamp())
        rows.append({
            "league": league,
            "espn_event_id": str(event["id"]),
            "espn_home": teams["home"]["displayName"],
            "espn_away": teams["away"]["displayName"],
            "espn_home_short": teams["home"].get("shortDisplayName", ""),
            "espn_away_short": teams["away"].get("shortDisplayName", ""),
            "kickoff_ts": kickoff,
        })
    return rows


def pick_bbc_names(row: dict, bbc_text: str) -> tuple:
    homes = [BBC_NAMES.get(row["espn_home"]), row["espn_home"], row["espn_home_short"]]
    aways = [BBC_NAMES.get(row["espn_away"]), row["espn_away"], row["espn_away_short"]]
    for h in [x for x in homes if x]:
        for a in [x for x in aways if x]:
            if sports.fold(h) in sports.fold(bbc_text) and sports.fold(a) in sports.fold(bbc_text) \
                    and sports.narrow_page(bbc_text, h, a):
                return h, a, True
    home = BBC_NAMES.get(row["espn_home"], row["espn_home"])
    away = BBC_NAMES.get(row["espn_away"], row["espn_away"])
    return home, away, bool(sports.narrow_page(bbc_text, home, away))


def football_data_kickoffs(league: str, start: datetime, end: datetime, key: str) -> list:
    url = (f"https://api.football-data.org/v4/competitions/{FOOTBALL_DATA_CODES[league]}/matches"
           f"?dateFrom={start:%Y-%m-%d}&dateTo={end:%Y-%m-%d}")
    data = json.loads(get(url, {"X-Auth-Token": key}))
    return [int(datetime.fromisoformat(m["utcDate"].replace("Z", "+00:00")).timestamp()) for m in data.get("matches", [])]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--days", type=int, default=14)
    parser.add_argument("--per-league", type=int, default=4)
    parser.add_argument("--leagues", default="PL,PD,BL1,SA,FL1")
    parser.add_argument("--out", default=str(ROOT / "fixtures.demo.json"))
    parser.add_argument("--dry", action="store_true")
    args = parser.parse_args()

    now = datetime.now(timezone.utc)
    start, end = now, now + timedelta(days=args.days)
    key = os.environ.get("FOOTBALL_DATA_API_KEY", "")
    min_kickoff = int(now.timestamp()) + 6 * 3600
    bbc_cache = {}
    selected = []

    for league in [x.strip().upper() for x in args.leagues.split(",") if x.strip()]:
        rows = sorted(espn_fixtures(league, start, end), key=lambda r: r["kickoff_ts"])
        fd = football_data_kickoffs(league, start, end, key) if key else None
        count = 0
        for row in rows:
            if count >= args.per_league or row["kickoff_ts"] < min_kickoff:
                continue
            date = datetime.fromtimestamp(row["kickoff_ts"], timezone.utc).strftime("%Y-%m-%d")
            if date not in bbc_cache:
                bbc_cache[date] = page_text(get(sports.bbc_url(row["kickoff_ts"])))
                time.sleep(1)
            home, away, verified = pick_bbc_names(row, bbc_cache[date])
            if not verified:
                print(f"skip {league} {row['espn_home']} v {row['espn_away']}: pairing not found on BBC {date}")
                continue
            if fd is not None and not any(abs(k - row["kickoff_ts"]) <= 900 for k in fd):
                print(f"skip {league} {home} v {away}: kickoff not confirmed by football-data.org")
                continue
            selected.append({
                "match_id": f"{league.lower()}-{row['espn_event_id']}",
                "league": league,
                "espn_event_id": row["espn_event_id"],
                "home": home,
                "away": away,
                "kickoff_ts": row["kickoff_ts"],
                "kickoff_utc": datetime.fromtimestamp(row["kickoff_ts"], timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
                "football_data_checked": fd is not None,
            })
            count += 1
            print(f"ok   {league:<3} {selected[-1]['kickoff_utc']} {home} v {away}")

    selected.sort(key=lambda r: (r["kickoff_ts"], r["league"]))
    if args.dry:
        print(json.dumps(selected, indent=2, ensure_ascii=False))
    else:
        Path(args.out).write_text(json.dumps(selected, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"wrote {len(selected)} fixtures -> {args.out}")
    return 0 if selected else 1


if __name__ == "__main__":
    raise SystemExit(main())
