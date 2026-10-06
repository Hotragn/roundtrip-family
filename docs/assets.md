# Assets

Every image the site shows that isn't a photo from a search result is either drawn in code (the logo, the travel lines) or rendered in Blender from CC0 sources listed here. Nothing else is downloaded or copied.

## Sources (all CC0 1.0, public domain)

| Asset | Source | Used for |
|---|---|---|
| Kloppenheim 06 (Pure Sky), 4k HDRI | [Poly Haven](https://polyhaven.com/a/kloppenheim_06_puresky) | Sky and low sun for the rail band and the sea banner |
| Kloofendal 48d Partly Cloudy (Pure Sky), 2k HDRI | [Poly Haven](https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky) | Lighting for the train, track and aircraft renders |
| Qwantani (Pure Sky), 4k HDRI | [Poly Haven](https://polyhaven.com/a/qwantani_puresky) | Lighting for the ferry and the waterline strip |
| Spruit Sunrise, 4k HDRI | [Poly Haven](https://polyhaven.com/a/spruit_sunrise) | Tried for the rail band and dropped: its near trees loom when projected at infinity |
| Island Tree 02, 1k | [Poly Haven](https://polyhaven.com/a/island_tree_02) | Tree lines behind the rail band |
| Tree Small 02, 1k | [Poly Haven](https://polyhaven.com/a/tree_small_02) | Tree lines behind the rail band |
| Gravel040, 1K | [ambientCG](https://ambientcg.com/view?id=Gravel040) | Crushed-stone ballast |
| Concrete034, 1K | [ambientCG](https://ambientcg.com/view?id=Concrete034) | Concrete sleepers |
| Grass004, 1K | [ambientCG](https://ambientcg.com/view?id=Grass004) | Grass beside the line |
| Metal041B, 1K | [ambientCG](https://ambientcg.com/view?id=Metal041B) | Rust on the rail sides |

Hind and Hind Guntur (SIL Open Font License 1.1, apps/web/app/fonts/OFL.txt) are the only non-CC0 files: the site's fonts, and the source outlines for the wordmark.

## What is built from them

All models are made in code from primitives: no third-party vehicle models are used.

| Output (apps/web/public/art/) | Bake script (scripts/assets/bake/) | What it is |
|---|---|---|
| `rail-track.webp`, `@2x` | `rail_track.py` | The dashboard's scroll track: standard-gauge track from above, tiling every eight sleepers |
| `train-front.webp`, `@2x` | `train_front.py` | Its handle: an electric train's nose from above, fading out behind |
| `aircraft.webp`, `@2x`, `-large` | `aircraft.py` | The flight path's handle: an A320-proportioned twin jet with a drawn livery |
| `ferry.webp`, `@2x`, `-large` | `ferry.py` | The waterline's handle: a harbour catamaran ferry, cut at the waterline |
| `water-strip.webp`, `@2x` | `water_strip.py` | The waterline track: one tile of calm water from above |
| `rail-band.webp`, `@2x`, `-phone` | `rail_band.py` | The dashboard's top band: a railway across fields at golden hour |
| `sea-banner.webp`, `@2x`, `-phone` | `sea_banner.py` | The safety and privacy banner: calm sea at sunrise |

## Rebuilding

```bash
python scripts/assets/fetch.py
"C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup --python scripts/assets/bake/rail_track.py
node scripts/assets/export.mjs
```

Downloads go to scripts/assets/.downloads/ and renders to scripts/assets/.renders/, both gitignored; only the exported WebP files are committed.
