import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { repoRoot } from "@roundtrip/core/server-env";
const B = join(repoRoot(), "brand");
const r = async (f: string, w: number, h?: number) => sharp(await readFile(join(B, f)), { density: 600 }).resize(w, h ?? null, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
const out = process.argv[2]!;
const W = 1200, H = 900;
const comps = [
  { input: await r("roundtrip-mark.svg", 300), left: 40, top: 40 },
  { input: await r("roundtrip-mark.svg", 64), left: 380, top: 160 },
  { input: await r("roundtrip-favicon.svg", 32), left: 470, top: 176 },
  { input: await r("roundtrip-favicon.svg", 16), left: 530, top: 184 },
  { input: await r("roundtrip-app-icon.svg", 200), left: 600, top: 90 },
  { input: await r("roundtrip-app-icon-maskable.svg", 200), left: 840, top: 90 },
  { input: await r("roundtrip-logo.svg", 700), left: 40, top: 400 },
  { input: await sharp({ create: { width: 1120, height: 230, channels: 4, background: "#16203A" } }).png().toBuffer(), left: 40, top: 620 },
  { input: await r("roundtrip-logo-dark.svg", 700), left: 80, top: 650 },
];
await sharp({ create: { width: W, height: H, channels: 4, background: "#FBFCFE" } }).composite(comps).png().toFile(out);
