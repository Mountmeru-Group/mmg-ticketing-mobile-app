// Reads a PNG into RGBA pixels with Node's own zlib: enough for the app's assets (8-bit RGB or RGBA, not interlaced).
// Used by tests that check the start-up images against the geometry the app draws them at.
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

export function readPng(file) {
  const buf = readFileSync(file);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error(`${file}: not a PNG`);
  let width = 0;
  let height = 0;
  let channels = 0;
  const idat = [];
  for (let at = 8; at < buf.length; ) {
    const length = buf.readUInt32BE(at);
    const type = buf.toString('latin1', at + 4, at + 8);
    const data = buf.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const [depth, colour, , , interlace] = data.subarray(8, 13);
      channels = { 2: 3, 6: 4 }[colour];
      if (depth !== 8 || !channels || interlace !== 0) throw new Error(`${file}: unsupported PNG layout`);
    } else if (type === 'IDAT') idat.push(data);
    at += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const rows = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? rows[y * stride + i - channels] : 0;
      const b = y > 0 ? rows[(y - 1) * stride + i] : 0;
      const c = y > 0 && i >= channels ? rows[(y - 1) * stride + i - channels] : 0;
      const p = a + b - c;
      const pa = Math.abs(p - a);
      const pb = Math.abs(p - b);
      const pc = Math.abs(p - c);
      const predictor = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][filter];
      rows[y * stride + i] = (line[i] + predictor) & 0xff;
    }
  }
  /** [r, g, b, a] at (x, y). */
  const at = (x, y) => {
    const o = y * stride + x * channels;
    return [rows[o], rows[o + 1], rows[o + 2], channels === 4 ? rows[o + 3] : 255];
  };
  return { width, height, at };
}
