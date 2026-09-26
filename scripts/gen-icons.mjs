// Generates the PNG app icons (PWA / iOS home screen) without external dependencies.
// Usage: npm run icons
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [11, 13, 16];
const PANEL = [20, 23, 28];
const BARS = [
  // x, y, w, h (on the same 32-unit grid as the logo), colour
  [7, 9, 4, 14, [255, 176, 32]],
  [14, 5, 4, 22, [232, 235, 241]],
  [21, 11, 4, 10, [56, 200, 244]],
];

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size, pixels) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Signed distance to a rounded rectangle (negative = inside). */
function sdRoundRect(px, py, x, y, w, h, r) {
  const cx = x + w / 2, cy = y + h / 2;
  const qx = Math.abs(px - cx) - w / 2 + r;
  const qy = Math.abs(py - cy) - h / 2 + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

function render(size, { rounded, padding }) {
  const px = Buffer.alloc(size * size * 4);
  const S = 4; // supersampling
  const inner = size * (1 - 2 * padding);
  const off = size * padding;
  const u = inner / 32;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const fx = x + (sx + 0.5) / S;
          const fy = y + (sy + 0.5) / S;
          let col = BG;
          let alpha = 1;
          if (rounded && sdRoundRect(fx, fy, 0, 0, size, size, size * 0.22) > 0) alpha = 0;
          if (sdRoundRect(fx, fy, off, off, inner, inner, inner * 0.25) <= 0) col = PANEL;
          for (const [bx, by, bw, bh, c] of BARS) {
            if (sdRoundRect(fx, fy, off + bx * u, off + by * u, bw * u, bh * u, (bw * u) / 2) <= 0) col = c;
          }
          r += col[0] * alpha;
          g += col[1] * alpha;
          b += col[2] * alpha;
          a += alpha;
        }
      }
      const n = S * S;
      const i = (y * size + x) * 4;
      px[i] = a ? Math.round(r / a) : 0;
      px[i + 1] = a ? Math.round(g / a) : 0;
      px[i + 2] = a ? Math.round(b / a) : 0;
      px[i + 3] = Math.round((a / n) * 255);
    }
  }
  return png(size, px);
}

writeFileSync('public/icon-192.png', render(192, { rounded: false, padding: 0.12 }));
writeFileSync('public/icon-512.png', render(512, { rounded: false, padding: 0.12 }));
writeFileSync('public/apple-touch-icon.png', render(180, { rounded: false, padding: 0.1 }));
console.log('Icons erzeugt.');
