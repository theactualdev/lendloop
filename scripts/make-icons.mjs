// Writes the tab icons from the drawing in lib/logo.ts: app/icon.svg (with its
// dark-tab colour) and app/favicon.ico (16, 32 and 48 px, for browsers that only
// ask for the .ico). Run after changing the mark: npm run icons
//
// Node 22.18+ loads lib/logo.ts directly (type stripping). sharp is installed with
// Next, which uses it to optimise images; it is not a direct dependency.
import { writeFileSync } from "node:fs";
import sharp from "sharp";
import { iconSvg } from "../lib/logo.ts";

const SIZES = [16, 32, 48];
const svg = iconSvg();
writeFileSync(new URL("../app/icon.svg", import.meta.url), svg);

// The SVG is a 16-unit grid, so this density renders it at `size` px. The dark
// media query doesn't match here, so the .ico gets the light-tab violet.
const pngs = await Promise.all(
  SIZES.map((size) =>
    sharp(Buffer.from(svg), { density: (72 * size) / 16 })
      .resize(size, size)
      .png()
      .toBuffer(),
  ),
);

// ICO with PNG images: a 6-byte header, one 16-byte entry per image, then the PNGs.
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(pngs.length, 4);

let offset = header.length + 16 * pngs.length;
const entries = pngs.map((png, i) => {
  const entry = Buffer.alloc(16);
  entry.writeUInt8(SIZES[i], 0); // width
  entry.writeUInt8(SIZES[i], 1); // height
  entry.writeUInt8(0, 2); // no palette
  entry.writeUInt8(0, 3); // reserved
  entry.writeUInt16LE(1, 4); // colour planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(offset, 12);
  offset += png.length;
  return entry;
});

writeFileSync(
  new URL("../app/favicon.ico", import.meta.url),
  Buffer.concat([header, ...entries, ...pngs]),
);
console.log(`Wrote app/icon.svg and app/favicon.ico (${SIZES.join(", ")} px).`);
