// Generates assets/icon.ico (multi-size: 16, 32, 48, 256)
// Design: dark #161616 background, orange #e8650a "T" mark
// Run: node scripts/gen-icon.js

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ── CRC32 (for PNG chunks) ──────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ CRC_TABLE[(c ^ buf[i]) & 0xff];
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const t   = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

// ── Pixel renderer ──────────────────────────────────────────────────────────
// Draws a rounded-rect background + bold "T" letterform
function renderPixels(size) {
  const buf = Buffer.alloc(size * size * 4);

  const BG = [22, 22, 22, 255];       // #161616
  const FG = [232, 101, 10, 255];     // #e8650a orange
  const CORNER = [0, 0, 0, 0];        // transparent corners for rounded feel

  const r = Math.round(size * 0.18);  // corner radius
  // "T" proportions
  const pw  = Math.round(size * 0.12);  // padding
  const bh  = Math.round(size * 0.17);  // top-bar height
  const sw  = Math.round(size * 0.24);  // stem width
  const sx  = Math.round((size - sw) / 2);
  const sy  = pw;
  const ey  = size - pw;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;

      // Rounded corner check (distance from nearest corner)
      const cx = x < r ? r : (x >= size - r ? size - r - 1 : x);
      const cy = y < r ? r : (y >= size - r ? size - r - 1 : y);
      if (x < r && y < r && (x - r) ** 2 + (y - r) ** 2 > r * r) {
        buf[idx] = buf[idx+1] = buf[idx+2] = buf[idx+3] = 0; continue;
      }
      if (x >= size - r && y < r && (x - (size - r - 1)) ** 2 + (y - r) ** 2 > r * r) {
        buf[idx] = buf[idx+1] = buf[idx+2] = buf[idx+3] = 0; continue;
      }
      if (x < r && y >= size - r && (x - r) ** 2 + (y - (size - r - 1)) ** 2 > r * r) {
        buf[idx] = buf[idx+1] = buf[idx+2] = buf[idx+3] = 0; continue;
      }
      if (x >= size - r && y >= size - r && (x - (size - r - 1)) ** 2 + (y - (size - r - 1)) ** 2 > r * r) {
        buf[idx] = buf[idx+1] = buf[idx+2] = buf[idx+3] = 0; continue;
      }

      // T: top bar
      const inBar  = x >= pw && x < size - pw && y >= sy && y < sy + bh;
      // T: stem
      const inStem = x >= sx && x < sx + sw  && y >= sy && y < ey;

      const color = (inBar || inStem) ? FG : BG;
      buf[idx] = color[0]; buf[idx+1] = color[1];
      buf[idx+2] = color[2]; buf[idx+3] = color[3];
    }
  }
  return buf;
}

// ── PNG encoder ─────────────────────────────────────────────────────────────
function encodePNG(size, rgba) {
  const sig = Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0); ihdrData.writeUInt32BE(size, 4);
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 6;  // RGBA color type
  const ihdr = pngChunk('IHDR', ihdrData);

  const stride = 1 + size * 4;
  const raw = Buffer.alloc(size * stride);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0; // filter None
    for (let x = 0; x < size; x++) {
      const s = (y * size + x) * 4;
      const d = y * stride + 1 + x * 4;
      raw[d] = rgba[s]; raw[d+1] = rgba[s+1]; raw[d+2] = rgba[s+2]; raw[d+3] = rgba[s+3];
    }
  }
  const idat = pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 }));
  const iend = pngChunk('IEND', Buffer.alloc(0));
  return Buffer.concat([sig, ihdr, idat, iend]);
}

// ── ICO builder ─────────────────────────────────────────────────────────────
function buildICO(sizes) {
  const pngs = sizes.map(s => encodePNG(s, renderPixels(s)));
  const N = pngs.length;
  const header = Buffer.alloc(6 + 16 * N);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);   // type = icon
  header.writeUInt16LE(N, 4);

  let offset = 6 + 16 * N;
  for (let i = 0; i < N; i++) {
    const e = 6 + 16 * i;
    const s = sizes[i];
    header.writeUInt8(s >= 256 ? 0 : s, e);
    header.writeUInt8(s >= 256 ? 0 : s, e + 1);
    header.writeUInt8(0, e + 2);
    header.writeUInt8(0, e + 3);
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(pngs[i].length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += pngs[i].length;
  }
  return Buffer.concat([header, ...pngs]);
}

// ── Main ─────────────────────────────────────────────────────────────────────
const outDir = path.join(__dirname, '..', 'assets');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

const ico = buildICO([16, 32, 48, 256]);
fs.writeFileSync(path.join(outDir, 'icon.ico'), ico);
console.log(`✓  assets/icon.ico  (${(ico.length / 1024).toFixed(1)} KB, sizes: 16 32 48 256)`);

const png256 = encodePNG(256, renderPixels(256));
fs.writeFileSync(path.join(outDir, 'icon.png'), png256);
console.log(`✓  assets/icon.png  (${(png256.length / 1024).toFixed(1)} KB, 256×256)`);
