import { describe, expect, it } from 'vitest';
import {
  applyEasing,
  compileDeck,
  resolveCanvasDimensions,
  resolveSegmentAtTime,
} from '../src/core/layout.js';
import { clonePresetDeck } from '../src/core/presets.js';

describe('timeline compiler and layout math', () => {
  it('compiles preset deck into hold and transition segments with accurate total duration', () => {
    const deck = clonePresetDeck('async-refactor');
    const timeline = compileDeck(deck);

    expect(timeline.slides).toHaveLength(3);
    expect(timeline.transitions).toHaveLength(2);
    // 3 holds + 2 transitions = 5 segments
    expect(timeline.segments).toHaveLength(5);

    const expectedTotal =
      deck.slides[0]!.durationMs +
      deck.slides[0]!.transitionMs +
      deck.slides[1]!.durationMs +
      deck.slides[1]!.transitionMs +
      deck.slides[2]!.durationMs;
    expect(timeline.totalDurationMs).toBe(expectedTotal);
  });

  it('resolves hold and transition segments cleanly across the timeline', () => {
    const deck = clonePresetDeck('rust-safety');
    const timeline = compileDeck(deck);

    const startSeg = resolveSegmentAtTime(timeline, 100);
    expect(startSeg.kind).toBe('hold');
    expect(startSeg.index).toBe(0);

    const midTransitionMs = deck.slides[0]!.durationMs + deck.slides[0]!.transitionMs / 2;
    const midSeg = resolveSegmentAtTime(timeline, midTransitionMs);
    expect(midSeg.kind).toBe('transition');
    expect(midSeg.index).toBe(0);
    expect(midSeg.progress).toBeCloseTo(0.5, 2);
  });

  it('respects easing boundary invariants and canvas aspect ratios', () => {
    for (const easing of ['linear', 'easeInOutCubic', 'easeOutQuart', 'spring'] as const) {
      expect(applyEasing(0, easing)).toBeCloseTo(0, 5);
      expect(applyEasing(1, easing)).toBeCloseTo(1, 5);
    }

    const deck = clonePresetDeck('async-refactor');
    deck.aspectRatio = '9:16';
    expect(resolveCanvasDimensions(compileDeck(deck))).toEqual({ width: 720, height: 1280 });

    deck.aspectRatio = '1:1';
    expect(resolveCanvasDimensions(compileDeck(deck))).toEqual({ width: 960, height: 960 });

    deck.aspectRatio = 'auto';
    const autoDims = resolveCanvasDimensions(compileDeck(deck));
    expect(autoDims.width).toBeGreaterThanOrEqual(760);
    expect(autoDims.height).toBeGreaterThanOrEqual(460);
  });
});
