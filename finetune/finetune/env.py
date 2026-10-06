"""Repo paths and environment loading for the fine-tune scripts.

Like packages/core/src/server-env.ts, this loads the repo's .env into os.environ when the file
exists and never prints a value. Variables already set (Codespaces secrets) win.
"""

from __future__ import annotations

import os
import re
from pathlib import Path

# The line format the dotenv package parses: KEY=value, KEY="quoted value", and a trailing # comment.
_LINE = re.compile(
    r"""^\s*(?:export\s+)?([\w.-]+)\s*=\s*('(?:\\'|[^'])*'|"(?:\\"|[^"])*"|`(?:\\`|[^`])*`|[^#\r\n]+)?\s*(?:#.*)?$"""
)

ROOT = Path(__file__).resolve().parents[2]
FINETUNE_DATA = ROOT / "data/demo/finetune"
USAGE = ROOT / "data/demo/usage"

_loaded = False


def load_env() -> None:
    global _loaded
    if _loaded:
        return
    _loaded = True
    path = ROOT / ".env"
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        match = _LINE.match(raw)
        if not match:
            continue
        key, value = match.group(1), (match.group(2) or "").strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'`":
            value = value[1:-1]
        os.environ.setdefault(key, value)


def has_env(name: str) -> bool:
    """True when a variable is set, without exposing its value."""
    load_env()
    return bool(os.environ.get(name, "").strip())
