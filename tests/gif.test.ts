import { describe, expect, it } from 'vitest';
import { encodeGif } from '../src/core/gif.js';

function createSolidFrame(
  width: number,
  height: number,
  bg: [number, number, number],
  box: [number, number, number],
  boxOffset: number,
): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const inBox = x >= boxOffset && x < boxOffset + 8 && y >= 4 && y < 12;
      const [r, g, b] = inBox ? box : bg;
      rgba[idx] = r;
      rgba[idx + 1] = g;
      rgba[idx + 2] = b;
      rgba[idx + 3] = 255;
    }
  }
  return rgba;
}

describe('GIF89a encoder', () => {
  it('encodes multi-frame RGBA buffers into a valid looping GIF89a binary', () => {
    const w = 32;
    const h = 24;
    const frames = [
      { rgba: createSolidFrame(w, h, [18, 22, 34], [122, 162, 247], 4), delayMs: 60 },
      { rgba: createSolidFrame(w, h, [18, 22, 34], [158, 206, 106], 10), delayMs: 60 },
      { rgba: createSolidFrame(w, h, [18, 22, 34], [247, 118, 142], 16), delayMs: 100 },
    ];

    const gif = encodeGif(w, h, frames);
    const header = String.fromCharCode(...gif.slice(0, 6));
    expect(header).toBe('GIF89a');

    // Trailer byte must be 0x3B
    expect(gif[gif.length - 1]).toBe(0x3b);

    // Logical Screen Descriptor matches width & height (little-endian)
    expect(gif[6]! | (gif[7]! << 8)).toBe(w);
    expect(gif[8]! | (gif[9]! << 8)).toBe(h);

    // Netscape looping block present
    const ascii = Buffer.from(gif).toString('latin1');
    expect(ascii).toContain('NETSCAPE2.0');

    // Count Graphic Control Extensions (0x21 0xF9 0x04)
    let gceCount = 0;
    for (let i = 0; i < gif.length - 2; i++) {
      if (gif[i] === 0x21 && gif[i + 1] === 0xf9 && gif[i + 2] === 0x04) {
        gceCount++;
      }
    }
    expect(gceCount).toBe(frames.length);
  });

  it('rejects empty frame arrays and mismatched RGBA buffer lengths', () => {
    expect(() => encodeGif(16, 16, [])).toThrow(/At least one frame/);
    expect(() =>
      encodeGif(16, 16, [{ rgba: new Uint8ClampedArray(10), delayMs: 50 }]),
    ).toThrow(/Expected RGBA buffer/);
  });
});
