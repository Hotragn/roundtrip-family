"""Shared plumbing for generate.py and evaluate.py: start a worker, log its run."""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

from .manifest import load_json, now, write_json
from .sources import RUNS_PATH

SPEECH_DIR = Path(__file__).resolve().parents[1]


def run_worker(job: dict) -> dict:
    """Run one model's job in a fresh process (python -m speech.worker) and return its result."""
    with tempfile.TemporaryDirectory(prefix="speech-job-") as tmp:
        job_path, result_path = Path(tmp) / "job.json", Path(tmp) / "result.json"
        job_path.write_text(json.dumps(job, ensure_ascii=False), encoding="utf-8")
        proc = subprocess.run([sys.executable, "-m", "speech.worker", str(job_path), str(result_path)], cwd=SPEECH_DIR)
        if proc.returncode != 0 or not result_path.exists():
            raise RuntimeError(f"the {job['task']} worker for {job['choice']['model']} exited with code {proc.returncode}")
        return json.loads(result_path.read_text(encoding="utf-8"))


def log_run(result: dict, langs: list[str], runs_path: Path = RUNS_PATH) -> None:
    """Append the run's time and memory, without per-clip detail, to data/demo/audio/runs.json."""
    runs = load_json(runs_path, {"provenance": "synthetic", "runs": []})
    entry = {"at": now(), "langs": langs, "clips": len(result.get("clips", {}))}
    entry.update({k: v for k, v in result.items() if k not in ("clips",)})
    runs["runs"].append(entry)
    write_json(runs_path, runs)
