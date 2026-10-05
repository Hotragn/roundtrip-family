import sharp from "sharp";

/**
 * Puts screenshots side by side for review: the top of each, scaled to one column width.
 * Usage: node scripts/contact-sheet.mjs out.png 2400 a.png b.png ...
 */
const [, , out, maxHeight = "2400", ...files] = process.argv;
const col = 360;
const tiles = await Promise.all(
  files.map(async (f) => {
    const meta = await sharp(f).metadata();
    const h = Math.min(+maxHeight, meta.height);
    const buf = await sharp(f)
      .extract({ left: 0, top: 0, width: meta.width, height: h })
      .resize({ width: col })
      .png()
      .toBuffer();
    return { buf, h: Math.round((h * col) / meta.width) };
  }),
);
const height = Math.max(...tiles.map((t) => t.h));
const gap = 12;
await sharp({
  create: { width: tiles.length * (col + gap) + gap, height: height + 2 * gap, channels: 3, background: "#8a8f99" },
})
  .composite(tiles.map((t, i) => ({ input: t.buf, left: gap + i * (col + gap), top: gap })))
  .png()
  .toFile(out);
console.log(out, tiles.length, height);
