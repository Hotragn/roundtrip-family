import manifest from "@data/demo/audio/manifest.json";
import fremont from "@data/demo/weeks/fremont-demo.json";
import munich from "@data/demo/weeks/munich-demo.json";
import type { ClipManifest } from "@roundtrip/agent/voice";
import { withClips } from "./clips";
import type { WeekView } from "./week";

/**
 * The demo weeks, built by scripts/build-week.ts: synthetic families, with places, events and
 * routes from live searches, with the speech pipeline's saved clips attached (lib/clips.ts).
 * Bundled at build time, so the parents' pages render with their tickets already in the HTML.
 */
export const DEMO_WEEKS: Record<string, WeekView> = {
  "fremont-demo": withClips(fremont as unknown as WeekView, manifest as ClipManifest),
  "munich-demo": withClips(munich as unknown as WeekView, manifest as ClipManifest),
};
