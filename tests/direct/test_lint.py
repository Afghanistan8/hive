"""Every shipped contract must pass the GenVM linter and SDK validation.

Runs the same `genvm-lint check` the CI job runs, so a contract path the
linter rejects fails the test suite too — not just deployment.
"""

import os
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
CONTRACTS = ["contracts/hive_crypto.py", "contracts/hive_sports.py"]


@pytest.mark.parametrize("contract", CONTRACTS)
def test_contract_passes_genvm_lint(contract):
    env = {**os.environ, "PYTHONIOENCODING": "utf-8"}
    result = subprocess.run(
        [sys.executable, "-m", "genvm_linter.cli", "check", contract],
        cwd=ROOT, capture_output=True, text=True, env=env, timeout=600,
    )
    output = result.stdout + result.stderr
    assert result.returncode == 0, output
    assert "Lint passed" in output and "Validation passed" in output, output
