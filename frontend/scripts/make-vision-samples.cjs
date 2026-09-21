// Generates the committed sample photo(s) the vision lessons look at, as real
// PNG files under public/vision/. These are ordinary decoded images — cv2.imread
// in the app turns them back into the exact RGBA pixels drawn here, and every CV
// operation genuinely computes over these bytes. Deterministic: same output every
// run, so the committed PNG and the harness's expectations never drift.
//
//   node scripts/make-vision-samples.cjs
//
// scene.png: a simple outdoor scene — blue sky, green grass, a yellow sun, and a
// red ball. The distinct, hand-picked colours make grayscale (502) and the red
// colour mask (503) visibly and checkably correct.
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const W = 240;
const H = 160;

// --- draw the scene into an RGBA buffer (canvas ImageData layout) ---
const rgba = Buffer.alloc(W * H * 4);
const put = (x, y, r, g, b) => {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const i = (y * W + x) * 4;
  rgba[i] = r;
  rgba[i + 1] = g;
  rgba[i + 2] = b;
  rgba[i + 3] = 255;
};
const disk = (cx, cy, radius, r, g, b) => {
  for (let y = cy - radius; y <= cy + radius; y++) {
    for (let x = cx - radius; x <= cx + radius; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= radius * radius) put(x, y, r, g, b);
    }
  }
};

const HORIZON = Math.round(H * 0.6);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (y < HORIZON) {
      // Sky: a gentle vertical blue gradient (lighter near the horizon).
      const t = y / HORIZON;
      put(x, y, Math.round(70 + 40 * t), Math.round(120 + 40 * t), 230);
    } else {
      // Grass: a solid green.
      put(x, y, 70, 160, 70);
    }
  }
}
disk(44, 34, 20, 255, 220, 60); // sun, top-left, yellow
disk(150, 104, 28, 220, 40, 40); // ball, red — the target for the colour mask

// --- encode to PNG (8-bit RGBA, no interlace) ---
const CRC = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return (buf) => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
})();

const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(CRC(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
};

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // colour type: RGBA
ihdr[10] = 0; // compression
ihdr[11] = 0; // filter
ihdr[12] = 0; // interlace

// Raw image data: each scanline prefixed with a filter-type byte (0 = none).
const raw = Buffer.alloc(H * (1 + W * 4));
for (let y = 0; y < H; y++) {
  const rowStart = y * (1 + W * 4);
  raw[rowStart] = 0;
  rgba.copy(raw, rowStart + 1, y * W * 4, (y + 1) * W * 4);
}
const idat = zlib.deflateSync(raw, { level: 9 });

const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const png = Buffer.concat([
  SIG,
  chunk("IHDR", ihdr),
  chunk("IDAT", idat),
  chunk("IEND", Buffer.alloc(0)),
]);

const outDir = path.join(__dirname, "..", "public", "vision");
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "scene.png");
fs.writeFileSync(outPath, png);
console.log("wrote", outPath, `(${W}x${H}, ${png.length} bytes)`);
