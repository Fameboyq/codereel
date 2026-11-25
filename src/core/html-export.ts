import { compileDeck, resolveCanvasDimensions } from './layout.js';
import type { CompiledTimeline, DeckConfig } from './types.js';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function serializeTimelineForScript(timeline: CompiledTimeline): string {
  return JSON.stringify(timeline).replace(/<\/script/gi, '<\\/script');
}

/**
 * Builds a single zero-dependency, self-contained HTML5 Canvas player
 * from any DeckConfig (embeds pre-tokenized slides and Magic-Move tracks).
 */
export function buildStandaloneHtml(deck: DeckConfig): string {
  const timeline = compileDeck(deck);
  const dims = resolveCanvasDimensions(timeline);
  const jsonPayload = serializeTimelineForScript(timeline);
  const safeTitle = escapeHtml(deck.title || 'CodeReel Animation');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeTitle} — CodeReel</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      min-height: 100vh;
      background: #090b10;
      color: #e2e8f0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 20px;
      gap: 14px;
    }
    .stage-wrap {
      width: min(100%, 1080px);
      border-radius: 14px;
      overflow: hidden;
      border: 1px solid rgba(255,255,255,0.1);
      box-shadow: 0 24px 60px rgba(0,0,0,0.55);
      background: #0d1117;
    }
    canvas {
      width: 100%;
      height: auto;
      display: block;
    }
    .controls {
      width: min(100%, 1080px);
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 14px;
      border-radius: 12px;
      background: #121621;
      border: 1px solid rgba(255,255,255,0.08);
      flex-wrap: wrap;
    }
    button {
      background: #232a3b;
      color: #f8fafc;
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 8px;
      padding: 6px 12px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }
    button:hover { background: #313b52; }
    button.primary { background: #6366f1; border-color: #818cf8; }
    button.primary:hover { background: #4f46e5; }
    input[type="range"] { flex: 1; min-width: 160px; accent-color: #818cf8; cursor: pointer; }
    .time { font-variant-numeric: tabular-nums; font-size: 12px; color: #94a3b8; min-width: 90px; text-align: right; }
  </style>
</head>
<body>
  <div class="stage-wrap">
    <canvas id="reelCanvas" width="${dims.width}" height="${dims.height}"></canvas>
  </div>
  <div class="controls">
    <button id="playBtn" class="primary">Pause</button>
    <button id="prevBtn" title="Previous slide">Prev</button>
    <button id="nextBtn" title="Next slide">Next</button>
    <input id="scrubber" type="range" min="0" max="${timeline.totalDurationMs}" value="0" step="10" />
    <span id="timeLabel" class="time">0.0s / ${(timeline.totalDurationMs / 1000).toFixed(1)}s</span>
    <button id="speedBtn">1x</button>
  </div>

  <script>
    const TIMELINE = ${jsonPayload};
    const canvas = document.getElementById('reelCanvas');
    const ctx = canvas.getContext('2d');
    const playBtn = document.getElementById('playBtn');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const scrubber = document.getElementById('scrubber');
    const timeLabel = document.getElementById('timeLabel');
    const speedBtn = document.getElementById('speedBtn');

    const speeds = [0.5, 1, 1.5, 2];
    let speedIdx = 1;
    let playing = true;
    let playheadMs = 0;
    let lastTs = performance.now();

    function applyEasing(t, easing) {
      const x = Math.max(0, Math.min(1, t));
      if (easing === 'linear') return x;
      if (easing === 'easeOutQuart') return 1 - Math.pow(1 - x, 4);
      if (easing === 'spring') {
        if (x === 0 || x === 1) return x;
        const c4 = (2 * Math.PI) / 3.2;
        return Math.pow(2, -9 * x) * Math.sin((x * 10 - 0.75) * c4) + 1;
      }
      return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
    }

    function parseHex(hex) {
      const c = hex.replace('#', '');
      return [parseInt(c.slice(0,2),16)||200, parseInt(c.slice(2,4),16)||210, parseInt(c.slice(4,6),16)||230];
    }

    function lerpColor(a, b, t) {
      if (a === b) return a;
      const [r1,g1,b1] = parseHex(a), [r2,g2,b2] = parseHex(b);
      return 'rgb(' + Math.round(r1+(r2-r1)*t) + ',' + Math.round(g1+(g2-g1)*t) + ',' + Math.round(b1+(b2-b1)*t) + ')';
    }

    function roundRect(x, y, w, h, r) {
      const rad = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + rad, y);
      ctx.lineTo(x + w - rad, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
      ctx.lineTo(x + w, y + h - rad);
      ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
      ctx.lineTo(x + rad, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
      ctx.lineTo(x, y + rad);
      ctx.quadraticCurveTo(x, y, x + rad, y);
      ctx.closePath();
    }

    function resolveSegment(ms) {
      const cl = Math.max(0, Math.min(TIMELINE.totalDurationMs, ms));
      for (let i = 0; i < TIMELINE.segments.length; i++) {
        const s = TIMELINE.segments[i];
        if (cl <= s.endMs || i === TIMELINE.segments.length - 1) {
          const span = Math.max(1, s.endMs - s.startMs);
          const p = Math.max(0, Math.min(1, (cl - s.startMs) / span));
          return { kind: s.kind, index: s.index, progress: p, eased: s.kind === 'transition' ? applyEasing(p, TIMELINE.easing) : p };
        }
      }
      return { kind: 'hold', index: 0, progress: 0, eased: 0 };
    }

    function drawToken(text, x, y, color, alpha) {
      if (alpha <= 0.01) return;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      ctx.fillStyle = color;
      ctx.fillText(text, x, y);
      ctx.restore();
    }

    function render(ms) {
      const w = canvas.width, h = canvas.height;
      const seg = resolveSegment(ms);
      const theme = TIMELINE.theme, bg = TIMELINE.background;
      ctx.clearRect(0, 0, w, h);

      if (!bg.transparent) {
        const rad = ((bg.angle - 90) * Math.PI) / 180;
        const cx = w / 2, cy = h / 2, hl = Math.hypot(w, h) / 2;
        const g = ctx.createLinearGradient(cx - Math.cos(rad)*hl, cy - Math.sin(rad)*hl, cx + Math.cos(rad)*hl, cy + Math.sin(rad)*hl);
        bg.stops.forEach(s => g.addColorStop(s.offset, s.color));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }

      ctx.font = '500 ' + TIMELINE.fontSize + 'px ' + TIMELINE.fontFamily;
      ctx.textBaseline = 'alphabetic';
      const charW = ctx.measureText('M').width || TIMELINE.fontSize * 0.6;
      const linePx = TIMELINE.fontSize * TIMELINE.lineHeight;
      const titleH = TIMELINE.windowStyle === 'none' ? 0 : 46;
      const padX = 28, padY = 22;
      const gutterW = TIMELINE.showLineNumbers ? Math.ceil(charW * 3.8) : 0;

      let linesCount = 1, colsCount = 20, titleA = '', titleB = '', mix = 0, badge = '';
      if (seg.kind === 'hold') {
        const sl = TIMELINE.slides[seg.index];
        linesCount = sl.lineCount; colsCount = sl.maxCols; titleA = sl.title; badge = sl.badge || '';
      } else {
        const tr = TIMELINE.transitions[seg.index];
        const sA = TIMELINE.slides[tr.fromSlideIndex], sB = TIMELINE.slides[tr.toSlideIndex];
        linesCount = tr.fromLineCount + (tr.toLineCount - tr.fromLineCount) * seg.eased;
        colsCount = tr.fromMaxCols + (tr.toMaxCols - tr.fromMaxCols) * seg.eased;
        titleA = sA.title; titleB = sB.title; mix = seg.eased;
        badge = seg.eased < 0.5 ? (sA.badge || '') : (sB.badge || '');
      }

      const maxWinW = w - TIMELINE.padding * 2;
      const maxWinH = h - TIMELINE.padding * 2;
      const minWinW = Math.min(maxWinW, Math.max(540, Math.round(w * 0.56)));
      const minWinH = Math.min(maxWinH, Math.max(220, Math.round(h * 0.36)));
      const winW = Math.min(maxWinW, Math.max(minWinW, padX * 2 + gutterW + colsCount * charW + 24));
      const winH = Math.min(maxWinH, Math.max(minWinH, titleH + padY * 2 + linesCount * linePx + 8));
      const winX = Math.round((w - winW) / 2), winY = Math.round((h - winH) / 2);

      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 42; ctx.shadowOffsetY = 20;
      roundRect(winX, winY, winW, winH, 16);
      ctx.fillStyle = theme.windowBg; ctx.fill();
      ctx.restore();
      ctx.save();
      roundRect(winX, winY, winW, winH, 16);
      ctx.strokeStyle = theme.windowBorder; ctx.lineWidth = 1.25; ctx.stroke();
      ctx.restore();

      if (TIMELINE.windowStyle !== 'none') {
        ctx.save();
        roundRect(winX, winY, winW, winH, 16); ctx.clip();
        ctx.fillStyle = theme.titleBarBg; ctx.fillRect(winX, winY, winW, titleH);
        if (TIMELINE.windowStyle === 'macos') {
          ['#ff5f56','#ffbd2e','#27c93f'].forEach((c, i) => {
            ctx.beginPath(); ctx.arc(winX + 22 + i*20, winY + titleH/2, 6, 0, Math.PI*2); ctx.fillStyle = c; ctx.fill();
          });
        } else if (TIMELINE.windowStyle === 'terminal') {
          ctx.font = '700 13px ' + TIMELINE.fontFamily;
          ctx.fillStyle = theme.tokens.prompt;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText('>_', winX + 18, winY + titleH / 2);
        }
        ctx.font = '500 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = theme.titleText;
        if (seg.kind === 'transition' && titleA !== titleB) {
          ctx.globalAlpha = 1 - mix; ctx.fillText(titleA, winX + winW/2, winY + titleH/2);
          ctx.globalAlpha = mix; ctx.fillText(titleB, winX + winW/2, winY + titleH/2);
        } else {
          ctx.fillText(titleA, winX + winW/2, winY + titleH/2);
        }
        if (TIMELINE.showBadge && badge) {
          ctx.globalAlpha = 1;
          ctx.font = '600 11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
          const bw = ctx.measureText(badge).width + 18, bx = winX + winW - bw - 14, by = winY + (titleH - 22)/2;
          roundRect(bx, by, bw, 22, 11); ctx.fillStyle = theme.badgeBg; ctx.fill();
          ctx.fillStyle = theme.badgeText; ctx.fillText(badge, bx + bw/2, winY + titleH/2);
        }
        ctx.restore();
      }

      const ox = winX + padX + gutterW, oy = winY + titleH + padY + TIMELINE.fontSize * 0.92;
      ctx.save();
      roundRect(winX, winY + titleH, winW, Math.max(0, winH - titleH), 16); ctx.clip();
      ctx.font = '500 ' + TIMELINE.fontSize + 'px ' + TIMELINE.fontFamily;
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';

      if (seg.kind === 'hold') {
        const sl = TIMELINE.slides[seg.index];
        const hasHL = sl.highlightLines.length > 0;
        let budget = Infinity, consumed = 0, cursor = null;
        if (sl.typingMode) {
          const total = sl.lines.reduce((a, l) => a + l.tokens.reduce((b, t) => b + t.text.length, 0), 0);
          budget = Math.floor(total * Math.min(1, seg.progress / 0.72));
        }
        sl.lines.forEach((l, li) => {
          const y = oy + li * linePx;
          if (l.highlighted) { ctx.fillStyle = theme.highlightLineBg; ctx.fillRect(winX, y - linePx*0.73, winW, linePx); }
          const la = hasHL && !l.highlighted ? 0.38 : 1;
          if (TIMELINE.showLineNumbers) {
            ctx.save(); ctx.globalAlpha = la; ctx.fillStyle = theme.lineNumber; ctx.textAlign = 'right';
            ctx.fillText(String(l.lineNumber), winX + padX + gutterW - 14, y); ctx.restore();
          }
          for (const tok of l.tokens) {
            const x = ox + tok.col * charW;
            if (!sl.typingMode) { drawToken(tok.text, x, y, tok.color, la); continue; }
            if (consumed >= budget) break;
            const rem = budget - consumed;
            if (rem >= tok.text.length) { drawToken(tok.text, x, y, tok.color, la); consumed += tok.text.length; cursor = { x: x + tok.text.length * charW, y }; }
            else { const part = tok.text.slice(0, rem); drawToken(part, x, y, tok.color, la); consumed += rem; cursor = { x: x + part.length * charW, y }; }
          }
        });
        if (sl.typingMode && cursor && Math.floor(ms / 450) % 2 === 0) {
          ctx.fillStyle = theme.tokens.prompt; ctx.fillRect(cursor.x + 2, cursor.y - TIMELINE.fontSize * 0.85, 2.5, TIMELINE.fontSize * 1.05);
        }
      } else {
        const tr = TIMELINE.transitions[seg.index], e = seg.eased;
        if (TIMELINE.showDiffGlow) {
          tr.removedLines.forEach(li => { ctx.save(); ctx.globalAlpha = Math.max(0, 1 - e*1.35); ctx.fillStyle = theme.removedBg; ctx.fillRect(winX, oy + li*linePx - linePx*0.73, winW, linePx); ctx.restore(); });
          tr.addedLines.forEach(li => { ctx.save(); ctx.globalAlpha = Math.max(0, (e - 0.15)/0.85); ctx.fillStyle = theme.addedBg; ctx.fillRect(winX, oy + li*linePx - linePx*0.73, winW, linePx); ctx.restore(); });
        }
        tr.tokens.forEach(mt => {
          if (mt.state === 'exit' && mt.from) {
            const et = Math.min(1, e * 1.5);
            drawToken(mt.from.text, ox + mt.from.col*charW, oy + mt.from.lineIndex*linePx - et*6, mt.from.color, 1 - et);
          } else if (mt.state === 'enter' && mt.to) {
            const nt = Math.max(0, Math.min(1, (e - 0.22) / 0.78));
            drawToken(mt.to.text, ox + mt.to.col*charW, oy + mt.to.lineIndex*linePx + (1 - nt)*6, mt.to.color, nt);
          } else if (mt.state === 'matched' && mt.from && mt.to) {
            const x = ox + (mt.from.col + (mt.to.col - mt.from.col)*e)*charW;
            const y = oy + (mt.from.lineIndex + (mt.to.lineIndex - mt.from.lineIndex)*e)*linePx;
            drawToken(mt.to.text, x, y, lerpColor(mt.from.color, mt.to.color, e), 1);
          }
        });
      }
      ctx.restore();

      if (TIMELINE.watermark && TIMELINE.watermark.trim().length > 0) {
        ctx.save();
        ctx.font = '600 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        ctx.fillStyle = bg.id === 'arctic' ? 'rgba(15, 23, 42, 0.45)' : 'rgba(255, 255, 255, 0.45)';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText(TIMELINE.watermark.trim(), w - 20, h - 16);
        ctx.restore();
      }
    }

    function jumpSlide(delta) {
      const holds = TIMELINE.segments.filter(s => s.kind === 'hold');
      let cur = 0;
      for (let i = 0; i < holds.length; i++) {
        if (playheadMs >= holds[i].startMs - 5) cur = i;
      }
      const next = (cur + delta + holds.length) % holds.length;
      playheadMs = holds[next].startMs;
      scrubber.value = String(Math.round(playheadMs));
      render(playheadMs);
    }

    playBtn.onclick = () => { playing = !playing; playBtn.textContent = playing ? 'Pause' : 'Play'; };
    prevBtn.onclick = () => jumpSlide(-1);
    nextBtn.onclick = () => jumpSlide(1);
    speedBtn.onclick = () => { speedIdx = (speedIdx + 1) % speeds.length; speedBtn.textContent = speeds[speedIdx] + 'x'; };
    scrubber.oninput = () => { playing = false; playBtn.textContent = 'Play'; playheadMs = Number(scrubber.value); render(playheadMs); };

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') { e.preventDefault(); playBtn.click(); }
      if (e.code === 'ArrowLeft') jumpSlide(-1);
      if (e.code === 'ArrowRight') jumpSlide(1);
    });

    function tick(now) {
      const dt = Math.min(80, now - lastTs);
      lastTs = now;
      if (playing && TIMELINE.totalDurationMs > 0) {
        playheadMs = (playheadMs + dt * speeds[speedIdx]) % TIMELINE.totalDurationMs;
        scrubber.value = String(Math.round(playheadMs));
      }
      timeLabel.textContent = (playheadMs / 1000).toFixed(1) + 's / ' + (TIMELINE.totalDurationMs / 1000).toFixed(1) + 's';
      render(playheadMs);
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  </script>
</body>
</html>
`;
}
