// Writes flat-color rounded-square PNG icons into public/icons/ with no deps —
// hand-encodes a minimal PNG (single IDAT, uncompressed deflate blocks).
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outDir = path.join(root, 'public', 'icons');

const CRC = (() => {
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
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

// [r,g,b] fabrary-red foreground, transparent corners.
function png(size, fg = [179, 18, 23]) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const radius = size * 0.18;
  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const i = rowStart + 1 + x * 4;
      // rounded-corner alpha mask
      const dx = Math.max(radius - x, x - (size - 1 - radius), 0);
      const dy = Math.max(radius - y, y - (size - 1 - radius), 0);
      const inside = Math.hypot(dx, dy) <= radius;
      const alpha = dx === 0 && dy === 0 ? 255 : inside ? 255 : 0;
      raw[i] = fg[0];
      raw[i + 1] = fg[1];
      raw[i + 2] = fg[2];
      raw[i + 3] = alpha;
    }
  }

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

await mkdir(outDir, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  await writeFile(path.join(outDir, `icon${size}.png`), png(size));
}
console.log('[fabrarian] wrote icons to public/icons/');
