"""Loads the repo .env (if present) into the environment, then runs a module. Values are never printed."""
import os, runpy, sys
from pathlib import Path
env = Path(__file__).resolve().parents[1] / ".env"
if env.exists():
    for line in env.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        v = v.split(" #", 1)[0].strip().strip('"').strip("'")
        if v and k.strip() not in os.environ:
            os.environ[k.strip()] = v
sys.argv = sys.argv[1:]
runpy.run_path(sys.argv[0], run_name="__main__")
