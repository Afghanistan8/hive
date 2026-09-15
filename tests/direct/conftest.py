"""Shared helpers for HIVE direct-mode tests.

Direct mode runs the real GenLayer SDK in-process with web/LLM mocks.
"""

import json
import os
import sys
import time

import pytest

GEN = 10**18
HOUR = 3_600
DAY = 86_400

if sys.platform == "win32":
    # gltest's loader unlinks a temp file while it is still open as stdin,
    # which Windows refuses. The file lives in %TEMP% and is harmless to keep.
    _unlink = os.unlink

    def _tolerant_unlink(path, *args, **kwargs):
        try:
            return _unlink(path, *args, **kwargs)
        except PermissionError:
            return None

    os.unlink = _tolerant_unlink


def _install_prompt_template_shim() -> None:
    """Teach gltest's direct runner the `ExecPromptTemplate` request.

    `gl.eq_principle.prompt_non_comparative` asks the host to run a prompt
    template instead of a raw prompt; gltest 0.30 only handles raw prompts. The
    leader template is answered from the registered LLM mocks (matched against
    task + input) and returned as text, which is what the real host returns.
    Validator templates are not reachable in direct mode (leader side only);
    real validator behaviour is covered by the live runtime tests.
    """
    from gltest.direct import wasi_mock

    if getattr(wasi_mock, "_hive_template_shim", False):
        return
    original = wasi_mock._handle_gl_call

    def handle(vm, request):
        if isinstance(request, dict) and "ExecPromptTemplate" in request:
            data = request["ExecPromptTemplate"]
            haystack = f"{data.get('task', '')}\n{data.get('input', '')}"
            for pattern, response in vm._llm_mocks:
                if pattern.search(haystack):
                    return {"ok": response if isinstance(response, str) else json.dumps(response)}
            raise wasi_mock.MockNotFoundError(f"No LLM mock for prompt template: {haystack[:100]}")
        return original(vm, request)

    wasi_mock._handle_gl_call = handle
    wasi_mock._hive_template_shim = True


_install_prompt_template_shim()


def iso(ts: int) -> str:
    y, mo, d, hh, mi, sec = time.gmtime(int(ts))[:6]
    return f"{y:04d}-{mo:02d}-{d:02d}T{hh:02d}:{mi:02d}:{sec:02d}Z"


def warp(vm, ts: int) -> None:
    """Move consensus time. The SDK caches message.raw at load, so sync it too."""
    stamp = iso(ts)
    vm.warp(stamp)
    message = sys.modules.get("genlayer.message")
    raw = getattr(message, "raw", None) if message is not None else None
    if isinstance(raw, dict):
        raw["datetime"] = stamp


def hex_addr(addr) -> str:
    if isinstance(addr, (bytes, bytearray)):
        return "0x" + bytes(addr).hex()
    if hasattr(addr, "as_hex"):
        return addr.as_hex.lower()
    return str(addr).lower()


def mock_json_llm(vm, prompt_pattern, response):
    """Register JSON at the direct runner's raw text response boundary."""
    vm.mock_llm(prompt_pattern, json.dumps(json.dumps(response)))


@pytest.fixture
def warp_to(direct_vm):
    return lambda ts: warp(direct_vm, ts)
