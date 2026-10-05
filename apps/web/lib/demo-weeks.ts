import fremont from "@data/demo/weeks/fremont-demo.json";
import munich from "@data/demo/weeks/munich-demo.json";
import type { WeekView } from "./week";

/**
 * The demo weeks, built by scripts/build-week.ts: synthetic families, with places, events and
 * routes from live searches. Bundled at build time, so the parents' pages render with their
 * tickets already in the HTML.
 */
export const DEMO_WEEKS: Record<string, WeekView> = {
  "fremont-demo": fremont as unknown as WeekView,
  "munich-demo": munich as unknown as WeekView,
};
