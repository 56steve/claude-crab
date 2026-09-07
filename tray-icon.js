"use strict";

// Generates the Claude-crab menu-bar icon as a PNG buffer — no image files,
// no canvas dependency, just zlib. The crab is blocky, so it maps cleanly onto
// a pixel grid drawn from rectangles (body, arms, legs, eyes) with a dark rim.

const zlib = require("zlib");

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePNG(W, H, rgba) {
  const stride = W * 4;
  const raw = Buffer.alloc((stride + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// Colors
const ORANGE = [240, 107, 64];
const EYE = [32, 29, 27];

/**
 * Draw the crab. `scale` multiplies a 60x44 base grid.
 * Returns a PNG Buffer.
 */
function crabTrayPNG(scale = 1) {
  const BW = 60;
  const BH = 44;
  const W = BW * scale;
  const H = BH * scale;
  const rgba = Buffer.alloc(W * H * 4, 0);

  const px = (x, y, c, a = 255) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 4;
    rgba[i] = c[0];
    rgba[i + 1] = c[1];
    rgba[i + 2] = c[2];
    rgba[i + 3] = a;
  };
  // rectangle on the base grid, scaled up
  const rect = (x0, y0, x1, y1, c, a = 255) => {
    for (let y = Math.round(y0 * scale); y < Math.round(y1 * scale); y++)
      for (let x = Math.round(x0 * scale); x < Math.round(x1 * scale); x++) px(x, y, c, a);
  };

  // Body parts on the 60x44 grid (x0,y0,x1,y1)
  const parts = [
    [9, 0, 51, 35], // body
    [0, 9, 11, 20], // left arm
    [49, 9, 60, 20], // right arm
    // 4 legs: outer legs flush with body edges (9 & 51); wider gap in the middle
    [9, 30, 15, 43], // leg 1 (flush left)
    [19, 30, 25, 43], // leg 2
    [35, 30, 41, 43], // leg 3
    [45, 30, 51, 43], // leg 4 (flush right)
  ];

  // 1) flat orange fill (no dark outline / shadow, no sheen)
  for (const [a, b, c, d] of parts) rect(a, b, c, d, ORANGE);
  // 2) eyes (smaller, nudged up, no white glint)
  rect(16, 5, 24, 13, EYE);
  rect(36, 5, 44, 13, EYE);

  return encodePNG(W, H, rgba);
}

module.exports = { crabTrayPNG };

// Allow running directly to write a preview file: `node tray-icon.js /tmp/x.png [scale]`
if (require.main === module) {
  const fs = require("fs");
  const out = process.argv[2] || "/tmp/crab-tray.png";
  const scale = parseInt(process.argv[3] || "8", 10);
  fs.writeFileSync(out, crabTrayPNG(scale));
  console.log("wrote", out, "at scale", scale);
}
