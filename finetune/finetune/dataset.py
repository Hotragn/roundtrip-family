"""Synthetic outings for the card writer, in the exact input shape scripts/build-week.ts sends.

Venues and transit legs are public data from the saved live searches (finetune/places.py). The
rest is synthetic: who goes, the day, the times, which stops along a real bus line they ride,
walk minutes, family outings by car, and a few invented events. The trip text, names, optional
names and numbers are built exactly as build-week.ts builds them, including its quirks ("for 1
stops", "Bus U5" for an U-Bahn line), because that is what the writer will see.

Venues held out for evaluation never appear in training, so the held-out set tests new places.
Run: uv run python -m finetune.dataset
"""

from __future__ import annotations

import json
import random
from collections import Counter
from typing import Any

from finetune.env import FINETUNE_DATA
from finetune.places import AREAS, Place, RouteOption, TransitLeg, load_places, load_routes

SEED = 20261006
N_TOTAL = 400
N_EVAL = 40
N_PILOT = 20
OUT = FINETUNE_DATA / "outings.jsonl"

TE_DAY = {
    "mon": "సోమవారం",
    "tue": "మంగళవారం",
    "wed": "బుధవారం",
    "thu": "గురువారం",
    "fri": "శుక్రవారం",
    "sat": "శనివారం",
    "sun": "ఆదివారం",
}
ADDRESS = {"mother": "అమ్మా", "father": "నాన్నగారు"}

# Venues in this week's demo plans stay in training, so the app's own cards are in-distribution.
DEMO_VENUES = {
    "Karya Siddhi Hanuman Temple",
    "Indian Market",
    "Central Park",
    "Irvington Farmers' Market",
    "Age Well Center at Lake Elizabeth",
    "Münchner Stadtbibliothek Ramersdorf",
    "Münchner Stadtbibliothek Neuperlach",
    "Hariom Temple",
    "Indian-Grocery-Store München",
    "Wochenmarkt Perlach",
    "Peets Hill/Burke Park",
    "Lindley Park",
    "Bozeman Senior Social Center",
    "Bozeman Public Library",
}

LADDER_LABELS = ["Shared culture", "Programs for newcomers and older adults", "Language barely matters"]

# Invented events (synthetic), each with a listing-style description. Some descriptions carry
# times or counts that are not in the outing's numbers, as real listings do; the card must not repeat them.
EVENTS: dict[str, list[tuple[str, str]]] = {
    "fremont": [
        ("Telugu coffee morning for visiting parents", "Telugu-speaking parents visiting family meet for coffee and conversation"),
        ("Chair yoga for older adults", "Gentle chair yoga, Tuesdays 10:00 to 11:00. Free for seniors"),
        ("English conversation circle for newcomers", "Practice everyday English in a small, friendly group"),
        ("Bhajan evening at the community hall", "Devotional songs with harmonium and tabla; all are welcome"),
        ("Seniors' morning walking group", "A slow 2-mile loop around the lake with a stop for tea"),
        ("Diwali lamp-making workshop", "Make and paint clay diyas; materials provided"),
        ("Sanskriti Durga Puja", "Durga Puja celebration with prayers, music and food stalls"),
        ("Niles Fremont Farmers Market", "Farmers market with seasonal fruit, vegetables and flowers"),
    ],
    "munich": [
        ("Deutsch-Café für Neuankömmlinge", "Gesprächsrunde auf Deutsch für Neuankömmlinge, mit Kaffee"),
        ("Yoga für Seniorinnen und Senioren", "Sanftes Yoga auf dem Stuhl, 60 Minuten"),
        ("Spielenachmittag im Seniorentreff", "Karten- und Brettspiele, Kaffee und Kuchen"),
        ("Diwali-Feier im Kulturzentrum", "Lichterfest mit Musik, Tanz und indischem Essen"),
        ("Bücherflohmarkt der Stadtbibliothek", "Gebrauchte Bücher ab 1 Euro, auch Bücher auf Englisch"),
    ],
    "bozeman": [
        ("Seniors' lunch and bingo", "Hot lunch at noon followed by bingo; newcomers welcome"),
        ("Library book club for newcomers", "Read and talk about one short book a month in easy English"),
        ("Gentle morning walk on the trail", "An easy, flat walk with a volunteer guide"),
    ],
}

KIND_WEIGHTS = {
    "fremont": {"bus": 0.40, "transfer": 0.12, "walk": 0.22, "family": 0.14, "event": 0.12},
    "munich": {"bus": 0.38, "transfer": 0.20, "walk": 0.22, "family": 0.13, "event": 0.07},
    "bozeman": {"walk": 0.62, "family": 0.26, "event": 0.12},
}
AREA_WEIGHTS = {"fremont": 0.45, "munich": 0.35, "bozeman": 0.20}
EVAL_PLAN = {
    "fremont": {"bus": 6, "transfer": 3, "walk": 4, "family": 2, "event": 2},
    "munich": {"bus": 5, "transfer": 3, "walk": 3, "family": 2, "event": 1},
    "bozeman": {"walk": 5, "family": 3, "event": 1},
}


def fmt(minutes: int) -> str:
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def pick(rng: random.Random, weights: dict[str, float]) -> str:
    keys = list(weights)
    return rng.choices(keys, weights=[weights[k] for k in keys])[0]


def legs_for_bus(rng: random.Random, routes: list[RouteOption], area: str) -> tuple[list[dict[str, Any]], int]:
    """One real line, boarding and getting off at real stops along it."""
    pool = [leg for r in routes if r.area == area for leg in r.legs]
    leg: TransitLeg = rng.choice(pool)
    seq = [leg.start, *leg.stops, leg.end]
    i = 0 if rng.random() < 0.7 or len(seq) < 3 else rng.randrange(0, len(seq) - 2)
    j = rng.randrange(i + 1, len(seq))
    ride = max(2, round(leg.minutes * (j - i) / max(1, len(seq) - 1)))
    legs = [
        {"mode": "walk", "minutes": rng.randint(1, 9), "to": seq[i]},
        {"mode": "transit", "line": leg.line, "headsign": leg.headsign, "from": seq[i], "to": seq[j], "numStops": j - i, "minutes": ride},
    ]
    return legs, sum(x["minutes"] for x in legs)


def legs_for_transfer(rng: random.Random, routes: list[RouteOption], area: str) -> tuple[list[dict[str, Any]], int]:
    """A real two-line route, with walk minutes nudged a little."""
    option = rng.choice([r for r in routes if r.area == area and len(r.legs) == 2])
    a, b = option.legs
    legs: list[dict[str, Any]] = []
    if option.first_walk is not None:
        legs.append({"mode": "walk", "minutes": max(1, option.first_walk + rng.randint(-1, 2)), "to": a.start})
    legs.append({"mode": "transit", "line": a.line, "headsign": a.headsign, "from": a.start, "to": a.end, "numStops": len(a.stops) + 1, "minutes": a.minutes})
    if option.walks_between:
        legs.append({"mode": "walk", "minutes": max(1, option.walks_between[0] + rng.randint(0, 1)), "to": b.start})
    legs.append({"mode": "transit", "line": b.line, "headsign": b.headsign, "from": b.start, "to": b.end, "numStops": len(b.stops) + 1, "minutes": b.minutes})
    return legs, sum(x["minutes"] for x in legs)


def facts_for(
    rng: random.Random, *, area: str, kind: str, venue: str, whats: str, addressee: str, routes: list[RouteOption], first_card: bool
) -> dict[str, Any]:
    legs: list[dict[str, Any]] = []
    if kind in ("bus", "event") and area != "bozeman" and (kind == "bus" or rng.random() < 0.6):
        legs, travel = legs_for_bus(rng, routes, area)
    elif kind == "transfer":
        legs, travel = legs_for_transfer(rng, routes, area)
    elif kind == "family":
        travel = rng.randint(10, 30)
    else:
        walk = rng.randint(3, 20)
        legs = [{"mode": "walk", "minutes": walk, "to": venue}]
        travel = walk
    transit = [x for x in legs if x["mode"] == "transit"]
    if transit:
        legs.append({"mode": "walk", "minutes": rng.randint(1, 15), "to": venue})
        travel += legs[-1]["minutes"]

    if kind == "family":
        day = rng.choice(["sat", "sun", "sun"])
        depart = rng.choice(range(9 * 60, 16 * 60 + 1, 15))
    else:
        day = rng.choices(list(TE_DAY), weights=[17, 17, 17, 17, 17, 10, 5])[0]
        depart = rng.choice(range(8 * 60, 15 * 60 + 31, rng.choice([15, 15, 5])))
    back = depart + 2 * travel + rng.randint(30, 150)

    trip = (
        "; ".join(
            f"walk {x['minutes']} minutes to {x['to']}"
            if x["mode"] == "walk"
            else f"take Bus {x['line']} toward {x['headsign']} for {x['numStops']} stops, get off at {x['to']}"
            for x in legs
        )
        if legs
        else "you go together by car"
    )
    first, last = (transit[0], transit[-1]) if transit else (None, None)
    names = list(dict.fromkeys([venue, f"Bus {first['line']}", first["from"], last["to"]] if first and last else [venue]))
    optional = [n for t in transit[1:] for n in (f"Bus {t['line']}", t["from"], t["to"])] + ([first["to"]] if first else [])
    optional = [n for n in dict.fromkeys(optional) if n not in names]
    numbers = [fmt(depart), fmt(back), *(str(t["numStops"]) for t in transit), *(str(x["minutes"]) for x in legs if x["mode"] == "walk")]
    return {
        "addressee": addressee,
        "addressAs": ADDRESS[addressee],
        "venue": venue,
        "day": TE_DAY[day],
        "departTime": fmt(depart),
        "backTime": fmt(back),
        "trip": trip,
        "whatsThere": whats,
        "names": names,
        "optionalNames": optional,
        "numbers": numbers,
        "firstCard": first_card,
    }


def build(seed: int = SEED) -> list[dict[str, Any]]:
    rng = random.Random(seed)
    places = load_places()
    routes = load_routes()
    by_area: dict[str, list[Place]] = {a: [p for p in places if p.area == a] for a in AREAS}

    # Hold out about one venue in five per area (never a demo-week venue) for evaluation.
    eval_venues: dict[str, list[Place]] = {}
    train_venues: dict[str, list[Place]] = {}
    for area, items in by_area.items():
        candidates = [p for p in items if p.venue not in DEMO_VENUES]
        rng.shuffle(candidates)
        by_cat: dict[str, list[Place]] = {}
        for p in candidates:
            by_cat.setdefault(p.category, []).append(p)
        held: list[Place] = []
        need = sum(n for k, n in EVAL_PLAN[area].items() if k != "event")
        while len(held) < need and any(by_cat.values()):
            for cat in sorted(by_cat):
                if by_cat[cat] and len(held) < need:
                    held.append(by_cat[cat].pop())
        eval_venues[area] = held
        train_venues[area] = [p for p in items if p not in held]
    events = {a: list(evs) for a, evs in EVENTS.items()}
    eval_events = {a: [evs.pop(rng.randrange(len(evs)))] for a, evs in events.items()}

    def make(area: str, kind: str, split: str, place: Place | None, event: tuple[str, str] | None) -> dict[str, Any]:
        addressee = "mother" if rng.random() < 0.55 else "father"
        first_card = rng.random() < (0.10 if addressee == "mother" else 0.03)
        if event:
            venue, whats, category, source = event[0], event[1], "event", "synthetic event"
        else:
            assert place is not None
            venue, category, source = place.venue, place.category, place.source
            whats = rng.choice(LADDER_LABELS) if rng.random() < 0.05 else place.whats_there
        facts = facts_for(rng, area=area, kind=kind, venue=venue, whats=whats, addressee=addressee, routes=routes, first_card=first_card)
        return {"split": split, "area": area, "kind": kind, "category": category, "venueSource": source, "facts": facts}

    rows: list[dict[str, Any]] = []
    for area, plan in EVAL_PLAN.items():
        venues = list(eval_venues[area])
        for kind, n in plan.items():
            for _ in range(n):
                if kind == "event":
                    rows.append(make(area, kind, "eval", None, eval_events[area][0]))
                else:
                    rows.append(make(area, kind, "eval", venues.pop(), None))
    while len(rows) < N_TOTAL:
        area = pick(rng, AREA_WEIGHTS)
        kind = pick(rng, KIND_WEIGHTS[area])
        if kind == "event":
            rows.append(make(area, kind, "train", None, rng.choice(events[area])))
        else:
            rows.append(make(area, kind, "train", rng.choice(train_venues[area]), None))

    # A stratified pilot of training outings for comparing teachers.
    train = [r for r in rows if r["split"] == "train"]
    strata: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for r in train:
        strata.setdefault((r["area"], r["kind"]), []).append(r)
    pilot: list[dict[str, Any]] = []
    while len(pilot) < N_PILOT:
        for key in sorted(strata):
            if strata[key] and len(pilot) < N_PILOT:
                pilot.append(strata[key].pop(rng.randrange(len(strata[key]))))
    for i, r in enumerate(rows):
        r["id"] = f"{'e' if r['split'] == 'eval' else 't'}{i:03d}"
        r["pilot"] = any(r is p for p in pilot)
        r["provenance"] = "synthetic outing; venue and transit names from live search" if r["venueSource"] != "synthetic event" else "synthetic outing and event"
    return rows


def main() -> None:
    rows = build()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps({"id": r["id"], **{k: v for k, v in r.items() if k != "id"}}, ensure_ascii=False) + "\n")
    print(f"Wrote {OUT.relative_to(OUT.parents[3])}: {len(rows)} outings")
    print(Counter(r["split"] for r in rows), Counter(r["pilot"] for r in rows))
    print(Counter((r["split"], r["area"]) for r in rows))
    print(Counter((r["split"], r["kind"]) for r in rows))
    print(Counter((r["split"], r["facts"]["addressee"]) for r in rows))
    ev = {r["facts"]["venue"] for r in rows if r["split"] == "eval" and r["kind"] != "event"}
    tr = {r["facts"]["venue"] for r in rows if r["split"] == "train"}
    print("eval venues also in train:", len(ev & tr))


if __name__ == "__main__":
    main()

