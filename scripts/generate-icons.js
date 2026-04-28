#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import zlib from "zlib";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

  const BG = [0x0f, 0x1f, 0x11, 255];
  const FG = [0x4c, 0xde, 0x6a, 255];

  const m = Math.max(1, Math.floor(size / 20));
  const finder = 7 * m;
  const gap = 2 * m;
  const pad = Math.round((size - (2 * finder + gap)) / 2);
  const rx = Math.round(size * 0.18);

  function setPixel(x, y, c) {
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    const i = (y * w + x) * 4;
    pixels[i] = c[0];
    pixels[i + 1] = c[1];
    pixels[i + 2] = c[2];
    pixels[i + 3] = c[3];
  }

  function fillRect(x0, y0, bw, bh, c) {
    for (let y = y0; y < y0 + bh; y++) {
      for (let x = x0; x < x0 + bw; x++) {
        setPixel(x, y, c);
      }
    }
  }

  // rounded background
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = Math.max(0, Math.max(rx - x - 1, x - (w - rx)));
      const dy = Math.max(0, Math.max(rx - y - 1, y - (h - rx)));
      if (dx * dx + dy * dy <= rx * rx) {
        setPixel(x, y, BG);
      }
    }
  }

  function drawFinder(ox, oy) {
    fillRect(ox, oy, 7 * m, 7 * m, FG);
    fillRect(ox + m, oy + m, 5 * m, 5 * m, BG);
    fillRect(ox + 2 * m, oy + 2 * m, 3 * m, 3 * m, FG);
  }

  drawFinder(pad, pad);
  drawFinder(pad + finder + gap, pad);
  drawFinder(pad, pad + finder + gap);

  // hide data dots on tiny icons
  if (size >= 48) {
    const drX = pad + finder + gap;
    const drY = pad + finder + gap;

    const dots = [
      [0, 0],
      [2, 0],
      [4, 0],
      [6, 0],
      [1, 2],
      [3, 2],
      [5, 2],
      [0, 4],
      [4, 4],
      [6, 4],
      [2, 6],
      [6, 6],
    ];

    for (const [dc, dr] of dots) {
      fillRect(drX + dc * m, drY + dr * m, m, m, FG);
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
