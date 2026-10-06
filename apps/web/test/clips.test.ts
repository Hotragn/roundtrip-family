import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ClipManifest } from "@roundtrip/agent/voice";
import { describe, expect, it } from "vitest";
import manifest from "../../../data/demo/audio/manifest.json";
import fremont from "../../../data/demo/weeks/fremont-demo.json";
import munich from "../../../data/demo/weeks/munich-demo.json";
import { withClips } from "../lib/clips";
import type { WeekView } from "../lib/week";

const publicDir = fileURLToPath(new URL("../public", import.meta.url));

describe("saved clips in the demo weeks (synthetic text)", () => {
  it("cover every card, practice phrase and help card, with the files on disk", () => {
    for (const raw of [fremont, munich]) {
      const week = withClips(raw as unknown as WeekView, manifest as ClipManifest);
      const urls = [
        week.household.helpCardAudio,
        ...week.outings.flatMap((o) =>
          o.cards.flatMap((c) => [c.audio?.title, c.audio?.body, ...c.phrases.map((p) => p.audio?.local)]),
        ),
      ];
      expect(urls.length).toBeGreaterThan(10);
      for (const url of urls) {
        expect(url).toMatch(/^\/audio\/[0-9a-f]{16}\.mp3$/);
        expect(existsSync(`${publicDir}${url}`)).toBe(true);
      }
    }
  });

  it("leaves a text with no clip to the phone's voice", () => {
    const week = withClips(fremont as unknown as WeekView, { clips: {} });
    expect(week.household.helpCardAudio).toBeUndefined();
    expect(week.outings[0]?.cards[0]?.audio).toEqual({ title: undefined, body: undefined });
  });
});
