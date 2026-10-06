import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

/**
 * Turns the Blender renders in scripts/assets/.renders/ into the WebP files the site serves,
 * in apps/web/public/art/: 1x and 2x for every image, tileable strips at whole-pixel sizes so
 * they repeat without a seam. Run after the bake scripts: node scripts/assets/export.mjs
 */
const here = dirname(fileURLToPath(import.meta.url));
const RENDERS = join(here, ".renders");
const OUT = join(here, "../../apps/web/public/art");
mkdirSync(OUT, { recursive: true });

const webp = (img, q = 82) => img.webp({ quality: q, alphaQuality: 90, effort: 6, smartSubsample: true });
const save = async (img, name) => {
  const info = await img.toFile(join(OUT, name));
  console.log(`${name}: ${info.width} x ${info.height}, ${Math.round(info.size / 1024)} KB`);
};

/** Vehicles: trimmed to their pixels, at a 1x width, double that, and a large copy. */
async function vehicle(src, name, width, large) {
  const trimmed = await sharp(join(RENDERS, src)).trim({ threshold: 1 }).toBuffer();
  for (const [suffix, w] of [
    ["", width],
    ["@2x", width * 2],
    ["-large", large],
  ]) {
    await save(webp(sharp(trimmed).resize({ width: w, kernel: "lanczos3" })), `${name}${suffix}.webp`);
  }
}

/** The train front fades out where the render stops, so it reads as the head of a longer train. */
async function trainFront(width) {
  const src = sharp(join(RENDERS, "train-front.png"));
  const { width: w0, height: h0 } = await src.metadata();
  const fade = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w0}" height="${h0}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.22" stop-color="#fff" stop-opacity="1"/></linearGradient></defs><rect width="${w0}" height="${h0}" fill="url(#g)"/></svg>`,
  );
  const faded = await src
    .ensureAlpha()
    .composite([{ input: fade, blend: "dest-in" }])
    .png()
    .toBuffer();
  for (const [suffix, w] of [
    ["", width],
    ["@2x", width * 2],
  ]) {
    await save(webp(sharp(faded).resize({ width: w, kernel: "lanczos3" })), `train-front${suffix}.webp`);
  }
}

/** The rail track: 3:4 tiles, so 42 x 56 at 1x and 84 x 112 at 2x repeat exactly. */
async function railTrack() {
  for (const [suffix, w, h] of [
    ["", 42, 56],
    ["@2x", 84, 112],
  ]) {
    await save(
      webp(sharp(join(RENDERS, "rail-track.png")).resize(w, h, { fit: "fill", kernel: "lanczos3" }), 86),
      `rail-track${suffix}.webp`,
    );
  }
}

/** The waterline: a horizontal slice of the square water tile, repeating left to right. */
async function waterStrip() {
  const src = sharp(join(RENDERS, "water-strip.png"));
  const { width } = await src.metadata();
  const slice = await src
    .extract({ left: 0, top: Math.round(width * 0.4), width, height: Math.round(width / 16) })
    .toBuffer();
  for (const [suffix, w] of [
    ["", 256],
    ["@2x", 512],
  ]) {
    await save(webp(sharp(slice).resize({ width: w, kernel: "lanczos3" }), 84), `water-strip${suffix}.webp`);
  }
}

/** Wide scenes: a horizontal band cut from the render, for desktop and phone widths. */
async function band(src, name, top, height) {
  const img = sharp(join(RENDERS, src));
  const { width: w0, height: h0 } = await img.metadata();
  const cut = await img
    .extract({ left: 0, top: Math.round(top * h0), width: w0, height: Math.round(height * h0) })
    .toBuffer();
  for (const [suffix, w] of [
    ["", 1600],
    ["@2x", 3200],
    ["-phone", 800],
  ]) {
    await save(webp(sharp(cut).resize({ width: Math.min(w, w0), kernel: "lanczos3" }), 80), `${name}${suffix}.webp`);
  }
}

const only = process.argv.slice(2);
const want = (k) => only.length === 0 || only.includes(k);
if (want("aircraft")) await vehicle("aircraft.png", "aircraft", 88, 520);
if (want("ferry")) await vehicle("ferry.png", "ferry", 96, 560);
if (want("train")) await trainFront(42);
if (want("track")) await railTrack();
if (want("water")) await waterStrip();
if (want("rail-band")) await band("rail-band.png", "rail-band", 0.3, 0.42);
if (want("sea-banner")) await band("sea-banner.png", "sea-banner", 0.12, 0.52);
