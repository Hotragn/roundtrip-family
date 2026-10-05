import sharp from "sharp";

const [, , src, out, top, height, width = "1280"] = process.argv;
const meta = await sharp(src).metadata();
await sharp(src)
  .extract({ left: 0, top: +top, width: Math.min(+width, meta.width), height: Math.min(+height, meta.height - +top) })
  .resize({ width: 1000 })
  .png()
  .toFile(out);
console.log(meta.width, meta.height);
