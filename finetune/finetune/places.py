"""Public places and transit legs from the saved SerpApi responses (agent/fixtures/serpapi/).

Places come from google_maps searches for Fremont, Munich and Bozeman; transit legs come from
google_maps_directions responses. Both are public listings saved by live searches. Stop names
are cleaned the way agent/src/routes/parse.ts cleans them, and venue names are shortened the way
scripts/build-week.ts shows them, so the dataset matches what the card writer really receives.
"""

from __future__ import annotations

import json
import math
import re
from dataclasses import dataclass, field

from finetune.env import ROOT

FIXTURES = ROOT / "agent/fixtures/serpapi"

AREAS = {
    "fremont": {"ll": "@37.555,-121.982,13z", "center": (37.555, -121.982), "home_stop": "Mowry Ave & Fremont Blvd"},
    "munich": {"ll": "@48.1,11.646,13z", "center": (48.1, 11.646), "home_stop": "Neuperlach Zentrum"},
    "bozeman": {"ll": "@45.679,-111.038,13z", "center": (45.679, -111.038), "home_stop": "Main St & Willson Ave"},
}

# Searched place types, and the listing types that count as somewhere to go.
CATEGORY_BY_QUERY = {
    "indian grocery store": "indian_grocery",
    "indischer supermarkt": "indian_grocery",
    "hindu temple": "temple",
    "hindu tempel": "temple",
    "public library": "library",
    "stadtbibliothek": "library",
    "park walking trail": "park",
    "park": "park",
    "senior center": "senior_center",
    "seniorentreff": "senior_center",
    "farmers market": "market",
    "wochenmarkt": "market",
}
KEEP_TYPES = re.compile(
    r"grocery|supermarkt|lebensmittel|markt|market|hindu|bibliothek|bücherei|library|park|hiking|nature preserve|"
    r"garten|senior citizen center|community center|seniorentreff|begegnungsstätte|bauernmarkt",
    re.I,
)
DROP_TYPES = re.compile(
    r"bus stop|apartment|assisted living|retirement|home care|home health|nursing|parking|restaurant|thrift|"
    r"government office|post office|arena|sports club|university|archive|juristische",
    re.I,
)
MAX_KM = 15.0


def display_name(title: str) -> str:
    """scripts/build-week.ts display(): drop a " - Fremont" or " | City of Bozeman" suffix."""
    return re.sub(r"\s+[-|]\s+.*$", "", title).strip()


def clean_stop(name: str) -> str:
    """agent/src/routes/parse.ts clean(): "Fremont Blvd:Central Av" reads as on the sign."""
    return re.sub(r"\s+", " ", re.sub(r"\s*:\s*", " & ", name)).strip()


def km(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat1, lon1, lat2, lon2 = map(math.radians, (*a, *b))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


@dataclass
class Place:
    area: str
    category: str
    title: str
    venue: str
    whats_there: str
    source: str = "live search (SerpApi google_maps)"


@dataclass
class TransitLeg:
    line: str
    headsign: str
    start: str
    end: str
    minutes: int
    stops: list[str] = field(default_factory=list)


@dataclass
class RouteOption:
    area: str
    first_walk: int | None
    legs: list[TransitLeg]
    walks_between: list[int]
    last_walk: int | None


def _fixtures(engine: str) -> list[dict]:
    out = []
    for path in sorted(FIXTURES.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        if data.get("engine") == engine:
            out.append(data["response"])
    return out


def _area_of_ll(ll: str) -> str | None:
    return next((k for k, a in AREAS.items() if a["ll"] == ll), None)


def _area_of_coords(coords: str) -> str | None:
    lat, lng = (float(x) for x in coords.split(","))
    return min(AREAS, key=lambda k: km(AREAS[k]["center"], (lat, lng)))


def load_places() -> list[Place]:
    seen: set[tuple[str, str]] = set()
    places: list[Place] = []
    for response in _fixtures("google_maps"):
        params = response.get("search_parameters", {})
        area = _area_of_ll(params.get("ll", ""))
        category = CATEGORY_BY_QUERY.get(params.get("q", "").lower())
        if not area or not category:
            continue
        for p in response.get("local_results", []):
            kinds = " ".join([p.get("type", ""), *p.get("types", [])])
            if not KEEP_TYPES.search(kinds) or DROP_TYPES.search(kinds):
                continue
            gps = p.get("gps_coordinates") or {}
            if "latitude" in gps and km(AREAS[area]["center"], (gps["latitude"], gps["longitude"])) > MAX_KM:
                continue
            venue = display_name(p.get("title", ""))
            if not venue or (area, venue) in seen or re.search(r"www\.|\.de$|\.com$", venue):
                continue
            seen.add((area, venue))
            whats = (p.get("description") or p.get("type") or "").strip()
            places.append(Place(area, category, p["title"], venue, whats))
    return places


def load_routes() -> list[RouteOption]:
    routes: list[RouteOption] = []
    for response in _fixtures("google_maps_directions"):
        params = response.get("search_parameters", {})
        area = _area_of_coords(params.get("start_coords", "0,0"))
        if not area:
            continue
        for d in response.get("directions", []):
            trips = d.get("trips", [])
            if not any(t.get("travel_mode") == "Transit" for t in trips):
                continue
            legs: list[TransitLeg] = []
            walks: list[int] = []
            first_walk: int | None = None
            last_walk: int | None = None
            for i, t in enumerate(trips):
                minutes = round((t.get("duration") or 0) / 60)
                if t.get("travel_mode") == "Transit":
                    title = (t.get("title") or "").strip()
                    m = re.match(r"^(\S+)\s+(.+)$", title)
                    line, headsign = (m.group(1), m.group(2)) if m else (title, "")
                    legs.append(
                        TransitLeg(
                            line=line,
                            headsign=headsign,
                            start=clean_stop((t.get("start_stop") or {}).get("name", "")),
                            end=clean_stop((t.get("end_stop") or {}).get("name", "")),
                            minutes=minutes,
                            stops=[clean_stop(s.get("name", "")) for s in t.get("stops", [])],
                        )
                    )
                elif not legs:
                    first_walk = minutes
                elif i == len(trips) - 1:
                    last_walk = minutes
                else:
                    walks.append(minutes)
            routes.append(RouteOption(area, first_walk, legs, walks, last_walk))
    return routes
