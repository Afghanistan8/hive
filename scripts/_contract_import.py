"""Import HIVE contract modules outside GenVM.

The operator scripts reuse the contracts' own URL templates and parsers, so a
source check exercises exactly the code validators run. Only the GenVM runtime
surface is stubbed here; nothing consensus-related executes off-chain.
"""

import importlib.util
import sys
import types
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class _Anything:
    """Permissive stand-in for decorators, storage generics and type aliases."""

    def __call__(self, *args, **kwargs):
        if len(args) == 1 and callable(args[0]) and not kwargs:
            return args[0]
        return self

    def __getattr__(self, name):
        return self

    def __getitem__(self, item):
        return self

    def __mro_entries__(self, bases):
        return (object,)


class UserError(Exception):
    pass


def _install_stub() -> None:
    if "genlayer" in sys.modules and getattr(sys.modules["genlayer"], "_hive_stub", False):
        return
    anything = _Anything()
    gl = types.ModuleType("genlayer")
    gl._hive_stub = True
    gl.u256 = int
    gl.Address = str
    gl.vm = types.SimpleNamespace(UserError=UserError)
    gl.public = anything
    gl.contract = types.SimpleNamespace(Contract=object)
    gl.storage = types.SimpleNamespace(TreeMap=anything, allow=lambda cls: cls)
    gl.nondet = anything
    gl.eq_principle = anything
    gl.message = anything
    gl.chain = anything
    storage = types.ModuleType("genlayer.storage")
    storage.allow = lambda cls: cls
    sys.modules["genlayer"] = gl
    sys.modules["genlayer.storage"] = storage


def load_contract(name: str):
    _install_stub()
    path = ROOT / "contracts" / f"{name}.py"
    spec = importlib.util.spec_from_file_location(f"hive_{name}_offchain", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module
