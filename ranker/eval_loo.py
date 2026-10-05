"""Leave-one-out evaluation of the TabPFN ranker on the persona's outings. Synthetic.

For each of the persona's 24 outings: train on the other 23, then rank that outing against the
demo week's real candidates (live search results, solo, Wednesday 10:00) and check whether it
lands in the top 3. A liked outing (4 or 5 stars) should; a disliked one (1 or 2 stars) should
not. Baselines: sorting by travel time alone, and random order.

Run twice, with and without the with_adult_child feature: in the persona data every 5-star
outing happened with the adult child, so a model that keys on that feature can't tell a good
solo outing from a bad one.

Run: uv run python eval_loo.py [--area fremont] [--mode live|replay]
"""

from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

from ranker.backend import Backend
from ranker.model import rank

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data/demo/ranker"
TOP_K = 3


def load(area: str):
    past = json.loads((DATA / f"past-{area}.json").read_text(encoding="utf-8"))["outings"]
    catalog = json.loads((DATA / f"catalog-{area}.json").read_text(encoding="utf-8"))["candidates"]
    return past, catalog


def row(o):
    return {**o["features"], "went": o["went"], "enjoyment": o["enjoyment"]}


def evaluate(past, catalog, drop, backend):
    results = []
    for i, held in enumerate(past):
        train = [row(o) for j, o in enumerate(past) if j != i]
        pool = [held["features"]] + [c["features"] for c in catalog]
        ranked = rank(train, pool, drop=drop, reasons=False, backend=backend)
        position = [r.index for r in ranked].index(0) + 1
        travel = [(f.get("travelMinutes") if f.get("travelMinutes") is not None else 10_000, k) for k, f in enumerate(pool)]
        by_distance = [k for _, k in sorted(travel)].index(0) + 1
        results.append({"id": held["id"], "title": held["title"], "went": held["went"], "enjoyment": held["enjoyment"], "rank": position, "distanceRank": by_distance})
    return results


def summarize(results, pool_size):
    def rate(rows, key):
        return sum(1 for r in rows if r[key] <= TOP_K) / len(rows) if rows else float("nan")

    liked = [r for r in results if r["went"] == 1 and (r["enjoyment"] or 0) >= 4]
    disliked = [r for r in results if r["went"] == 1 and (r["enjoyment"] or 5) <= 2]
    wanted = [r for r in results if r["went"] == 0]
    rng = random.Random(7)
    random_hits = sum(1 for _ in range(10_000) if rng.randrange(pool_size) < TOP_K) / 10_000
    return {
        "liked": {"n": len(liked), "model": rate(liked, "rank"), "distance": rate(liked, "distanceRank"), "random": random_hits},
        "disliked": {"n": len(disliked), "model": rate(disliked, "rank"), "distance": rate(disliked, "distanceRank"), "random": random_hits},
        "wantedNotWent": {"n": len(wanted), "model": rate(wanted, "rank"), "distance": rate(wanted, "distanceRank"), "random": random_hits},
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--area", default="fremont")
    ap.add_argument("--mode", default=None)
    args = ap.parse_args()
    past, catalog = load(args.area)
    backend = Backend(mode=args.mode)
    pool_size = len(catalog) + 1
    out = {"provenance": "synthetic", "area": args.area, "poolSize": pool_size, "topK": TOP_K, "runs": {}}
    for label, drop in [("all features", []), ("without with_adult_child", ["withAdultChild"])]:
        res = evaluate(past, catalog, drop, backend)
        out["runs"][label] = {"summary": summarize(res, pool_size), "rows": res}
    (DATA / f"loo-{args.area}.json").write_text(json.dumps(out, indent=1), encoding="utf-8")

    print(f"Leave-one-out on the persona's {len(past)} outings (SYNTHETIC), each ranked against {len(catalog)} live-search candidates; top {TOP_K} of {pool_size}.")
    print("| Features | Outings | n | TabPFN top-3 | Travel time only | Random |")
    print("|---|---|---|---|---|---|")
    for label, run in out["runs"].items():
        for group, name in [("liked", "Liked (4-5 stars), higher is better"), ("disliked", "Disliked (1-2 stars), lower is better"), ("wantedNotWent", "Wanted, didn't go")]:
            s = run["summary"][group]
            print(f"| {label} | {name} | {s['n']} | {s['model']:.0%} | {s['distance']:.0%} | {s['random']:.0%} |")
    print(f"\nTabPFN API calls: {backend.calls}, recorded responses replayed: {backend.cache_hits}")
    print("With 24 synthetic outings these numbers are rough: one outing moves a rate by 5 to 10 points.")


if __name__ == "__main__":
    main()
