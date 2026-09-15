"""Refresh and seed the HIVE demo on Studio Next.

1. (optional) regenerate fixtures.demo.json from ESPN, verified against BBC
2. run `genlayer deploy` — deploy scripts skip contracts that are already live
   with the same code, then 003_seed_demo.ts opens crypto markets for the next
   GMT+1 days and registers the demo fixtures (both are permissionless writes)
3. print what is on-chain

    python scripts/demo_seed.py                 # seed with the checked-in fixtures
    python scripts/demo_seed.py --refresh       # regenerate fixtures first
    python scripts/demo_seed.py --days 3        # open 3 future GMT+1 days
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def run(cmd, env=None):
    print("$", " ".join(cmd), flush=True)
    return subprocess.run(cmd, cwd=ROOT, env=env, check=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--refresh", action="store_true", help="regenerate fixtures.demo.json first")
    parser.add_argument("--days", type=int, default=2, help="future GMT+1 days to open")
    args = parser.parse_args()

    if args.refresh:
        run([sys.executable, str(ROOT / "scripts" / "generate_fixtures.py")])

    npx = shutil.which("npx") or shutil.which("npx.cmd")
    if not npx:
        print("npx not found — install Node.js", file=sys.stderr)
        return 1
    env = {**os.environ, "HIVE_SEED_DAYS": str(args.days)}
    run([npx, "genlayer", "deploy"], env=env)

    state = json.loads((ROOT / "deploy" / "deployments.json").read_text())
    for name, info in state["contracts"].items():
        print(f"{name}: {info['address']} (tx {info['txHash']})")
    last = (state.get("seeds") or [{}])[-1]
    for r in last.get("results", []):
        print(f"  {'ok  ' if r['ok'] else 'FAIL'} {r['functionName']} {r['args']} {r['txHash']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
