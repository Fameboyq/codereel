// Pure TypeScript Animated GIF89a Encoder (Global Median-Cut Palette + LZW Compression)

export interface GifFrameInput {
  rgba: Uint8ClampedArray;
  delayMs: number;
}

interface ColorBox {
  colors: number[]; // packed 0xRRGGBB
  counts: number[];
}

function packRgb555(r: number, g: number, b: number): number {
  return ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
}

function buildGlobalPalette(frames: GifFrameInput[], maxColors = 256): {
  palette: Uint8Array;
  lut: Uint8Array;
} {
  const hist = new Map<number, number>();
  const sampleFrameIndices =
    frames.length <= 6
      ? frames.map((_, i) => i)
      : [0, Math.floor(frames.length * 0.25), Math.floor(frames.length * 0.5), Math.floor(frames.length * 0.75), frames.length - 1];

  for (const fi of sampleFrameIndices) {
    const rgba = frames[fi]!.rgba;
    // Sample every 2nd pixel on dense frames to keep palette construction fast
    const step = rgba.length > 400_000 * 4 ? 8 : 4;
    for (let i = 0; i < rgba.length; i += step) {
      const a = rgba[i + 3]!;
      if (a < 128) continue;
      const r = rgba[i]!;
      const g = rgba[i + 1]!;
      const b = rgba[i + 2]!;
      const key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
      hist.set(key, (hist.get(key) ?? 0) + 1);
    }
  }

  const initialColors: number[] = [];
  const initialCounts: number[] = [];
  for (const [key, count] of hist.entries()) {
    const r = ((key >> 12) & 0x3f) << 2;
    const g = ((key >> 6) & 0x3f) << 2;
    const b = (key & 0x3f) << 2;
    initialColors.push((r << 16) | (g << 8) | b);
    initialCounts.push(count);
  }

  if (initialColors.length === 0) {
    initialColors.push(0x000000);
    initialCounts.push(1);
  }

  const boxes: ColorBox[] = [{ colors: initialColors, counts: initialCounts }];

  const getChannelRange = (box: ColorBox) => {
    let minR = 255, maxR = 0;
    let minG = 255, maxG = 0;
    let minB = 255, maxB = 0;
    for (const c of box.colors) {
      const r = (c >> 16) & 0xff;
      const g = (c >> 8) & 0xff;
      const b = c & 0xff;
      if (r < minR) minR = r;
      if (r > maxR) maxR = r;
      if (g < minG) minG = g;
      if (g > maxG) maxG = g;
      if (b < minB) minB = b;
      if (b > maxB) maxB = b;
    }
    return {
      rRange: maxR - minR,
      gRange: maxG - minG,
      bRange: maxB - minB,
      maxRange: Math.max(maxR - minR, maxG - minG, maxB - minB),
    };
  };

  while (boxes.length < maxColors) {
    let bestIdx = -1;
    let bestScore = -1;
    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i]!;
      if (box.colors.length <= 1) continue;
      const { maxRange } = getChannelRange(box);
      if (maxRange > bestScore) {
        bestScore = maxRange;
        bestIdx = i;
      }
    }
    if (bestIdx === -1 || bestScore <= 2) break;

    const target = boxes.splice(bestIdx, 1)[0]!;
    const { rRange, gRange, bRange } = getChannelRange(target);
    const shift = rRange >= gRange && rRange >= bRange ? 16 : gRange >= bRange ? 8 : 0;

    const items = target.colors.map((c, idx) => ({ c, count: target.counts[idx]! }));
    items.sort((a, b) => ((a.c >> shift) & 0xff) - ((b.c >> shift) & 0xff));

    const totalWeight = items.reduce((acc, it) => acc + it.count, 0);
    let accum = 0;
    let split = 1;
    for (let i = 0; i < items.length - 1; i++) {
      accum += items[i]!.count;
      if (accum >= totalWeight / 2) {
        split = i + 1;
        break;
      }
    }

    const left = items.slice(0, split);
    const right = items.slice(split);
    boxes.push(
      { colors: left.map((x) => x.c), counts: left.map((x) => x.count) },
      { colors: right.map((x) => x.c), counts: right.map((x) => x.count) },
    );
  }

  const palette = new Uint8Array(256 * 3);
  const paletteRgb: Array<[number, number, number]> = [];
  for (let i = 0; i < Math.min(256, boxes.length); i++) {
    const box = boxes[i]!;
    let sumR = 0, sumG = 0, sumB = 0, weight = 0;
    for (let j = 0; j < box.colors.length; j++) {
      const c = box.colors[j]!;
      const w = box.counts[j]!;
      sumR += ((c >> 16) & 0xff) * w;
      sumG += ((c >> 8) & 0xff) * w;
      sumB += (c & 0xff) * w;
      weight += w;
    }
    const r = Math.min(255, Math.round(sumR / weight));
    const g = Math.min(255, Math.round(sumG / weight));
    const b = Math.min(255, Math.round(sumB / weight));
    palette[i * 3] = r;
    palette[i * 3 + 1] = g;
    palette[i * 3 + 2] = b;
    paletteRgb.push([r, g, b]);
  }

  // 15-bit RGB555 nearest-color lookup table for fast pixel indexing
  const lut = new Uint8Array(32768);
  for (let r5 = 0; r5 < 32; r5++) {
    const r = (r5 << 3) | (r5 >> 2);
    for (let g5 = 0; g5 < 32; g5++) {
      const g = (g5 << 3) | (g5 >> 2);
      for (let b5 = 0; b5 < 32; b5++) {
        const b = (b5 << 3) | (b5 >> 2);
        let best = 0;
        let bestDist = Infinity;
        for (let p = 0; p < paletteRgb.length; p++) {
          const [pr, pg, pb] = paletteRgb[p]!;
          const dr = r - pr;
          const dg = g - pg;
          const db = b - pb;
          const dist = dr * dr + dg * dg + db * db;
          if (dist < bestDist) {
            bestDist = dist;
            best = p;
          }
        }
        lut[(r5 << 10) | (g5 << 5) | b5] = best;
      }
    }
  }

  return { palette, lut };
}

function lzwCompress(indices: Uint8Array, minCodeSize = 8): Uint8Array {
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;
  const out: number[] = [];

  let codeSize = minCodeSize + 1;
  let nextCode = eoiCode + 1;
  let table = new Map<number, number>();

  const resetTable = () => {
    table = new Map<number, number>();
    codeSize = minCodeSize + 1;
    nextCode = eoiCode + 1;
  };

  let bitBuffer = 0;
  let bitCount = 0;
  let subBlock: number[] = [];

  const flushSubBlock = () => {
    if (subBlock.length === 0) return;
    out.push(subBlock.length, ...subBlock);
    subBlock = [];
  };

  const emitCode = (code: number) => {
    bitBuffer |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) {
      subBlock.push(bitBuffer & 0xff);
      if (subBlock.length === 255) flushSubBlock();
      bitBuffer >>= 8;
      bitCount -= 8;
    }
  };

  emitCode(clearCode);

  if (indices.length > 0) {
    let prefix = indices[0]!;
    for (let i = 1; i < indices.length; i++) {
      const k = indices[i]!;
      const key = (prefix << 12) | k;
      const existing = table.get(key);
      if (existing !== undefined) {
        prefix = existing;
      } else {
        emitCode(prefix);
        if (nextCode < 4096) {
          table.set(key, nextCode);
          if (nextCode === 1 << codeSize && codeSize < 12) {
            codeSize++;
          }
          nextCode++;
        } else {
          emitCode(clearCode);
          resetTable();
        }
        prefix = k;
      }
    }
    emitCode(prefix);
  }

  emitCode(eoiCode);
  if (bitCount > 0) {
    subBlock.push(bitBuffer & 0xff);
  }
  flushSubBlock();
  out.push(0x00); // block terminator

  return new Uint8Array(out);
}

/**
 * Encodes an array of RGBA frames into a looping GIF89a binary buffer.
 */
export function encodeGif(
  width: number,
  height: number,
  frames: GifFrameInput[],
): Uint8Array {
  if (width <= 0 || height <= 0) {
    throw new Error('GIF dimensions must be positive');
  }
  if (frames.length === 0) {
    throw new Error('At least one frame is required to encode GIF');
  }

  const expectedLen = width * height * 4;
  for (const frame of frames) {
    if (frame.rgba.length !== expectedLen) {
      throw new Error(`Expected RGBA buffer of length ${expectedLen}, got ${frame.rgba.length}`);
    }
  }

  const { palette, lut } = buildGlobalPalette(frames, 256);
  const chunks: number[] = [];

  const writeStr = (s: string) => {
    for (let i = 0; i < s.length; i++) chunks.push(s.charCodeAt(i));
  };
  const writeU16 = (v: number) => {
    chunks.push(v & 0xff, (v >> 8) & 0xff);
  };

  // Header
  writeStr('GIF89a');

  // Logical Screen Descriptor (256-color Global Color Table: 0xF7)
  writeU16(width);
  writeU16(height);
  chunks.push(0xf7, 0x00, 0x00);

  // Global Color Table (768 bytes)
  for (let i = 0; i < palette.length; i++) {
    chunks.push(palette[i]!);
  }

  // Netscape 2.0 Application Extension for infinite looping
  chunks.push(0x21, 0xff, 0x0b);
  writeStr('NETSCAPE2.0');
  chunks.push(0x03, 0x01, 0x00, 0x00, 0x00);

  const pixelCount = width * height;
  const indices = new Uint8Array(pixelCount);

  for (const frame of frames) {
    const rgba = frame.rgba;
    for (let p = 0; p < pixelCount; p++) {
      const off = p * 4;
      indices[p] = lut[packRgb555(rgba[off]!, rgba[off + 1]!, rgba[off + 2]!)]!;
    }

    // Graphic Control Extension
    const delayCs = Math.max(2, Math.round(frame.delayMs / 10));
    chunks.push(0x21, 0xf9, 0x04, 0x04);
    writeU16(delayCs);
    chunks.push(0x00, 0x00);

    // Image Descriptor
    chunks.push(0x2c);
    writeU16(0);
    writeU16(0);
    writeU16(width);
    writeU16(height);
    chunks.push(0x00);

    // LZW Minimum Code Size + Compressed Image Data
    chunks.push(0x08);
    const lzwData = lzwCompress(indices, 8);
    for (let i = 0; i < lzwData.length; i++) {
      chunks.push(lzwData[i]!);
    }
  }

  // Trailer
  chunks.push(0x3b);
  return new Uint8Array(chunks);
}
