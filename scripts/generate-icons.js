#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const PNG_HEADER = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function crc32(buf) {
  const table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const dataLen = Buffer.alloc(4);
  dataLen.writeUInt32BE(data.length, 0);
  const crcData = Buffer.concat([typeBytes, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcData), 0);
  return Buffer.concat([dataLen, typeBytes, data, crc]);
}

function createIcon(size, outputPath) {
  const w = size;
  const h = size;
  const pixels = new Uint8Array(w * h * 4);

  const cx = w / 2;
  const cy = h / 2;
  const crossThick = Math.round(w * 0.14);
  const crossLen = Math.round(w * 0.55);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const dx = x - cx;
      const dy = y - cy;
      const r = Math.sqrt(dx * dx + dy * dy);
      const inCircle = r <= w * 0.48;
      const inHoriz = Math.abs(dy) <= crossThick / 2 && Math.abs(dx) <= crossLen / 2;
      const inVert = Math.abs(dx) <= crossThick / 2 && Math.abs(dy) <= crossLen / 2;
      const inCross = inHoriz || inVert;

      if (inCircle) {
        if (inCross) {
          pixels[idx] = 26;
          pixels[idx + 1] = 111;
          pixels[idx + 2] = 191;
          pixels[idx + 3] = 255;
        } else {
          pixels[idx] = 255;
          pixels[idx + 1] = 255;
          pixels[idx + 2] = 255;
          pixels[idx + 3] = 255;
        }
      } else {
        pixels[idx] = 0;
        pixels[idx + 1] = 0;
        pixels[idx + 2] = 0;
        pixels[idx + 3] = 0;
      }
    }
  }

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(w, 0);
  ihdrData.writeUInt32BE(h, 4);
  ihdrData[8] = 8;
  ihdrData[9] = 6;
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;

  const rawData = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    rawData[y * (1 + w * 4)] = 0;
    for (let x = 0; x < w; x++) {
      const srcIdx = (y * w + x) * 4;
      const dstIdx = y * (1 + w * 4) + 1 + x * 4;
      rawData[dstIdx] = pixels[srcIdx];
      rawData[dstIdx + 1] = pixels[srcIdx + 1];
      rawData[dstIdx + 2] = pixels[srcIdx + 2];
      rawData[dstIdx + 3] = pixels[srcIdx + 3];
    }
  }

  const compressed = zlib.deflateSync(rawData);
  const png = Buffer.concat([
    PNG_HEADER,
    chunk("IHDR", ihdrData),
    chunk("IDAT", compressed),
    chunk("IEND", Buffer.alloc(0)),
  ]);

  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(outputPath, png);
  console.log(`Created ${outputPath} (${png.length} bytes)`);
}

createIcon(192, path.join(__dirname, "../public/icons/icon-192.png"));
createIcon(512, path.join(__dirname, "../public/icons/icon-512.png"));
