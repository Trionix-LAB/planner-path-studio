'use strict';

/**
 * Pure-JS TIFF → PNG decoder for Electron main process.
 * Uses only Node.js built-in modules (zlib).
 *
 * Supported TIFF variants:
 *   Compression: 1 (None), 5 (LZW), 8/32946 (Deflate/ZIP), 32773 (PackBits)
 *   PhotometricInterpretation: 0/1 (Grayscale/bilevel), 2 (RGB), 3 (Palette)
 *   BitsPerSample: 1, 4, 8, 16 per channel
 *   SamplesPerPixel: 1..4
 *   PlanarConfiguration: 1 (chunky) only
 *   Strip-based and Tile-based layouts
 */

const zlib = require('zlib');
const workerThreads = (() => {
  try {
    return require('worker_threads');
  } catch {
    return null;
  }
})();

const Worker = workerThreads?.Worker ?? null;
const isMainThread = workerThreads?.isMainThread ?? true;
const parentPort = workerThreads?.parentPort ?? null;
const workerData = workerThreads?.workerData;
const DECODE_TIMEOUT_MS = 30000;
const WORKER_MODE = '__plannerTiffDecodeWorker';

// ---- byte readers -----------------------------------------------------------

const u16le = (b, o) => b[o] | (b[o + 1] << 8);
const u16be = (b, o) => (b[o] << 8) | b[o + 1];
const u32le = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const u32be = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;

// ---- IFD parsing ------------------------------------------------------------

const TAG = {
  WIDTH: 256, HEIGHT: 257, BPS: 258, COMPRESSION: 259, PHOTO: 262,
  STRIP_OFFSETS: 273, SPP: 277, ROWS_PER_STRIP: 278, STRIP_COUNTS: 279,
  PLANAR: 284, PREDICTOR: 317, COLOR_MAP: 320,
  TILE_W: 322, TILE_H: 323, TILE_OFFSETS: 324, TILE_COUNTS: 325,
  EXTRA_SAMPLES: 338,
};

const TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };

function parseTiff(buf) {
  if (!buf || buf.length < 8) return null;
  const bo = String.fromCharCode(buf[0]) + String.fromCharCode(buf[1]);
  if (bo !== 'II' && bo !== 'MM') return null;
  const le = bo === 'II';
  const ru16 = le ? u16le : u16be;
  const ru32 = le ? u32le : u32be;
  if (ru16(buf, 2) !== 42) return null;

  const ifdOff = ru32(buf, 4);
  if (ifdOff + 2 > buf.length) return null;
  const cnt = ru16(buf, ifdOff);

  const raw = {};
  for (let i = 0; i < cnt; i++) {
    const base = ifdOff + 2 + i * 12;
    if (base + 12 > buf.length) break;
    const tag = ru16(buf, base);
    const type = ru16(buf, base + 2);
    const count = ru32(buf, base + 4);
    const sz = TYPE_SIZE[type] ?? 1;
    const totalBytes = sz * count;
    const dataOff = totalBytes <= 4 ? base + 8 : ru32(buf, base + 8);

    const vals = [];
    for (let j = 0; j < count; j++) {
      const o = dataOff + j * sz;
      if (o + sz > buf.length) break;
      switch (type) {
        case 1: case 6: case 7: vals.push(buf[o]); break;
        case 3: case 8: vals.push(ru16(buf, o)); break;
        case 4: case 9: vals.push(ru32(buf, o)); break;
        case 5: case 10: {
          const num = ru32(buf, o);
          const den = ru32(buf, o + 4);
          vals.push(den ? num / den : 0);
          break;
        }
        case 11: vals.push(buf.readFloatBE ? (le ? buf.readFloatLE(o) : buf.readFloatBE(o)) : 0); break;
        case 12: vals.push(buf.readDoubleBE ? (le ? buf.readDoubleLE(o) : buf.readDoubleBE(o)) : 0); break;
        default: vals.push(0);
      }
    }
    raw[tag] = vals;
  }
  return { tags: raw, le };
}

function tv(tags, id, def) { return tags[id]?.[0] ?? def; }
function ta(tags, id) { return tags[id] ?? []; }

// ---- decompression ----------------------------------------------------------

function decompressLZW(input) {
  // TIFF LZW: MSB-first bit packing, CLEAR=256, EOI=257, early change.
  // Performance-optimized: uses a flat buffer + offset/length table instead of
  // arrays-of-arrays, and a pre-built output buffer instead of push().
  const CLEAR = 256, EOI = 257;
  const inputLen = input.length;
  const maxBits = inputLen * 8;

  // String table stored as flat buffer with offset+length index.
  // Max 4096 entries. Each entry is stored contiguously in tableBuf.
  let tableBuf = Buffer.alloc(Math.min(inputLen * 4, 4 * 1024 * 1024));
  const tableOff = new Uint32Array(4096); // start offset in tableBuf
  const tableLen = new Uint16Array(4096); // length of entry
  let tableBufPos = 0;
  let nextCode = 0;

  function resetTable() {
    tableBufPos = 256;
    for (let i = 0; i < 256; i++) {
      tableBuf[i] = i;
      tableOff[i] = i;
      tableLen[i] = 1;
    }
    nextCode = 258;
  }
  resetTable();

  function addEntry(prefixCode, appendByte) {
    if (nextCode >= 4096) return;
    const pOff = tableOff[prefixCode];
    const pLen = tableLen[prefixCode];
    const need = tableBufPos + pLen + 1;
    if (need > tableBuf.length) {
      const newBuf = Buffer.alloc(Math.max(tableBuf.length * 2, need + 65536));
      tableBuf.copy(newBuf);
      tableBuf = newBuf;
    }
    tableBuf.copy(tableBuf, tableBufPos, pOff, pOff + pLen);
    tableBuf[tableBufPos + pLen] = appendByte;
    tableOff[nextCode] = tableBufPos;
    tableLen[nextCode] = pLen + 1;
    tableBufPos += pLen + 1;
    nextCode++;
  }

  // Output buffer — grow as needed
  let out = Buffer.alloc(Math.min(inputLen * 3, 16 * 1024 * 1024));
  let outPos = 0;

  function emit(code) {
    const off = tableOff[code];
    const len = tableLen[code];
    if (outPos + len > out.length) {
      const newOut = Buffer.alloc(Math.max(out.length * 2, outPos + len + 1024 * 1024));
      out.copy(newOut);
      out = newOut;
    }
    tableBuf.copy(out, outPos, off, off + len);
    outPos += len;
  }

  // Bit reader — MSB first
  let bitPos = 0;
  let codeSize = 9;

  function readCode() {
    if (bitPos + codeSize > maxBits) return EOI;
    // Fast path: read up to 3 bytes spanning the code
    const byteOff = bitPos >> 3;
    const bitOff = bitPos & 7;
    // Assemble up to 24 bits starting at byteOff
    let raw = (input[byteOff] ?? 0) << 16
            | (input[byteOff + 1] ?? 0) << 8
            | (input[byteOff + 2] ?? 0);
    // Extract codeSize bits starting at bitOff from MSB
    const code = (raw >> (24 - bitOff - codeSize)) & ((1 << codeSize) - 1);
    bitPos += codeSize;
    return code;
  }

  let prevCode = -1;
  for (;;) {
    const code = readCode();
    if (code === EOI) break;

    if (code === CLEAR) {
      resetTable();
      codeSize = 9;
      prevCode = -1;
      continue;
    }

    if (prevCode === -1) {
      // First code after CLEAR — must be a literal
      emit(code);
      prevCode = code;
      continue;
    }

    if (code < nextCode) {
      // Code is in table
      emit(code);
      const firstByte = tableBuf[tableOff[code]];
      addEntry(prevCode, firstByte);
    } else if (code === nextCode) {
      // Special case: code not yet in table
      const firstByte = tableBuf[tableOff[prevCode]];
      addEntry(prevCode, firstByte);
      emit(code);
    } else {
      // Corrupted stream
      break;
    }

    // TIFF "early change": bump BEFORE reading the next code
    if (nextCode >= (1 << codeSize) - 1 && codeSize < 12) {
      codeSize++;
    }

    prevCode = code;
  }

  return out.subarray(0, outPos);
}

function decompressPackBits(input, expectedLen) {
  const out = Buffer.alloc(expectedLen);
  let ip = 0, op = 0;
  while (ip < input.length && op < expectedLen) {
    // n must be interpreted as signed byte
    let n = input[ip++];
    if (n > 127) n = n - 256;
    if (n >= 0) {
      const count = n + 1;
      for (let i = 0; i < count && ip < input.length && op < expectedLen; i++) {
        out[op++] = input[ip++];
      }
    } else if (n !== -128) {
      const count = 1 - n;
      const val = input[ip++] ?? 0;
      for (let i = 0; i < count && op < expectedLen; i++) {
        out[op++] = val;
      }
    }
  }
  return out.subarray(0, op);
}

function decompressDeflate(input) {
  try {
    return zlib.inflateSync(Buffer.from(input));
  } catch {
    // Some TIFFs use raw deflate without zlib header
    try {
      return zlib.inflateRawSync(Buffer.from(input));
    } catch {
      return null;
    }
  }
}

function decompress(data, compression, expectedLen) {
  switch (compression) {
    case 1: return data; // no compression
    case 5: return decompressLZW(data);
    case 8: case 32946: return decompressDeflate(data); // Deflate/ZIP
    case 32773: return decompressPackBits(data, expectedLen);
    default: return null;
  }
}

// ---- predictor (horizontal differencing) ------------------------------------

/**
 * Undo horizontal differencing predictor (TIFF Predictor=2).
 * Each sample is stored as the difference from the previous sample in that row.
 * After decompression, we must cumulatively add to recover the original values.
 */
function applyPredictor(data, predictor, w, h, spp, bps) {
  if (predictor !== 2) return data;
  // Only 8-bit and 16-bit supported for predictor
  if (bps !== 8 && bps !== 16) return data;

  const bytesPerSample = bps >> 3; // 1 for 8-bit, 2 for 16-bit
  const bytesPerRow = w * spp * bytesPerSample;
  const out = Buffer.from(data); // copy so we don't mutate input

  for (let row = 0; row < h; row++) {
    const rowOff = row * bytesPerRow;
    // First pixel in each row is stored as-is; undiff starts at pixel 1
    if (bps === 8) {
      for (let i = spp; i < w * spp; i++) {
        out[rowOff + i] = (out[rowOff + i] + out[rowOff + i - spp]) & 0xff;
      }
    } else { // bps === 16
      for (let i = spp; i < w * spp; i++) {
        const cur = rowOff + i * 2;
        const prev = rowOff + (i - spp) * 2;
        // Read 16-bit values in file byte order (LE for II, BE for MM)
        // But predictor operates on raw bytes regardless of endianness in TIFF spec:
        // each byte pair forms the sample, differencing is per-sample
        const curVal = out[cur] | (out[cur + 1] << 8);
        const prevVal = out[prev] | (out[prev + 1] << 8);
        const sum = (curVal + prevVal) & 0xffff;
        out[cur] = sum & 0xff;
        out[cur + 1] = (sum >> 8) & 0xff;
      }
    }
  }
  return out;
}

// ---- pixel decoding ---------------------------------------------------------

function decodeStrip(stripData, w, h, bpsArr, spp, photo, colorMap, le) {
  const rgba = Buffer.alloc(w * h * 4);
  const bps = bpsArr[0] ?? 8;
  const bytesPerRow = Math.ceil((w * spp * bps) / 8);

  for (let row = 0; row < h; row++) {
    const rowOff = row * bytesPerRow;
    for (let col = 0; col < w; col++) {
      const outIdx = (row * w + col) * 4;
      const samples = [];

      for (let s = 0; s < spp; s++) {
        let val = 0;
        if (bps === 8) {
          const off = rowOff + col * spp + s;
          val = stripData[off] ?? 0;
        } else if (bps === 16) {
          const off = rowOff + (col * spp + s) * 2;
          const b0 = stripData[off] ?? 0;
          const b1 = stripData[off + 1] ?? 0;
          // TIFF pixel data follows file byte order
          val = le ? (b1 << 8 | b0) : (b0 << 8 | b1);
          val = (val + 128) >> 8; // scale 16→8 bit (faster than /257)
        } else if (bps === 4) {
          const bitOff = (col * spp + s) * 4;
          const byteOff = rowOff + (bitOff >> 3);
          const nibbleHigh = (bitOff & 7) === 0;
          const raw = stripData[byteOff] ?? 0;
          val = nibbleHigh ? (raw >> 4) & 0xf : raw & 0xf;
          val = (val * 255 + 7) / 15 | 0;
        } else if (bps === 1) {
          const bitOff = (col * spp + s);
          const byteOff = rowOff + (bitOff >> 3);
          const bitIdx = 7 - (bitOff & 7);
          val = ((stripData[byteOff] ?? 0) >> bitIdx) & 1 ? 255 : 0;
        } else {
          const off = rowOff + col * spp + s;
          val = stripData[off] ?? 0;
        }
        samples.push(val);
      }

      switch (photo) {
        case 0: // WhiteIsZero
        case 1: { // BlackIsZero (MinIsBlack)
          let g = samples[0] ?? 0;
          if (photo === 0) g = 255 - g;
          rgba[outIdx] = g;
          rgba[outIdx + 1] = g;
          rgba[outIdx + 2] = g;
          rgba[outIdx + 3] = spp >= 2 ? (samples[1] ?? 255) : 255;
          break;
        }
        case 2: { // RGB
          rgba[outIdx] = samples[0] ?? 0;
          rgba[outIdx + 1] = samples[1] ?? 0;
          rgba[outIdx + 2] = samples[2] ?? 0;
          rgba[outIdx + 3] = spp >= 4 ? (samples[3] ?? 255) : 255;
          break;
        }
        case 3: { // Palette
          const idx = samples[0] ?? 0;
          if (colorMap && colorMap.length >= 768) {
            // colorMap: R0..R255, G0..G255, B0..B255, each 16-bit value
            rgba[outIdx] = (colorMap[idx] + 128) >> 8;
            rgba[outIdx + 1] = (colorMap[256 + idx] + 128) >> 8;
            rgba[outIdx + 2] = (colorMap[512 + idx] + 128) >> 8;
            rgba[outIdx + 3] = 255;
          } else {
            rgba[outIdx] = idx;
            rgba[outIdx + 1] = idx;
            rgba[outIdx + 2] = idx;
            rgba[outIdx + 3] = 255;
          }
          break;
        }
        default: {
          rgba[outIdx] = samples[0] ?? 0;
          rgba[outIdx + 1] = samples[1] ?? samples[0] ?? 0;
          rgba[outIdx + 2] = samples[2] ?? samples[0] ?? 0;
          rgba[outIdx + 3] = 255;
        }
      }
    }
  }
  return rgba;
}

// ---- PNG encoder (uses Node zlib) -------------------------------------------

const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[i] = c;
}

function crc32(buf, start, end) {
  let crc = 0xffffffff;
  for (let i = start; i < end; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(12 + len);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk, 4, 8 + len), 8 + len);
  return chunk;
}

function encodePng(w, h, rgba) {
  // Detect alpha
  let hasAlpha = false;
  for (let i = 3; i < w * h * 4; i += 4) {
    if (rgba[i] !== 255) { hasAlpha = true; break; }
  }

  const ch = hasAlpha ? 4 : 3;
  const colorType = hasAlpha ? 6 : 2;

  // Build raw scanlines with Sub filter (filter byte 1) for better compression.
  // Sub filter: each byte stores the difference from the byte `ch` positions back.
  const rowLen = 1 + w * ch;
  const raw = Buffer.alloc(h * rowLen);
  for (let y = 0; y < h; y++) {
    const rowDst = y * rowLen;
    raw[rowDst] = 1; // filter: Sub
    for (let x = 0; x < w; x++) {
      const si = (y * w + x) * 4;
      const di = rowDst + 1 + x * ch;
      if (x === 0) {
        raw[di] = rgba[si];
        raw[di + 1] = rgba[si + 1];
        raw[di + 2] = rgba[si + 2];
        if (hasAlpha) raw[di + 3] = rgba[si + 3];
      } else {
        const pi = si - 4; // previous pixel in rgba
        raw[di] = (rgba[si] - rgba[pi]) & 0xff;
        raw[di + 1] = (rgba[si + 1] - rgba[pi + 1]) & 0xff;
        raw[di + 2] = (rgba[si + 2] - rgba[pi + 2]) & 0xff;
        if (hasAlpha) raw[di + 3] = (rgba[si + 3] - rgba[pi + 3]) & 0xff;
      }
    }
  }

  const compressed = zlib.deflateSync(raw, { level: 6 });

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = colorType;
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  return Buffer.concat([
    PNG_SIG,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- main entry point -------------------------------------------------------

/**
 * @param {Buffer} buf - TIFF file buffer
 * @returns {Buffer|null} - PNG file buffer or null
 */
function decodeTiffToPng(buf) {
  try {
    const parsed = parseTiff(buf);
    if (!parsed) return null;
    const { tags, le } = parsed;

    const w = tv(tags, TAG.WIDTH, 0);
    const h = tv(tags, TAG.HEIGHT, 0);
    if (w <= 0 || h <= 0 || w > 65536 || h > 65536) return null;

    const compression = tv(tags, TAG.COMPRESSION, 1);
    const photo = tv(tags, TAG.PHOTO, 1);
    const spp = tv(tags, TAG.SPP, 1);
    const bpsArr = ta(tags, TAG.BPS);
    if (bpsArr.length === 0) bpsArr.push(photo === 3 ? 8 : 8);
    const planar = tv(tags, TAG.PLANAR, 1);
    if (planar !== 1) return null;

    const predictor = tv(tags, TAG.PREDICTOR, 1);
    const colorMap = photo === 3 ? ta(tags, TAG.COLOR_MAP) : null;
    const bps = bpsArr[0] ?? 8;
    const bytesPerRow = Math.ceil((w * spp * bps) / 8);

    // Output RGBA
    const rgba = Buffer.alloc(w * h * 4);

    const isTiled = tags[TAG.TILE_W] != null;

    if (isTiled) {
      const tw = tv(tags, TAG.TILE_W, 256);
      const th = tv(tags, TAG.TILE_H, 256);
      const tileOffsets = ta(tags, TAG.TILE_OFFSETS);
      const tileCounts = ta(tags, TAG.TILE_COUNTS);
      const tilesX = Math.ceil(w / tw);
      const tilesY = Math.ceil(h / th);
      const tileBytesPerRow = Math.ceil((tw * spp * bps) / 8);

      for (let ty = 0; ty < tilesY; ty++) {
        for (let tx = 0; tx < tilesX; tx++) {
          const idx = ty * tilesX + tx;
          if (idx >= tileOffsets.length) continue;
          const off = tileOffsets[idx];
          const len = tileCounts[idx] ?? (buf.length - off);
          if (off + len > buf.length) continue;

          const raw = buf.subarray(off, off + len);
          const expected = th * tileBytesPerRow;
          let dec = decompress(raw, compression, expected);
          if (!dec) return null;
          dec = applyPredictor(dec, predictor, tw, th, spp, bps);

          const tileRgba = decodeStrip(dec, tw, th, bpsArr, spp, photo, colorMap, le);

          // Blit tile into output (clipping to image bounds)
          const x0 = tx * tw, y0 = ty * th;
          const x1 = Math.min(x0 + tw, w);
          const y1 = Math.min(y0 + th, h);
          for (let y = y0; y < y1; y++) {
            for (let x = x0; x < x1; x++) {
              const src = ((y - y0) * tw + (x - x0)) * 4;
              const dst = (y * w + x) * 4;
              rgba[dst] = tileRgba[src];
              rgba[dst + 1] = tileRgba[src + 1];
              rgba[dst + 2] = tileRgba[src + 2];
              rgba[dst + 3] = tileRgba[src + 3];
            }
          }
        }
      }
    } else {
      // Strip-based
      const rps = tv(tags, TAG.ROWS_PER_STRIP, h);
      const stripOffs = ta(tags, TAG.STRIP_OFFSETS);
      const stripCnts = ta(tags, TAG.STRIP_COUNTS);
      if (stripOffs.length === 0) return null;

      let curRow = 0;
      for (let s = 0; s < stripOffs.length && curRow < h; s++) {
        const off = stripOffs[s];
        const len = stripCnts[s] ?? (buf.length - off);
        if (off + len > buf.length) continue;
        const rows = Math.min(rps, h - curRow);

        const raw = buf.subarray(off, off + len);
        const expected = rows * bytesPerRow;
        let dec = decompress(raw, compression, expected);
        if (!dec) return null;
        dec = applyPredictor(dec, predictor, w, rows, spp, bps);

        const stripRgba = decodeStrip(dec, w, rows, bpsArr, spp, photo, colorMap, le);
        stripRgba.copy(rgba, curRow * w * 4, 0, rows * w * 4);
        curRow += rows;
      }
    }

    return encodePng(w, h, rgba);
  } catch {
    return null;
  }
}

function decodeTiffToPngAsync(buf, options = {}) {
  if (!buf || buf.length === 0) return Promise.resolve(null);
  if (!Worker) return Promise.resolve(decodeTiffToPng(buf));

  const timeoutMs =
    Number.isFinite(options?.timeoutMs) && options.timeoutMs > 0
      ? Math.trunc(options.timeoutMs)
      : DECODE_TIMEOUT_MS;

  return new Promise((resolve) => {
    const inputBuffer = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
    let worker = null;
    try {
      worker = new Worker(__filename, {
        workerData: {
          [WORKER_MODE]: true,
          inputBuffer,
        },
      });
    } catch {
      resolve(decodeTiffToPng(inputBuffer));
      return;
    }

    let settled = false;
    let timeoutId = null;

    const settle = (value) => {
      if (settled) return;
      settled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      resolve(value);
    };

    worker.once('message', (payload) => {
      if (payload?.ok && payload?.png) {
        settle(Buffer.from(payload.png));
        return;
      }
      settle(null);
    });

    worker.once('error', () => {
      settle(null);
    });

    worker.once('exit', (code) => {
      if (settled) return;
      if (code !== 0) {
        settle(null);
        return;
      }
      settle(null);
    });

    timeoutId = setTimeout(() => {
      worker.terminate().catch(() => {});
      settle(null);
    }, timeoutMs);
  });
}

if (!isMainThread && parentPort && workerData?.[WORKER_MODE]) {
  try {
    const inputBuffer = Buffer.isBuffer(workerData?.inputBuffer)
      ? workerData.inputBuffer
      : Buffer.from(workerData?.inputBuffer ?? []);
    const pngBuffer = decodeTiffToPng(inputBuffer);
    if (pngBuffer && pngBuffer.length > 0) {
      parentPort.postMessage({ ok: true, png: pngBuffer });
    } else {
      parentPort.postMessage({ ok: false });
    }
  } catch {
    parentPort.postMessage({ ok: false });
  }
}

module.exports = { decodeTiffToPng, decodeTiffToPngAsync };
