"""Runs the ranker service locally with the repo .env loaded (values never printed).
On Render the start command is: uvicorn ranker.app:app --host 0.0.0.0 --port $PORT
"""
import os
from pathlib import Path

import uvicorn

env = Path(__file__).resolve().parents[1] / ".env"
if env.exists():
    for line in env.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            v = v.split(" #", 1)[0].strip().strip('"').strip("'")
            if v and k.strip() not in os.environ:
                os.environ[k.strip()] = v

if __name__ == "__main__":
    uvicorn.run("ranker.app:app", host="127.0.0.1", port=int(os.environ.get("RANKER_PORT", "8100")))
