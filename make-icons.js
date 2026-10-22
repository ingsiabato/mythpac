// Genera los iconos PNG de la PWA sin dependencias externas.
// Uso: node make-icons.js
const fs = require("fs");
const zlib = require("zlib");

/* ---------- codificador PNG ---------- */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
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
function png(size, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bits por canal
  ihdr[9] = 6;  // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

/* ---------- dibujo ---------- */
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const mix = (a, b, t) => a + (b - a) * t;
function mixColor(c1, c2, t) {
  return [mix(c1[0], c2[0], t), mix(c1[1], c2[1], t), mix(c1[2], c2[2], t)];
}
function insideEllipse(x, y, cx, cy, rx, ry, rot) {
  const dx = x - cx, dy = y - cy;
  const c = Math.cos(rot), s = Math.sin(rot);
  const u = dx * c + dy * s, v = -dx * s + dy * c;
  return (u * u) / (rx * rx) + (v * v) / (ry * ry) <= 1;
}

// Escena en coordenadas normalizadas 0..1.
function scene(x, y, maskable) {
  // fondo: degradado radial púrpura -> negro
  const dx = x - 0.32, dy = y - 0.18;
  const d = clamp(Math.sqrt(dx * dx + dy * dy) / 0.95, 0, 1);
  let col = mixColor([45, 26, 99], [6, 3, 15], Math.pow(d, 0.85));

  // halo dorado suave
  const hd = Math.hypot(x - 0.5, y - 0.53);
  const halo = clamp(1 - hd / 0.46, 0, 1);
  col = mixColor(col, [120, 70, 20], halo * halo * 0.35);

  // escala para la variante maskable (zona segura del 80%)
  const s = maskable ? 0.8 : 1;
  const cx = 0.5, cy = 0.5 + (0.53 - 0.5) * s;
  const r = 0.27 * s;

  // plumas del chamán (detrás de la cabeza)
  if (insideEllipse(x, y, cx + 0.10 * s, cy - 0.35 * s, 0.055 * s, 0.16 * s, -0.55)) col = [46, 196, 128];
  if (insideEllipse(x, y, cx + 0.19 * s, cy - 0.31 * s, 0.045 * s, 0.13 * s, -0.30)) col = [230, 78, 60];
  if (insideEllipse(x, y, cx + 0.01 * s, cy - 0.33 * s, 0.04 * s, 0.12 * s, -0.85)) col = [255, 196, 64];

  // cabeza dorada (pac-man)
  if (Math.hypot(x - cx, y - cy) <= r) {
    const ang = Math.atan2(y - cy, x - cx);
    const mouth = 0.62; // media apertura del hocico
    if (!(Math.abs(ang) < mouth)) {
      // sombreado radial
      const t = clamp((Math.hypot(x - cx, y - cy) / r) * 0.9, 0, 1);
      col = mixColor([255, 231, 130], [255, 159, 28], t);
      // brillo superior
      if (y < cy - r * 0.35) col = mixColor(col, [255, 248, 210], 0.35);
    }
  }

  // aro decorativo
  const ringD = Math.abs(Math.hypot(x - 0.5, y - 0.5) - 0.435 * s);
  if (ringD < 0.007 * s) col = mixColor(col, [255, 210, 90], 0.55);

  return col;
}

function render(size, maskable) {
  const SS = 4; // supersampling para bordes suaves
  const out = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (px + (sx + 0.5) / SS) / size;
          const y = (py + (sy + 0.5) / SS) / size;
          const c = scene(x, y, maskable);
          r += c[0]; g += c[1]; b += c[2];
        }
      }
      const n = SS * SS;
      const i = (py * size + px) * 4;
      out[i] = Math.round(r / n);
      out[i + 1] = Math.round(g / n);
      out[i + 2] = Math.round(b / n);
      out[i + 3] = 255;
    }
  }
  return png(size, out);
}

const files = [
  ["icon-192.png", 192, false],
  ["icon-512.png", 512, false],
  ["icon-maskable-192.png", 192, true],
  ["icon-maskable-512.png", 512, true],
  ["apple-touch-icon.png", 180, false]
];
for (const [name, size, mask] of files) {
  fs.writeFileSync(name, render(size, mask));
  console.log("ok", name, size + "x" + size);
}
