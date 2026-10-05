/**
 * Builds the refined Roundtrip logo set from geometry and the Hind SemiBold outlines.
 *
 * The mark is the family loop from docs/brand.md: two halves of one circle rise from a
 * marigold home dot to two heads side by side, a larger parent (ink) and a smaller child (sky).
 * Refinements over the starter files:
 * - one circle (center 32,35, radius 18.5) on a 64-unit grid, heads placed on it at -25° and +22°
 * - masked gaps around the heads and the home dot instead of paper-colored outlines, so the mark
 *   works on any background
 * - optically even strokes: the lighter sky half is drawn 0.2 units heavier than the ink half
 * - a heavier favicon cut for 16 and 32 px
 * - the wordmark set in Hind SemiBold, sentence case, kerned and tracked, as outlines
 *
 * Run: pnpm --filter @roundtrip/scripts exec tsx brand/build-logo.ts
 * Fonts: scripts/assets/.downloads/Hind-SemiBold.ttf (google/fonts, OFL)
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { repoRoot } from "@roundtrip/core/server-env";
import opentype from "opentype.js";
import sharp from "sharp";

const ROOT = repoRoot();
const OUT_BRAND = join(ROOT, "brand");
const OUT_PUBLIC = join(ROOT, "apps/web/public/brand");
const OUT_ICONS = join(ROOT, "apps/web/public/icons");
const OUT_APP = join(ROOT, "apps/web/app");

const INK = "#1F2A44";
const SKY = "#3E9BE0";
const BUS = "#F2A900";
const PAPER = "#FBFCFE";

interface MarkSpec {
  r: number;
  ink: number;
  sky: number;
  parentR: number;
  childR: number;
  homeR: number;
  gap: number;
  parentAngle: number;
  childAngle: number;
  cx: number;
  cy: number;
}

const STANDARD: MarkSpec = {
  cx: 32,
  cy: 35,
  r: 18.5,
  ink: 6,
  sky: 6.2,
  parentR: 7.2,
  childR: 5.4,
  homeR: 6.2,
  gap: 1.8,
  parentAngle: -25,
  childAngle: 22,
};

/** Heavier strokes and dots so the mark survives 16 px. */
const FAVICON: MarkSpec = {
  cx: 32,
  cy: 35.5,
  r: 18,
  ink: 8,
  sky: 8.3,
  parentR: 8.6,
  childR: 6.6,
  homeR: 7.4,
  gap: 2.2,
  parentAngle: -27,
  childAngle: 25,
};

const round = (n: number) => Math.round(n * 100) / 100;

function onCircle(s: MarkSpec, degFromTop: number) {
  const a = (degFromTop * Math.PI) / 180;
  return { x: round(s.cx + s.r * Math.sin(a)), y: round(s.cy - s.r * Math.cos(a)) };
}

/** The mark's elements, without the outer <svg>. `id` keeps mask ids unique when inlined twice. */
function markBody(s: MarkSpec, parentColor: string, id: string): string {
  const home = onCircle(s, 180);
  const parent = onCircle(s, s.parentAngle);
  const child = onCircle(s, s.childAngle);
  return [
    `<defs><mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64">`,
    `<rect width="64" height="64" fill="#fff"/>`,
    `<circle cx="${parent.x}" cy="${parent.y}" r="${round(s.parentR + s.gap)}" fill="#000"/>`,
    `<circle cx="${child.x}" cy="${child.y}" r="${round(s.childR + s.gap)}" fill="#000"/>`,
    `<circle cx="${home.x}" cy="${home.y}" r="${round(s.homeR + s.gap)}" fill="#000"/>`,
    `</mask></defs>`,
    `<g mask="url(#${id})" fill="none" stroke-linecap="round">`,
    // Parent half: bottom, up the left side (clockwise on screen), to the parent head.
    `<path d="M${home.x} ${home.y}A${s.r} ${s.r} 0 0 1 ${parent.x} ${parent.y}" stroke="${parentColor}" stroke-width="${s.ink}"/>`,
    // Child half: bottom, up the right side, to the child head.
    `<path d="M${home.x} ${home.y}A${s.r} ${s.r} 0 0 0 ${child.x} ${child.y}" stroke="${SKY}" stroke-width="${s.sky}"/>`,
    `</g>`,
    `<circle cx="${parent.x}" cy="${parent.y}" r="${s.parentR}" fill="${parentColor}"/>`,
    `<circle cx="${child.x}" cy="${child.y}" r="${s.childR}" fill="${SKY}"/>`,
    `<circle cx="${home.x}" cy="${home.y}" r="${s.homeR}" fill="${BUS}"/>`,
  ].join("");
}

function svg(viewBox: string, body: string, label = "Roundtrip"): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-label="${label}"><title>${label}</title>${body}</svg>\n`;
}

function markSvg(s: MarkSpec, dark: boolean, id = "rt-mark"): string {
  return svg("0 0 64 64", markBody(s, dark ? PAPER : INK, id));
}

function appIconSvg(maskable: boolean): string {
  // Ink tile. The maskable icon fills the square and keeps the mark inside the 80% safe zone.
  const tile = maskable
    ? `<rect width="64" height="64" fill="${INK}"/>`
    : `<rect width="64" height="64" rx="14.5" fill="${INK}"/>`;
  const scale = maskable ? 0.62 : 0.74;
  const offset = round((64 - 64 * scale) / 2);
  return svg(
    "0 0 64 64",
    `${tile}<g transform="translate(${offset} ${round(offset - 0.6)}) scale(${scale})">${markBody(STANDARD, PAPER, "rt-icon")}</g>`,
  );
}

async function wordmarkPath(fontFile: string, fontSize: number, trackingEm: number) {
  const buf = await readFile(fontFile);
  const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const text = "Roundtrip";
  // Kerned glyph positions, plus a small negative tracking for display size.
  const glyphs = font.stringToGlyphs(text);
  const scale = fontSize / font.unitsPerEm;
  let x = 0;
  const parts: string[] = [];
  for (let i = 0; i < glyphs.length; i++) {
    const g = glyphs[i]!;
    const p = g.getPath(x, 0, fontSize);
    parts.push(p.toPathData({ decimalPlaces: 2, flipY: false }));
    const next = glyphs[i + 1];
    const kern = next ? font.getKerningValue(g, next) : 0;
    x += ((g.advanceWidth ?? 0) + kern) * scale + trackingEm * fontSize;
  }
  const os2 = font.tables.os2 as { sCapHeight?: number; sxHeight?: number };
  const capHeight = ((os2.sCapHeight ?? 0.69 * font.unitsPerEm) / font.unitsPerEm) * fontSize;
  const descender = (Math.abs(font.descender) / font.unitsPerEm) * fontSize;
  // Ink bounds of the whole word, from the per-glyph paths at their kerned positions.
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  x = 0;
  for (let i = 0; i < glyphs.length; i++) {
    const g = glyphs[i]!;
    const bb = g.getPath(x, 0, fontSize).getBoundingBox();
    if (bb.x1 !== bb.x2) {
      minX = Math.min(minX, bb.x1);
      maxX = Math.max(maxX, bb.x2);
      minY = Math.min(minY, bb.y1);
      maxY = Math.max(maxY, bb.y2);
    }
    const next = glyphs[i + 1];
    const kern = next ? font.getKerningValue(g, next) : 0;
    x += ((g.advanceWidth ?? 0) + kern) * scale + trackingEm * fontSize;
  }
  return { d: parts.join(""), capHeight, descender, bounds: { minX, maxX, minY, maxY } };
}

/** Minimal ICO writer: a directory of PNG images (supported by every current browser). */
function ico(pngs: Array<{ size: number; data: Buffer }>): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  const dir = Buffer.alloc(16 * pngs.length);
  let offset = 6 + dir.length;
  pngs.forEach((p, i) => {
    const o = i * 16;
    dir.writeUInt8(p.size >= 256 ? 0 : p.size, o);
    dir.writeUInt8(p.size >= 256 ? 0 : p.size, o + 1);
    dir.writeUInt8(0, o + 2);
    dir.writeUInt8(0, o + 3);
    dir.writeUInt16LE(1, o + 4);
    dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(p.data.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += p.data.length;
  });
  return Buffer.concat([header, dir, ...pngs.map((p) => p.data)]);
}

const png = (svgText: string, size: number) =>
  sharp(Buffer.from(svgText), { density: Math.max(72, (72 * size) / 64) * 4 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toBuffer();

async function main() {
  for (const d of [OUT_BRAND, OUT_PUBLIC, OUT_ICONS, OUT_APP]) await mkdir(d, { recursive: true });

  const font = join(ROOT, "scripts/assets/.downloads/Hind-SemiBold.ttf");
  const fontSize = 44;
  const wm = await wordmarkPath(font, fontSize, -0.008);
  const wmWidth = wm.bounds.maxX - wm.bounds.minX;

  // Wordmark alone: tight viewBox around the ink.
  const wmPad = 1;
  const wordmark = (fill: string) =>
    svg(
      `${round(wm.bounds.minX - wmPad)} ${round(wm.bounds.minY - wmPad)} ${round(wmWidth + wmPad * 2)} ${round(
        wm.bounds.maxY - wm.bounds.minY + wmPad * 2,
      )}`,
      `<path d="${wm.d}" fill="${fill}"/>`,
    );

  // Lockup: mark at 64, then a gap, then the wordmark with its cap band centered on the loop.
  const gap = 15;
  const loopCenter = 36;
  const baseline = round(loopCenter + wm.capHeight / 2);
  const wmX = 64 + gap - wm.bounds.minX;
  const lockupWidth = round(64 + gap + wmWidth + 2);
  const lockupTop = Math.min(0, baseline + wm.bounds.minY);
  const lockupBottom = Math.max(64, baseline + wm.bounds.maxY);
  const lockup = (dark: boolean) =>
    svg(
      `0 ${round(lockupTop)} ${lockupWidth} ${round(lockupBottom - lockupTop)}`,
      `${markBody(STANDARD, dark ? PAPER : INK, dark ? "rt-logo-d" : "rt-logo")}<path transform="translate(${round(
        wmX,
      )} ${baseline})" d="${wm.d}" fill="${dark ? PAPER : INK}"/>`,
    );

  const files: Record<string, string> = {
    "roundtrip-mark.svg": markSvg(STANDARD, false),
    "roundtrip-mark-dark.svg": markSvg(STANDARD, true, "rt-mark-d"),
    "roundtrip-favicon.svg": markSvg(FAVICON, false, "rt-fav"),
    "roundtrip-wordmark.svg": wordmark(INK),
    "roundtrip-wordmark-dark.svg": wordmark(PAPER),
    "roundtrip-logo.svg": lockup(false),
    "roundtrip-logo-dark.svg": lockup(true),
    "roundtrip-app-icon.svg": appIconSvg(false),
    "roundtrip-app-icon-maskable.svg": appIconSvg(true),
  };
  for (const [name, text] of Object.entries(files)) {
    await writeFile(join(OUT_BRAND, name), text, "utf8");
    await writeFile(join(OUT_PUBLIC, name), text, "utf8");
  }

  // Favicon set and app icons for the web app.
  await writeFile(join(OUT_APP, "icon.svg"), files["roundtrip-favicon.svg"]!, "utf8");
  const icoPngs = await Promise.all([16, 32, 48].map(async (size) => ({ size, data: await png(files["roundtrip-favicon.svg"]!, size) })));
  await writeFile(join(OUT_APP, "favicon.ico"), ico(icoPngs));
  await writeFile(join(OUT_APP, "apple-icon.png"), await png(files["roundtrip-app-icon.svg"]!, 180));
  await writeFile(join(OUT_ICONS, "icon-192.png"), await png(files["roundtrip-app-icon.svg"]!, 192));
  await writeFile(join(OUT_ICONS, "icon-512.png"), await png(files["roundtrip-app-icon.svg"]!, 512));
  await writeFile(join(OUT_ICONS, "maskable-512.png"), await png(files["roundtrip-app-icon-maskable.svg"]!, 512));
  // Size checks for the style guide: the mark at 16, 32, 64 and 512 px.
  for (const size of [16, 32, 64, 512]) {
    const spec = size <= 32 ? files["roundtrip-favicon.svg"]! : files["roundtrip-mark.svg"]!;
    await writeFile(join(OUT_ICONS, `mark-${size}.png`), await png(spec, size));
  }
  console.log(`Wrote ${Object.keys(files).length} SVGs, favicon.ico, apple-icon.png and PWA icons.`);
  console.log(`Wordmark: cap height ${round(wm.capHeight)}, width ${round(wmWidth)} at ${fontSize} units.`);
}

await main();
