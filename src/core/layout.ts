import { computeMagicMoveDiff } from './diff.js';
import { getBackgroundById, getThemeById } from './themes.js';
import { tokenizeCode } from './tokenizer.js';
import type {
  AspectRatio,
  CanvasContext2DLike,
  CompiledSlide,
  CompiledTimeline,
  CompiledTransition,
  DeckConfig,
  EasingName,
  MorphEndpoint,
} from './types.js';

export function applyEasing(t: number, easing: EasingName): number {
  const x = Math.max(0, Math.min(1, t));
  switch (easing) {
    case 'linear':
      return x;
    case 'easeOutQuart':
      return 1 - Math.pow(1 - x, 4);
    case 'spring': {
      if (x === 0 || x === 1) return x;
      const c4 = (2 * Math.PI) / 3.2;
      return Math.pow(2, -9 * x) * Math.sin((x * 10 - 0.75) * c4) + 1;
    }
    case 'easeInOutCubic':
    default:
      return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  }
}

export function compileDeck(deck: DeckConfig): CompiledTimeline {
  if (deck.slides.length === 0) {
    throw new Error('Deck must contain at least one slide');
  }

  const theme = getThemeById(deck.themeId);
  const background = getBackgroundById(deck.backgroundId);

  const tokenizedPerSlide = deck.slides.map((s) => tokenizeCode(s.code, s.language));

  const compiledSlides: CompiledSlide[] = deck.slides.map((slide, idx) => {
    const tokenizedLines = tokenizedPerSlide[idx]!;
    const highlightSet = new Set(slide.highlightLines ?? []);
    let maxCols = 1;
    const lines = tokenizedLines.map((line, lineIdx) => {
      const len = line.raw.length;
      if (len > maxCols) maxCols = len;
      return {
        lineNumber: line.lineNumber,
        highlighted: highlightSet.has(lineIdx + 1),
        tokens: line.tokens.map((tok) => ({
          text: tok.text,
          col: tok.col,
          kind: tok.kind,
          color: theme.tokens[tok.kind],
        })),
      };
    });

    return {
      id: slide.id,
      title: slide.title,
      badge: slide.badge,
      typingMode: Boolean(slide.typingMode),
      durationMs: Math.max(200, slide.durationMs),
      transitionMs: Math.max(150, slide.transitionMs),
      lineCount: Math.max(1, lines.length),
      maxCols,
      highlightLines: [...highlightSet],
      lines,
    };
  });

  const transitions: CompiledTransition[] = [];
  for (let i = 0; i < deck.slides.length - 1; i++) {
    const fromSlide = deck.slides[i]!;
    const toSlide = deck.slides[i + 1]!;
    const fromLines = tokenizedPerSlide[i]!;
    const toLines = tokenizedPerSlide[i + 1]!;
    const diff = computeMagicMoveDiff(
      fromLines,
      toLines,
      theme,
      new Set(fromSlide.highlightLines ?? []),
      new Set(toSlide.highlightLines ?? []),
    );

    transitions.push({
      fromSlideIndex: i,
      toSlideIndex: i + 1,
      durationMs: Math.max(150, fromSlide.transitionMs),
      fromLineCount: compiledSlides[i]!.lineCount,
      toLineCount: compiledSlides[i + 1]!.lineCount,
      fromMaxCols: compiledSlides[i]!.maxCols,
      toMaxCols: compiledSlides[i + 1]!.maxCols,
      tokens: diff.tokens,
      removedLines: diff.removedLines,
      addedLines: diff.addedLines,
    });
  }

  const segments: CompiledTimeline['segments'] = [];
  let cursor = 0;
  for (let i = 0; i < compiledSlides.length; i++) {
    const slide = compiledSlides[i]!;
    segments.push({
      kind: 'hold',
      index: i,
      startMs: cursor,
      endMs: cursor + slide.durationMs,
    });
    cursor += slide.durationMs;

    const tr = transitions[i];
    if (tr) {
      segments.push({
        kind: 'transition',
        index: i,
        startMs: cursor,
        endMs: cursor + tr.durationMs,
      });
      cursor += tr.durationMs;
    }
  }

  return {
    title: deck.title,
    theme,
    background,
    fontFamily: deck.fontFamily,
    fontSize: deck.fontSize,
    lineHeight: deck.lineHeight,
    padding: deck.padding,
    windowStyle: deck.windowStyle,
    showLineNumbers: deck.showLineNumbers,
    showDiffGlow: deck.showDiffGlow,
    showBadge: deck.showBadge,
    aspectRatio: deck.aspectRatio,
    easing: deck.easing,
    watermark: deck.watermark,
    totalDurationMs: cursor,
    slides: compiledSlides,
    transitions,
    segments,
  };
}

export interface FrameSegmentLookup {
  kind: 'hold' | 'transition';
  index: number;
  localMs: number;
  progress: number;
  easedProgress: number;
}

export function resolveSegmentAtTime(
  timeline: CompiledTimeline,
  timeMs: number,
): FrameSegmentLookup {
  const clamped = Math.max(0, Math.min(timeline.totalDurationMs, timeMs));
  for (let i = 0; i < timeline.segments.length; i++) {
    const seg = timeline.segments[i]!;
    if (clamped <= seg.endMs || i === timeline.segments.length - 1) {
      const span = Math.max(1, seg.endMs - seg.startMs);
      const localMs = Math.max(0, clamped - seg.startMs);
      const progress = Math.max(0, Math.min(1, localMs / span));
      return {
        kind: seg.kind,
        index: seg.index,
        localMs,
        progress,
        easedProgress:
          seg.kind === 'transition' ? applyEasing(progress, timeline.easing) : progress,
      };
    }
  }
  return { kind: 'hold', index: 0, localMs: 0, progress: 0, easedProgress: 0 };
}

export function resolveCanvasDimensions(
  timeline: CompiledTimeline,
  charWidthEstimate?: number,
): { width: number; height: number } {
  const ratio: AspectRatio = timeline.aspectRatio;
  if (ratio === '16:9') return { width: 1280, height: 720 };
  if (ratio === '1:1') return { width: 960, height: 960 };
  if (ratio === '9:16') return { width: 720, height: 1280 };
  if (ratio === '4:3') return { width: 1080, height: 810 };

  // 'auto' fits largest slide cleanly
  const charW = charWidthEstimate ?? timeline.fontSize * 0.602;
  const maxLines = Math.max(...timeline.slides.map((s) => s.lineCount), 6);
  const maxCols = Math.max(...timeline.slides.map((s) => s.maxCols), 36);
  const gutter = timeline.showLineNumbers ? charW * 4.5 : 0;
  const titleH = timeline.windowStyle === 'none' ? 0 : 48;
  const innerW = Math.ceil(maxCols * charW + gutter + 56);
  const innerH = Math.ceil(maxLines * timeline.fontSize * timeline.lineHeight + titleH + 44);
  return {
    width: Math.max(760, Math.min(1600, innerW + timeline.padding * 2)),
    height: Math.max(460, Math.min(1200, innerH + timeline.padding * 2)),
  };
}

function parseHexColor(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  if (clean.length === 3) {
    return [
      parseInt(clean[0]! + clean[0]!, 16),
      parseInt(clean[1]! + clean[1]!, 16),
      parseInt(clean[2]! + clean[2]!, 16),
    ];
  }
  if (clean.length >= 6) {
    return [
      parseInt(clean.slice(0, 2), 16),
      parseInt(clean.slice(2, 4), 16),
      parseInt(clean.slice(4, 6), 16),
    ];
  }
  return [200, 210, 230];
}

function lerpColor(hexA: string, hexB: string, t: number): string {
  if (hexA === hexB) return hexA;
  const [r1, g1, b1] = parseHexColor(hexA);
  const [r2, g2, b2] = parseHexColor(hexB);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

function drawRoundedRect(
  ctx: CanvasContext2DLike,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawToken(
  ctx: CanvasContext2DLike,
  text: string,
  x: number,
  y: number,
  color: string,
  alpha: number,
): void {
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawEndpointGlow(
  ctx: CanvasContext2DLike,
  ep: MorphEndpoint,
  x: number,
  y: number,
  charW: number,
  linePx: number,
  fillStyle: string,
  alpha: number,
): void {
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = fillStyle;
  drawRoundedRect(ctx, x - 3, y - linePx * 0.72, ep.text.length * charW + 6, linePx * 0.92, 4);
  ctx.fill();
  ctx.restore();
}

/**
 * Renders a single frame of a CompiledTimeline onto any HTML5 CanvasRenderingContext2D.
 */
export function renderCompiledFrame(
  ctx: CanvasContext2DLike,
  timeline: CompiledTimeline,
  timeMs: number,
  canvasWidth: number,
  canvasHeight: number,
): void {
  const lookup = resolveSegmentAtTime(timeline, timeMs);
  const { theme, background } = timeline;

  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  // 1. Studio backdrop
  if (!background.transparent) {
    const rad = ((background.angle - 90) * Math.PI) / 180;
    const cx = canvasWidth / 2;
    const cy = canvasHeight / 2;
    const halfLen = Math.hypot(canvasWidth, canvasHeight) / 2;
    const grad = ctx.createLinearGradient(
      cx - Math.cos(rad) * halfLen,
      cy - Math.sin(rad) * halfLen,
      cx + Math.cos(rad) * halfLen,
      cy + Math.sin(rad) * halfLen,
    );
    for (const stop of background.stops) {
      grad.addColorStop(stop.offset, stop.color);
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Subtle radial spotlight behind window
    const glow = ctx.createRadialGradient(cx, cy, 40, cx, cy, Math.max(canvasWidth, canvasHeight) * 0.65);
    glow.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
    glow.addColorStop(1, 'rgba(0, 0, 0, 0.22)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  }

  // 2. Compute typography metrics and interpolated window size
  const codeFont = `500 ${timeline.fontSize}px ${timeline.fontFamily}`;
  ctx.font = codeFont;
  ctx.textBaseline = 'alphabetic';
  const charW = ctx.measureText('M').width || timeline.fontSize * 0.6;
  const linePx = timeline.fontSize * timeline.lineHeight;
  const titleBarH = timeline.windowStyle === 'none' ? 0 : 46;
  const codePadX = 28;
  const codePadY = 22;
  const gutterW = timeline.showLineNumbers ? Math.ceil(charW * 3.8) : 0;

  let activeLines = 1;
  let activeCols = 20;
  let activeTitle = '';
  let nextTitle = '';
  let titleMix = 0;
  let activeBadge = '';

  if (lookup.kind === 'hold') {
    const slide = timeline.slides[lookup.index]!;
    activeLines = slide.lineCount;
    activeCols = slide.maxCols;
    activeTitle = slide.title;
    activeBadge = slide.badge ?? '';
  } else {
    const tr = timeline.transitions[lookup.index]!;
    const fromSlide = timeline.slides[tr.fromSlideIndex]!;
    const toSlide = timeline.slides[tr.toSlideIndex]!;
    const e = lookup.easedProgress;
    activeLines = tr.fromLineCount + (tr.toLineCount - tr.fromLineCount) * e;
    activeCols = tr.fromMaxCols + (tr.toMaxCols - tr.fromMaxCols) * e;
    activeTitle = fromSlide.title;
    nextTitle = toSlide.title;
    titleMix = e;
    activeBadge = e < 0.5 ? (fromSlide.badge ?? '') : (toSlide.badge ?? '');
  }

  const maxWinW = canvasWidth - timeline.padding * 2;
  const maxWinH = canvasHeight - timeline.padding * 2;
  const desiredWinW = Math.max(420, codePadX * 2 + gutterW + activeCols * charW + 18);
  const desiredWinH = Math.max(180, titleBarH + codePadY * 2 + activeLines * linePx);

  const winW = Math.min(maxWinW, desiredWinW);
  const winH = Math.min(maxWinH, desiredWinH);
  const winX = Math.round((canvasWidth - winW) / 2);
  const winY = Math.round((canvasHeight - winH) / 2);

  // 3. Window shadow & frame
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = 42;
  ctx.shadowOffsetY = 20;
  drawRoundedRect(ctx, winX, winY, winW, winH, 16);
  ctx.fillStyle = theme.windowBg;
  ctx.fill();
  ctx.restore();

  ctx.save();
  drawRoundedRect(ctx, winX, winY, winW, winH, 16);
  ctx.strokeStyle = theme.windowBorder;
  ctx.lineWidth = 1.25;
  ctx.stroke();
  ctx.restore();

  // 4. Title bar
  if (timeline.windowStyle !== 'none') {
    ctx.save();
    drawRoundedRect(ctx, winX, winY, winW, winH, 16);
    ctx.clip();
    ctx.fillStyle = theme.titleBarBg;
    ctx.fillRect(winX, winY, winW, titleBarH);
    ctx.fillStyle = theme.windowBorder;
    ctx.fillRect(winX, winY + titleBarH - 1, winW, 1);

    if (timeline.windowStyle === 'macos') {
      const dots = ['#ff5f56', '#ffbd2e', '#27c93f'];
      for (let d = 0; d < dots.length; d++) {
        ctx.beginPath();
        ctx.arc(winX + 22 + d * 20, winY + titleBarH / 2, 6, 0, Math.PI * 2);
        ctx.fillStyle = dots[d]!;
        ctx.fill();
      }
    } else if (timeline.windowStyle === 'terminal') {
      ctx.font = `700 13px ${timeline.fontFamily}`;
      ctx.fillStyle = theme.tokens.prompt;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('>_', winX + 18, winY + titleBarH / 2);
    }

    // Window title (cross-fades when changed)
    ctx.font = `500 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (lookup.kind === 'transition' && activeTitle !== nextTitle) {
      ctx.save();
      ctx.globalAlpha = 1 - titleMix;
      ctx.fillStyle = theme.titleText;
      ctx.fillText(activeTitle, winX + winW / 2, winY + titleBarH / 2);
      ctx.globalAlpha = titleMix;
      ctx.fillText(nextTitle, winX + winW / 2, winY + titleBarH / 2);
      ctx.restore();
    } else {
      ctx.fillStyle = theme.titleText;
      ctx.fillText(activeTitle, winX + winW / 2, winY + titleBarH / 2);
    }

    // Slide badge pill (optional)
    if (timeline.showBadge && activeBadge) {
      ctx.font = `600 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif`;
      const bw = ctx.measureText(activeBadge).width + 18;
      const bx = winX + winW - bw - 14;
      const by = winY + (titleBarH - 22) / 2;
      drawRoundedRect(ctx, bx, by, bw, 22, 11);
      ctx.fillStyle = theme.badgeBg;
      ctx.fill();
      ctx.fillStyle = theme.badgeText;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(activeBadge, bx + bw / 2, winY + titleBarH / 2);
    }
    ctx.restore();
  }

  // 5. Code viewport clipped cleanly to window interior
  const codeOriginX = winX + codePadX + gutterW;
  const codeOriginY = winY + titleBarH + codePadY + timeline.fontSize * 0.92;

  ctx.save();
  drawRoundedRect(ctx, winX, winY + titleBarH, winW, Math.max(0, winH - titleBarH), 16);
  ctx.clip();

  ctx.font = codeFont;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  if (lookup.kind === 'hold') {
    const slide = timeline.slides[lookup.index]!;
    const hasHighlights = slide.highlightLines.length > 0;

    // Calculate typing character budget if typingMode is active
    let charBudget = Infinity;
    let cursorPos: { x: number; y: number } | null = null;
    if (slide.typingMode) {
      const totalChars = slide.lines.reduce(
        (acc, l) => acc + l.tokens.reduce((tAcc, t) => tAcc + t.text.length, 0),
        0,
      );
      const typingProgress = Math.min(1, lookup.progress / 0.72);
      charBudget = Math.floor(totalChars * typingProgress);
    }

    let consumed = 0;

    for (let li = 0; li < slide.lines.length; li++) {
      const line = slide.lines[li]!;
      const y = codeOriginY + li * linePx;

      if (line.highlighted) {
        ctx.fillStyle = theme.highlightLineBg;
        ctx.fillRect(winX, y - linePx * 0.73, winW, linePx);
      }

      const lineAlpha = hasHighlights && !line.highlighted ? 0.38 : 1;

      if (timeline.showLineNumbers) {
        ctx.save();
        ctx.globalAlpha = lineAlpha;
        ctx.fillStyle = theme.lineNumber;
        ctx.textAlign = 'right';
        ctx.fillText(String(line.lineNumber), winX + codePadX + gutterW - 14, y);
        ctx.restore();
      }

      for (const tok of line.tokens) {
        const x = codeOriginX + tok.col * charW;
        if (!slide.typingMode) {
          drawToken(ctx, tok.text, x, y, tok.color, lineAlpha);
          continue;
        }

        if (consumed >= charBudget) break;
        const remaining = charBudget - consumed;
        if (remaining >= tok.text.length) {
          drawToken(ctx, tok.text, x, y, tok.color, lineAlpha);
          consumed += tok.text.length;
          cursorPos = { x: x + tok.text.length * charW, y };
        } else {
          const partial = tok.text.slice(0, remaining);
          drawToken(ctx, partial, x, y, tok.color, lineAlpha);
          consumed += remaining;
          cursorPos = { x: x + partial.length * charW, y };
        }
      }
    }

    if (slide.typingMode && cursorPos && Math.floor(timeMs / 450) % 2 === 0) {
      ctx.fillStyle = theme.tokens.prompt;
      ctx.fillRect(cursorPos.x + 2, cursorPos.y - timeline.fontSize * 0.85, 2.5, timeline.fontSize * 1.05);
    }
  } else {
    const tr = timeline.transitions[lookup.index]!;
    const e = lookup.easedProgress;

    // Diff line backgrounds during morph
    if (timeline.showDiffGlow) {
      const outAlpha = Math.max(0, 1 - e * 1.35);
      for (const lineIdx of tr.removedLines) {
        const y = codeOriginY + lineIdx * linePx;
        ctx.save();
        ctx.globalAlpha = outAlpha;
        ctx.fillStyle = theme.removedBg;
        ctx.fillRect(winX, y - linePx * 0.73, winW, linePx);
        ctx.restore();
      }
      const inAlpha = Math.max(0, (e - 0.15) / 0.85);
      for (const lineIdx of tr.addedLines) {
        const y = codeOriginY + lineIdx * linePx;
        ctx.save();
        ctx.globalAlpha = inAlpha;
        ctx.fillStyle = theme.addedBg;
        ctx.fillRect(winX, y - linePx * 0.73, winW, linePx);
        ctx.restore();
      }
    }

    // Line numbers crossfade smoothly
    if (timeline.showLineNumbers) {
      const maxShown = Math.ceil(Math.max(tr.fromLineCount, tr.toLineCount));
      for (let li = 0; li < maxShown; li++) {
        let numAlpha = 1;
        if (li >= tr.fromLineCount) numAlpha = e;
        else if (li >= tr.toLineCount) numAlpha = 1 - e;
        if (numAlpha <= 0.02) continue;

        ctx.save();
        ctx.globalAlpha = numAlpha;
        ctx.fillStyle = theme.lineNumber;
        ctx.textAlign = 'right';
        ctx.fillText(String(li + 1), winX + codePadX + gutterW - 14, codeOriginY + li * linePx);
        ctx.restore();
      }
    }

    // Render exiting, entering, and gliding matched tokens
    for (const mt of tr.tokens) {
      if (mt.state === 'exit' && mt.from) {
        const exitT = Math.min(1, e * 1.5);
        const alpha = (1 - exitT) * (mt.from.highlighted || timeline.slides[tr.fromSlideIndex]!.highlightLines.length === 0 ? 1 : 0.45);
        const x = codeOriginX + mt.from.col * charW;
        const y = codeOriginY + mt.from.lineIndex * linePx - exitT * 6;
        if (timeline.showDiffGlow) {
          drawEndpointGlow(ctx, mt.from, x, y, charW, linePx, theme.removedBg, (1 - exitT) * 0.9);
        }
        drawToken(ctx, mt.from.text, x, y, mt.from.color, alpha);
      } else if (mt.state === 'enter' && mt.to) {
        const enterT = Math.max(0, Math.min(1, (e - 0.22) / 0.78));
        const alpha = enterT * (mt.to.highlighted || timeline.slides[tr.toSlideIndex]!.highlightLines.length === 0 ? 1 : 0.45);
        const x = codeOriginX + mt.to.col * charW;
        const y = codeOriginY + mt.to.lineIndex * linePx + (1 - enterT) * 6;
        if (timeline.showDiffGlow) {
          drawEndpointGlow(ctx, mt.to, x, y, charW, linePx, theme.addedBg, enterT * 0.9);
        }
        drawToken(ctx, mt.to.text, x, y, mt.to.color, alpha);
      } else if (mt.state === 'matched' && mt.from && mt.to) {
        const x = codeOriginX + (mt.from.col + (mt.to.col - mt.from.col) * e) * charW;
        const y = codeOriginY + (mt.from.lineIndex + (mt.to.lineIndex - mt.from.lineIndex) * e) * linePx;
        const fromHasHL = timeline.slides[tr.fromSlideIndex]!.highlightLines.length > 0;
        const toHasHL = timeline.slides[tr.toSlideIndex]!.highlightLines.length > 0;
        const fromAlpha = !fromHasHL || mt.from.highlighted ? 1 : 0.38;
        const toAlpha = !toHasHL || mt.to.highlighted ? 1 : 0.38;
        const alpha = fromAlpha + (toAlpha - fromAlpha) * e;
        const color = lerpColor(mt.from.color, mt.to.color, e);
        drawToken(ctx, mt.to.text, x, y, color, alpha);
      }
    }
  }

  ctx.restore();

  // 6. Optional subtle watermark
  if (timeline.watermark && timeline.watermark.trim().length > 0) {
    ctx.save();
    ctx.font = `600 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif`;
    ctx.fillStyle = background.id === 'arctic' ? 'rgba(15, 23, 42, 0.45)' : 'rgba(255, 255, 255, 0.45)';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(timeline.watermark.trim(), canvasWidth - 20, canvasHeight - 16);
    ctx.restore();
  }
}
