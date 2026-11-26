// Génère les icônes PNG de l'application (sans dépendance).
// Utilisation : node tools/make-icons.js [dossier de sortie]
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Couleur d'un point (u, v entre 0 et 1) : renvoie [r, g, b, a]
function shade(u, v, rounded) {
  // fond : carré arrondi avec dégradé vert
  if (rounded) {
    const r = 0.22, m = 0.02;
    const dx = Math.max(m + r - u, 0, u - (1 - m - r));
    const dy = Math.max(m + r - v, 0, v - (1 - m - r));
    if (dx * dx + dy * dy > r * r) return [0, 0, 0, 0];
  }
  // fond « encre marine » en léger dégradé
  const t = (u + v) / 2;
  let col = [29 + 14 * t, 42 + 20 * t, 68 + 30 * t];
  // fines lignes gravées dorées en arrière-plan, comme sur un billet
  const wave = Math.abs(((v * 14 + Math.sin(u * Math.PI * 2) * 0.6) % 1) - 0.5);
  if (wave < 0.035) col = col.map((c, i) => c + ([227, 199, 122][i] - c) * 0.18);
  // portefeuille stylisé : couleur papier, rabat doré, fermoir encre
  const inRoundRect = (x0, y0, x1, y1, rr) => {
    const cx = Math.min(Math.max(u, x0 + rr), x1 - rr);
    const cy = Math.min(Math.max(v, y0 + rr), y1 - rr);
    return (u - cx) ** 2 + (v - cy) ** 2 <= rr * rr && u >= x0 && u <= x1 && v >= y0 && v <= y1;
  };
  if (inRoundRect(0.27, 0.30, 0.73, 0.70, 0.06)) col = [246, 242, 231];
  if (inRoundRect(0.27, 0.30, 0.73, 0.40, 0.05)) col = [227, 199, 122];
  if (inRoundRect(0.55, 0.46, 0.76, 0.60, 0.05)) col = [29, 42, 68];
  if ((u - 0.62) ** 2 + (v - 0.53) ** 2 <= 0.025 ** 2) col = [227, 199, 122];
  return [...col, 255];
}

function draw(size, rounded) {
  const ss = 4; // suréchantillonnage pour des bords lisses
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
        const p = shade((x + (sx + 0.5) / ss) / size, (y + (sy + 0.5) / ss) / size, rounded);
        r += p[0] * p[3]; g += p[1] * p[3]; b += p[2] * p[3]; a += p[3];
      }
      const i = (y * size + x) * 4;
      buf[i] = a ? r / a : 0; buf[i + 1] = a ? g / a : 0; buf[i + 2] = a ? b / a : 0; buf[i + 3] = a / (ss * ss);
    }
  }
  return png(size, buf);
}

const out = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, '..', 'icons');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'icon-192.png'), draw(192, true));
fs.writeFileSync(path.join(out, 'icon-512.png'), draw(512, true));
fs.writeFileSync(path.join(out, 'maskable-512.png'), draw(512, false));
console.log('Icônes créées dans', out);
