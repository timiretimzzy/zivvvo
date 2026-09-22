#!/usr/bin/env node
/**
 * Generates the PWA icon set (solid PNGs, no runtime deps).
 * Brand: dark slate background + sky ring (matches apps/web/src/index.css).
 * Output: apps/web/public/icons/icon-192.png / icon-512.png
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT_DIR = join(ROOT, "apps", "web", "public", "icons");

const BG = [15, 23, 42, 255]; // #0f172a
const RING = [56, 189, 248, 255]; // #38bdf8

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function png(size, px) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = px(x, y, size);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const idat = deflateSync(raw);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function circleIcon(x, y, size) {
  const cx = size / 2;
  const cy = size / 2;
  const d = Math.hypot(x - cx, y - cy) / size;
  const ringMid = 0.4;
  const ringHalf = 0.055;
  if (Math.abs(d - ringMid) <= ringHalf) return RING;
  return BG;
}

mkdirSync(OUT_DIR, { recursive: true });
for (const size of [48, 72, 96, 144, 192, 384, 512]) {
  writeFileSync(join(OUT_DIR, `icon-${size}.png`), png(size, circleIcon));
  console.log(`make-icons: wrote icon-${size}.png`);
}

// Adaptive icon layers (512x512)
// Foreground: ring on transparent background
function foregroundIcon(x, y, size) {
  const cx = size / 2;
  const cy = size / 2;
  const d = Math.hypot(x - cx, y - cy) / size;
  const ringMid = 0.4;
  const ringHalf = 0.055;
  if (Math.abs(d - ringMid) <= ringHalf) return RING;
  return [0, 0, 0, 0]; // transparent
}
writeFileSync(join(OUT_DIR, "icon-foreground.png"), png(512, foregroundIcon));
console.log("make-icons: wrote icon-foreground.png (adaptive foreground)");

// Background: solid dark colour
function bgIcon() { return BG; }
writeFileSync(join(OUT_DIR, "icon-background.png"), png(512, bgIcon));
console.log("make-icons: wrote icon-background.png (adaptive background)");