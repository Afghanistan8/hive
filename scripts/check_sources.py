"""Verify every HIVE Daily asset against BOTH settlement sources.

For each asset in contracts/hive_crypto.py this fetches CoinGecko and Gate.io
for the most recent completed GMT+1 day and runs the contract's own parsers.
Exits non-zero if any asset cannot reconstruct a candle from both sources, so
a dead pair fails CI / local checks before it can strand a market.

    python scripts/check_sources.py              # all assets, last completed day
    python scripts/check_sources.py --day 2026-09-13 --assets BTC,ETH
    python scripts/check_sources.py --json
"""

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _contract_import import load_contract  # noqa: E402

crypto = load_contract("hive_crypto")

USER_AGENT = crypto.HTTP_HEADERS["User-Agent"]


def last_completed_gmt1_day() -> str:
    gmt1_now = datetime.now(timezone.utc) + timedelta(hours=1)
    return (gmt1_now.date() - timedelta(days=1)).isoformat()


def fetch(url: str, retries: int = 4) -> str:
    delay = 20
    for attempt in range(retries + 1):
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=25) as resp:
                return resp.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as err:
            if err.code == 429 and attempt < retries:
                time.sleep(delay)
                delay *= 2
                continue
            raise


def check_asset(asset: str, day: str) -> dict:
    day_start = crypto.gmt1_day_start_utc(day)
    row = {"asset": asset, "day": day}
    for label, url_fn, parser in (
        ("coingecko", crypto.coingecko_url, crypto.parse_coingecko),
        ("gate", crypto.gate_url, crypto.parse_gate),
    ):
        url = url_fn(asset, day_start)
        try:
            open_p, close_p = parser(fetch(url), day_start)
            row[label] = {"ok": True, "open": open_p, "close": close_p,
                          "direction": crypto.direction(open_p, close_p)}
        except Exception as exc:  # noqa: BLE001 - report every failure mode
            row[label] = {"ok": False, "error": str(exc), "url": url}
    if row["coingecko"]["ok"] and row["gate"]["ok"]:
        row["final"] = crypto.combine(row["coingecko"]["direction"], row["gate"]["direction"])
    else:
        row["final"] = "UNAVAILABLE"
    return row


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--day", default=None, help="GMT+1 day YYYY-MM-DD (default: last completed)")
    parser.add_argument("--assets", default="", help="comma-separated subset")
    parser.add_argument("--pace", type=float, default=6.0, help="seconds between assets (CoinGecko rate limit)")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    day = args.day or last_completed_gmt1_day()
    assets = [a.strip().upper() for a in args.assets.split(",") if a.strip()] or list(crypto.ASSETS)
    unknown = [a for a in assets if a not in crypto.ASSET_SOURCES]
    if unknown:
        print(f"unknown assets: {unknown}", file=sys.stderr)
        return 2

    results = []
    for i, asset in enumerate(assets):
        if i:
            time.sleep(args.pace)
        results.append(check_asset(asset, day))
        if not args.json:
            r = results[-1]
            cg = r["coingecko"]
            gt = r["gate"]
            fmt = lambda s: f"{s['direction']:<4} {s['open'] / 1e8:>14.6f} -> {s['close'] / 1e8:<14.6f}" if s["ok"] else f"FAIL {s['error']}"
            print(f"{asset:<5} coingecko {fmt(cg)} | gate {fmt(gt)} | {r['final']}", flush=True)

    dead = [r["asset"] for r in results if r["final"] == "UNAVAILABLE"]
    if args.json:
        print(json.dumps({"day": day, "results": results, "dead": dead}, indent=2))
    else:
        print(f"\nGMT+1 day {day}: {len(results) - len(dead)}/{len(results)} assets verified on both sources")
        if dead:
            print(f"DEAD: {', '.join(dead)}")
    return 1 if dead else 0


if __name__ == "__main__":
    raise SystemExit(main())
