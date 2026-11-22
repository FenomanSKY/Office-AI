'use strict';
// PNG RGBA dibungkus ICO; seluruhnya memakai modul bawaan Node.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type), size = Buffer.alloc(4), crc = Buffer.alloc(4);
  size.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([size, name, data, crc]);
}
function inside(x, y, points) {
  let hit = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i], [xj, yj] = points[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}
const polygons = [
  { p: [[128,43],[224,94],[128,147],[32,94]], c: [104,182,255] },
  { p: [[32,94],[128,147],[128,244],[32,190]], c: [40,109,218] },
  { p: [[128,147],[224,94],[224,190],[128,244]], c: [22,66,149] },
  { p: [[128,43],[224,94],[212,101],[128,56],[44,101],[32,94]], c: [156,213,255] },
  { p: [[61,125],[91,142],[91,172],[61,155]], c: [83,155,250] },
  { p: [[158,151],[188,134],[188,164],[158,181]], c: [47,101,189] }
];
const size = 256, raw = Buffer.alloc((size * 4 + 1) * size);
for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
  const sum = [0,0,0,0];
  for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
    const px = x + (sx + .5) / 4, py = y + (sy + .5) / 4;
    let color = null;
    for (const polygon of polygons) if (inside(px, py, polygon.p)) color = polygon.c;
    if (color) { for (let c = 0; c < 3; c++) sum[c] += color[c]; sum[3]++; }
  }
  const offset = y * (size * 4 + 1) + 1 + x * 4;
  if (sum[3]) for (let c = 0; c < 3; c++) raw[offset+c] = Math.round(sum[c]/sum[3]);
  raw[offset+3] = Math.round(sum[3] / 16 * 255);
}
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size,0); ihdr.writeUInt32BE(size,4); ihdr[8]=8; ihdr[9]=6;
const png = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
const ico = Buffer.alloc(22); ico.writeUInt16LE(1,2); ico.writeUInt16LE(1,4);
ico.writeUInt16LE(1,10); ico.writeUInt16LE(32,12); ico.writeUInt32LE(png.length,14); ico.writeUInt32LE(22,18);
fs.writeFileSync(path.join(__dirname,'icon.ico'), Buffer.concat([ico,png]));
console.log('icon.ico: 256x256, RGBA PNG');
