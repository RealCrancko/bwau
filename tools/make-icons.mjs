// Erzeugt icon-180.png und icon-512.png (Hantel auf dunklem Grund) ohne Zusatzpakete
import fs from "fs"; import zlib from "zlib";
function png(size, file) {
  const bg = [15, 18, 22], fg = [127, 176, 224];
  const px = Buffer.alloc(size * size * 3);
  const s = size / 180, rect = (x, y, w, h) => { for (let yy = Math.round(y * s); yy < Math.round((y + h) * s); yy++) for (let xx = Math.round(x * s); xx < Math.round((x + w) * s); xx++) fg.forEach((v, k) => px[(yy * size + xx) * 3 + k] = v) };
  for (let i = 0; i < size * size; i++) bg.forEach((v, k) => px[i * 3 + k] = v);
  rect(30, 86, 120, 8);                 // Stange
  rect(44, 58, 14, 64); rect(122, 58, 14, 64);   // große Scheiben
  rect(32, 70, 10, 40); rect(138, 70, 10, 40);   // kleine Scheiben
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) { raw[y * (size * 3 + 1)] = 0; px.copy(raw, y * (size * 3 + 1) + 1, y * size * 3, (y + 1) * size * 3) }
  const crc = b => { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)) } return ~c >>> 0 };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]) };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
}
png(180, "icon-180.png"); png(512, "icon-512.png");
