import { encodeGif, type GifFrameInput } from '../core/gif.js';
import { buildStandaloneHtml } from '../core/html-export.js';
import { compileDeck, renderCompiledFrame, resolveCanvasDimensions } from '../core/layout.js';
import { clonePresetDeck } from '../core/presets.js';
import { BACKGROUNDS, THEMES } from '../core/themes.js';
import type {
  AspectRatio,
  CompiledTimeline,
  DeckConfig,
  EasingName,
  Slide,
  SupportedLanguage,
  WindowStyle,
} from '../core/types.js';
import {
  decodeDeckFromUrlHash,
  encodeDeckToUrlHash,
  fetchGithubCommitSlides,
  parseImportedTextToSlides,
} from './url-state.js';

const STORAGE_KEY = 'codereel.studio.deck.v1';

let deck: DeckConfig = clonePresetDeck('async-refactor');
let timeline: CompiledTimeline = compileDeck(deck);
let selectedSlideIdx = 0;
let playheadMs = 0;
let playing = true;
let speedIdx = 1;
const SPEEDS = [0.5, 1, 1.5, 2];
let lastRafTs = performance.now();
let isExporting = false;

// DOM Refs
const previewCanvas = document.getElementById('previewCanvas') as HTMLCanvasElement;
const ctx = previewCanvas.getContext('2d')!;
const presetSelect = document.getElementById('presetSelect') as HTMLSelectElement;
const playPauseBtn = document.getElementById('playPauseBtn') as HTMLButtonElement;
const prevSlideBtn = document.getElementById('prevSlideBtn') as HTMLButtonElement;
const nextSlideBtn = document.getElementById('nextSlideBtn') as HTMLButtonElement;
const timelineScrubber = document.getElementById('timelineScrubber') as HTMLInputElement;
const timeReadout = document.getElementById('timeReadout') as HTMLSpanElement;
const speedToggleBtn = document.getElementById('speedToggleBtn') as HTMLButtonElement;
const slideStrip = document.getElementById('slideStrip') as HTMLDivElement;
const addSlideBtn = document.getElementById('addSlideBtn') as HTMLButtonElement;
const duplicateSlideBtn = document.getElementById('duplicateSlideBtn') as HTMLButtonElement;

// Slide Inspector Refs
const slideTitleInput = document.getElementById('slideTitleInput') as HTMLInputElement;
const slideLanguageSelect = document.getElementById('slideLanguageSelect') as HTMLSelectElement;
const slideBadgeInput = document.getElementById('slideBadgeInput') as HTMLInputElement;
const slideHighlightInput = document.getElementById('slideHighlightInput') as HTMLInputElement;
const slideCodeInput = document.getElementById('slideCodeInput') as HTMLTextAreaElement;
const slideDurationInput = document.getElementById('slideDurationInput') as HTMLInputElement;
const slideTransitionInput = document.getElementById('slideTransitionInput') as HTMLInputElement;
const holdValueLabel = document.getElementById('holdValueLabel') as HTMLElement;
const morphValueLabel = document.getElementById('morphValueLabel') as HTMLElement;
const slideTypingCheckbox = document.getElementById('slideTypingCheckbox') as HTMLInputElement;

// Style Inspector Refs
const deckTitleInput = document.getElementById('deckTitleInput') as HTMLInputElement;
const themeGrid = document.getElementById('themeGrid') as HTMLDivElement;
const backgroundGrid = document.getElementById('backgroundGrid') as HTMLDivElement;
const aspectRatioSelect = document.getElementById('aspectRatioSelect') as HTMLSelectElement;
const windowStyleSelect = document.getElementById('windowStyleSelect') as HTMLSelectElement;
const easingSelect = document.getElementById('easingSelect') as HTMLSelectElement;
const watermarkInput = document.getElementById('watermarkInput') as HTMLInputElement;
const fontSizeInput = document.getElementById('fontSizeInput') as HTMLInputElement;
const fontSizeLabel = document.getElementById('fontSizeLabel') as HTMLElement;
const paddingInput = document.getElementById('paddingInput') as HTMLInputElement;
const paddingLabel = document.getElementById('paddingLabel') as HTMLElement;
const showLineNumbersCheckbox = document.getElementById('showLineNumbersCheckbox') as HTMLInputElement;
const showDiffGlowCheckbox = document.getElementById('showDiffGlowCheckbox') as HTMLInputElement;
const showBadgeCheckbox = document.getElementById('showBadgeCheckbox') as HTMLInputElement;

// Modals & Buttons
const shareBtn = document.getElementById('shareBtn') as HTMLButtonElement;
const importBtn = document.getElementById('importBtn') as HTMLButtonElement;
const importModal = document.getElementById('importModal') as HTMLDivElement;
const closeImportModalBtn = document.getElementById('closeImportModalBtn') as HTMLButtonElement;
const githubCommitUrlInput = document.getElementById('githubCommitUrlInput') as HTMLInputElement;
const fetchGithubCommitBtn = document.getElementById('fetchGithubCommitBtn') as HTMLButtonElement;
const importPayloadInput = document.getElementById('importPayloadInput') as HTMLTextAreaElement;
const applyImportBtn = document.getElementById('applyImportBtn') as HTMLButtonElement;
const importErrorText = document.getElementById('importErrorText') as HTMLParagraphElement;
const exportPngBtn = document.getElementById('exportPngBtn') as HTMLButtonElement;
const exportHtmlBtn = document.getElementById('exportHtmlBtn') as HTMLButtonElement;
const exportWebmBtn = document.getElementById('exportWebmBtn') as HTMLButtonElement;
const exportGifBtn = document.getElementById('exportGifBtn') as HTMLButtonElement;
const exportJsonBtn = document.getElementById('exportJsonBtn') as HTMLButtonElement;
const resetDeckBtn = document.getElementById('resetDeckBtn') as HTMLButtonElement;
const exportOverlay = document.getElementById('exportOverlay') as HTMLDivElement;
const exportStatusText = document.getElementById('exportStatusText') as HTMLParagraphElement;
const exportProgressBar = document.getElementById('exportProgressBar') as HTMLDivElement;
const toastEl = document.getElementById('toast') as HTMLDivElement;

let toastTimer: number | null = null;

function showToast(msg: string): void {
  toastEl.textContent = msg;
  toastEl.classList.remove('hidden');
  if (toastTimer !== null) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toastEl.classList.add('hidden');
  }, 2600);
}

function parseHighlightRanges(input: string): number[] {
  const out = new Set<number>();
  for (const part of input.split(',')) {
    const token = part.trim();
    if (!token) continue;
    const range = token.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      for (let i = Math.min(start, end); i <= Math.max(start, end); i++) {
        if (i > 0) out.add(i);
      }
    } else if (/^\d+$/.test(token)) {
      const num = Number(token);
      if (num > 0) out.add(num);
    }
  }
  return [...out].sort((a, b) => a - b);
}

function formatHighlightRanges(nums?: number[]): string {
  return (nums ?? []).join(', ');
}

function saveDeck(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(deck));
  } catch {
    // Ignore quota errors
  }
}

function recompile(keepPlayhead = true): void {
  timeline = compileDeck(deck);
  const dims = resolveCanvasDimensions(timeline);
  if (previewCanvas.width !== dims.width || previewCanvas.height !== dims.height) {
    previewCanvas.width = dims.width;
    previewCanvas.height = dims.height;
  }
  timelineScrubber.max = String(timeline.totalDurationMs);
  if (!keepPlayhead || playheadMs > timeline.totalDurationMs) {
    playheadMs = 0;
  }
  saveDeck();
  renderCompiledFrame(ctx, timeline, playheadMs, previewCanvas.width, previewCanvas.height);
}

function getSelectedSlide(): Slide {
  if (selectedSlideIdx >= deck.slides.length) {
    selectedSlideIdx = Math.max(0, deck.slides.length - 1);
  }
  return deck.slides[selectedSlideIdx]!;
}

function jumpToSlide(idx: number): void {
  selectedSlideIdx = Math.max(0, Math.min(deck.slides.length - 1, idx));
  const holdSeg = timeline.segments.find((s) => s.kind === 'hold' && s.index === selectedSlideIdx);
  if (holdSeg) {
    playheadMs = holdSeg.startMs;
  }
  syncInspectorFromDeck();
  renderSlideStrip();
  renderCompiledFrame(ctx, timeline, playheadMs, previewCanvas.width, previewCanvas.height);
}

function renderSlideStrip(): void {
  slideStrip.innerHTML = '';
  deck.slides.forEach((slide, idx) => {
    const card = document.createElement('div');
    card.className = `slide-card${idx === selectedSlideIdx ? ' active' : ''}`;
    card.onclick = () => jumpToSlide(idx);

    const top = document.createElement('div');
    top.className = 'slide-card-top';

    const label = document.createElement('span');
    label.className = 'slide-index';
    label.textContent = `#${idx + 1} · ${slide.language}`;

    const btns = document.createElement('div');
    btns.className = 'slide-card-btns';

    if (idx > 0) {
      const leftBtn = document.createElement('button');
      leftBtn.className = 'icon-mini';
      leftBtn.textContent = '←';
      leftBtn.title = 'Move left';
      leftBtn.onclick = (e) => {
        e.stopPropagation();
        const item = deck.slides.splice(idx, 1)[0]!;
        deck.slides.splice(idx - 1, 0, item);
        selectedSlideIdx = idx - 1;
        recompile(false);
        renderSlideStrip();
        syncInspectorFromDeck();
      };
      btns.appendChild(leftBtn);
    }

    if (idx < deck.slides.length - 1) {
      const rightBtn = document.createElement('button');
      rightBtn.className = 'icon-mini';
      rightBtn.textContent = '→';
      rightBtn.title = 'Move right';
      rightBtn.onclick = (e) => {
        e.stopPropagation();
        const item = deck.slides.splice(idx, 1)[0]!;
        deck.slides.splice(idx + 1, 0, item);
        selectedSlideIdx = idx + 1;
        recompile(false);
        renderSlideStrip();
        syncInspectorFromDeck();
      };
      btns.appendChild(rightBtn);
    }

    if (deck.slides.length > 1) {
      const delBtn = document.createElement('button');
      delBtn.className = 'icon-mini danger';
      delBtn.textContent = '×';
      delBtn.title = 'Remove slide';
      delBtn.onclick = (e) => {
        e.stopPropagation();
        deck.slides.splice(idx, 1);
        selectedSlideIdx = Math.max(0, Math.min(selectedSlideIdx, deck.slides.length - 1));
        recompile(false);
        renderSlideStrip();
        syncInspectorFromDeck();
      };
      btns.appendChild(delBtn);
    }

    top.appendChild(label);
    top.appendChild(btns);

    const title = document.createElement('div');
    title.className = 'slide-card-title';
    title.textContent = slide.badge || slide.title || `Slide ${idx + 1}`;

    const preview = document.createElement('div');
    preview.className = 'slide-card-preview';
    preview.textContent = slide.code.split('\n').slice(0, 2).join('\n');

    card.appendChild(top);
    card.appendChild(title);
    card.appendChild(preview);
    slideStrip.appendChild(card);
  });
}

function renderSwatches(): void {
  themeGrid.innerHTML = '';
  for (const theme of THEMES) {
    const btn = document.createElement('button');
    btn.className = `swatch-btn${deck.themeId === theme.id ? ' active' : ''}`;
    btn.onclick = () => {
      deck.themeId = theme.id;
      recompile();
      renderSwatches();
    };
    const dot = document.createElement('span');
    dot.className = 'swatch-dot';
    dot.style.background = `linear-gradient(135deg, ${theme.windowBg}, ${theme.tokens.keyword})`;
    btn.appendChild(dot);
    btn.appendChild(document.createTextNode(theme.name));
    themeGrid.appendChild(btn);
  }

  backgroundGrid.innerHTML = '';
  for (const bg of BACKGROUNDS) {
    const btn = document.createElement('button');
    btn.className = `swatch-btn${deck.backgroundId === bg.id ? ' active' : ''}`;
    btn.onclick = () => {
      deck.backgroundId = bg.id;
      recompile();
      renderSwatches();
    };
    const dot = document.createElement('span');
    dot.className = 'swatch-dot';
    if (bg.transparent) {
      dot.style.background = 'repeating-conic-gradient(#475569 0% 25%, #1e293b 0% 50%) 50% / 8px 8px';
    } else {
      const stopColors = bg.stops.map((s) => `${s.color} ${Math.round(s.offset * 100)}%`).join(', ');
      dot.style.background = `linear-gradient(${bg.angle}deg, ${stopColors})`;
    }
    btn.appendChild(dot);
    btn.appendChild(document.createTextNode(bg.name));
    backgroundGrid.appendChild(btn);
  }
}

function syncInspectorFromDeck(): void {
  const slide = getSelectedSlide();
  slideTitleInput.value = slide.title;
  slideLanguageSelect.value = slide.language;
  slideBadgeInput.value = slide.badge ?? '';
  slideHighlightInput.value = formatHighlightRanges(slide.highlightLines);
  slideCodeInput.value = slide.code;
  slideDurationInput.value = String(slide.durationMs);
  slideTransitionInput.value = String(slide.transitionMs);
  holdValueLabel.textContent = `${slide.durationMs}ms`;
  morphValueLabel.textContent = `${slide.transitionMs}ms`;
  slideTypingCheckbox.checked = Boolean(slide.typingMode);

  deckTitleInput.value = deck.title;
  aspectRatioSelect.value = deck.aspectRatio;
  windowStyleSelect.value = deck.windowStyle;
  easingSelect.value = deck.easing;
  watermarkInput.value = deck.watermark ?? '';
  fontSizeInput.value = String(deck.fontSize);
  fontSizeLabel.textContent = `${deck.fontSize}px`;
  paddingInput.value = String(deck.padding);
  paddingLabel.textContent = `${deck.padding}px`;
  showLineNumbersCheckbox.checked = deck.showLineNumbers;
  showDiffGlowCheckbox.checked = deck.showDiffGlow;
  showBadgeCheckbox.checked = deck.showBadge;

  renderSwatches();
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function setExportProgress(visible: boolean, label = '', pct = 0): void {
  isExporting = visible;
  exportOverlay.classList.toggle('hidden', !visible);
  exportStatusText.textContent = label;
  exportProgressBar.style.width = `${Math.round(pct)}%`;
}

async function exportGif(): Promise<void> {
  if (isExporting) return;
  const wasPlaying = playing;
  playing = false;

  try {
    setExportProgress(true, 'Rendering GIF frames...', 2);
    const fullDims = resolveCanvasDimensions(timeline);
    const maxWidth = 880;
    const scale = fullDims.width > maxWidth ? maxWidth / fullDims.width : 1;
    const w = Math.max(320, Math.round(fullDims.width * scale));
    const h = Math.max(200, Math.round(fullDims.height * scale));

    const offscreen = document.createElement('canvas');
    offscreen.width = w;
    offscreen.height = h;
    const octx = offscreen.getContext('2d', { willReadFrequently: true })!;

    const fps = 20;
    const stepMs = Math.round(1000 / fps);
    const frames: GifFrameInput[] = [];
    const total = Math.max(stepMs, timeline.totalDurationMs);

    for (let t = 0; t < total; t += stepMs) {
      octx.save();
      octx.setTransform(scale, 0, 0, scale, 0, 0);
      renderCompiledFrame(octx, timeline, t, fullDims.width, fullDims.height);
      octx.restore();

      const img = octx.getImageData(0, 0, w, h);
      frames.push({ rgba: img.data, delayMs: stepMs });

      const pct = Math.min(72, (t / total) * 72);
      setExportProgress(true, `Capturing frames (${frames.length})...`, pct);
      if (frames.length % 6 === 0) {
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    setExportProgress(true, 'Quantizing palette & encoding GIF89a...', 82);
    await new Promise((r) => setTimeout(r, 10));

    const gifBytes = encodeGif(w, h, frames);
    setExportProgress(true, 'Done!', 100);
    downloadBlob(new Blob([gifBytes.buffer as ArrayBuffer], { type: 'image/gif' }), 'codereel.gif');
    showToast(`Exported codereel.gif (${Math.round(gifBytes.length / 1024)} KB)`);
  } catch (err) {
    showToast(`GIF export failed: ${(err as Error).message}`);
  } finally {
    setExportProgress(false);
    playing = wasPlaying;
  }
}

async function exportWebm(): Promise<void> {
  if (isExporting) return;
  if (typeof MediaRecorder === 'undefined' || typeof previewCanvas.captureStream !== 'function') {
    showToast('MediaRecorder is not supported in this browser.');
    return;
  }
  const wasPlaying = playing;
  playing = false;

  try {
    setExportProgress(true, 'Recording WebM stream (60 FPS)...', 4);
    const dims = resolveCanvasDimensions(timeline);
    const offscreen = document.createElement('canvas');
    offscreen.width = dims.width;
    offscreen.height = dims.height;
    const octx = offscreen.getContext('2d')!;

    const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm';
    const stream = offscreen.captureStream(60);
    const recorder = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: 6_000_000,
    });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (ev) => {
      if (ev.data.size > 0) chunks.push(ev.data);
    };

    const donePromise = new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: mime }));
    });

    recorder.start();
    const total = Math.max(300, timeline.totalDurationMs);
    const startWall = performance.now();

    await new Promise<void>((resolve) => {
      const step = () => {
        const elapsed = performance.now() - startWall;
        const clamped = Math.min(total, elapsed);
        renderCompiledFrame(octx, timeline, clamped, dims.width, dims.height);
        setExportProgress(true, 'Recording WebM video...', Math.min(98, (clamped / total) * 100));
        if (elapsed < total) {
          requestAnimationFrame(step);
        } else {
          resolve();
        }
      };
      requestAnimationFrame(step);
    });

    recorder.stop();
    const blob = await donePromise;
    downloadBlob(blob, 'codereel.webm');
    showToast(`Exported codereel.webm (${Math.round(blob.size / 1024)} KB)`);
  } catch (err) {
    showToast(`WebM export failed: ${(err as Error).message}`);
  } finally {
    setExportProgress(false);
    playing = wasPlaying;
  }
}

function wireEvents(): void {
  // Tabs
  document.querySelectorAll<HTMLButtonElement>('.tab-btn').forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      document.getElementById('tabSlide')!.classList.toggle('hidden', tab !== 'slide');
      document.getElementById('tabStyle')!.classList.toggle('hidden', tab !== 'style');
    };
  });

  // Preset switch
  presetSelect.onchange = () => {
    deck = clonePresetDeck(presetSelect.value);
    selectedSlideIdx = 0;
    recompile(false);
    renderSlideStrip();
    syncInspectorFromDeck();
    showToast(`Loaded preset: ${deck.title}`);
  };

  // Playback controls
  playPauseBtn.onclick = () => {
    playing = !playing;
    playPauseBtn.textContent = playing ? 'Pause' : 'Play';
  };
  prevSlideBtn.onclick = () => {
    playing = false;
    playPauseBtn.textContent = 'Play';
    jumpToSlide((selectedSlideIdx - 1 + deck.slides.length) % deck.slides.length);
  };
  nextSlideBtn.onclick = () => {
    playing = false;
    playPauseBtn.textContent = 'Play';
    jumpToSlide((selectedSlideIdx + 1) % deck.slides.length);
  };
  speedToggleBtn.onclick = () => {
    speedIdx = (speedIdx + 1) % SPEEDS.length;
    speedToggleBtn.textContent = `${SPEEDS[speedIdx]}x`;
  };
  timelineScrubber.oninput = () => {
    playing = false;
    playPauseBtn.textContent = 'Play';
    playheadMs = Number(timelineScrubber.value);
    renderCompiledFrame(ctx, timeline, playheadMs, previewCanvas.width, previewCanvas.height);
  };

  window.addEventListener('keydown', (e) => {
    const activeTag = (document.activeElement as HTMLElement | null)?.tagName;
    if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') return;
    if (e.code === 'Space') {
      e.preventDefault();
      playPauseBtn.click();
    } else if (e.code === 'ArrowLeft') {
      prevSlideBtn.click();
    } else if (e.code === 'ArrowRight') {
      nextSlideBtn.click();
    }
  });

  // Slide Add / Duplicate
  addSlideBtn.onclick = () => {
    const current = getSelectedSlide();
    const nextSlide: Slide = {
      ...current,
      id: `slide-${Date.now()}`,
      badge: `Step ${deck.slides.length + 1}`,
    };
    deck.slides.splice(selectedSlideIdx + 1, 0, nextSlide);
    selectedSlideIdx++;
    recompile(false);
    renderSlideStrip();
    syncInspectorFromDeck();
    jumpToSlide(selectedSlideIdx);
  };
  duplicateSlideBtn.onclick = () => addSlideBtn.click();

  // Slide Inspector inputs
  slideTitleInput.oninput = () => {
    getSelectedSlide().title = slideTitleInput.value;
    recompile();
    renderSlideStrip();
  };
  slideLanguageSelect.onchange = () => {
    getSelectedSlide().language = slideLanguageSelect.value as SupportedLanguage;
    recompile();
    renderSlideStrip();
  };
  slideBadgeInput.oninput = () => {
    getSelectedSlide().badge = slideBadgeInput.value;
    recompile();
    renderSlideStrip();
  };
  slideHighlightInput.oninput = () => {
    getSelectedSlide().highlightLines = parseHighlightRanges(slideHighlightInput.value);
    recompile();
  };
  slideCodeInput.oninput = () => {
    getSelectedSlide().code = slideCodeInput.value;
    recompile();
    renderSlideStrip();
  };
  slideCodeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = slideCodeInput.selectionStart;
      const end = slideCodeInput.selectionEnd;
      const v = slideCodeInput.value;
      slideCodeInput.value = `${v.slice(0, start)}  ${v.slice(end)}`;
      slideCodeInput.selectionStart = slideCodeInput.selectionEnd = start + 2;
      getSelectedSlide().code = slideCodeInput.value;
      recompile();
    }
  });
  slideDurationInput.oninput = () => {
    const val = Number(slideDurationInput.value);
    getSelectedSlide().durationMs = val;
    holdValueLabel.textContent = `${val}ms`;
    recompile();
  };
  slideTransitionInput.oninput = () => {
    const val = Number(slideTransitionInput.value);
    getSelectedSlide().transitionMs = val;
    morphValueLabel.textContent = `${val}ms`;
    recompile();
  };
  slideTypingCheckbox.onchange = () => {
    getSelectedSlide().typingMode = slideTypingCheckbox.checked;
    recompile();
  };

  // Style Inspector inputs
  deckTitleInput.oninput = () => {
    deck.title = deckTitleInput.value;
    recompile();
  };
  aspectRatioSelect.onchange = () => {
    deck.aspectRatio = aspectRatioSelect.value as AspectRatio;
    recompile();
  };
  windowStyleSelect.onchange = () => {
    deck.windowStyle = windowStyleSelect.value as WindowStyle;
    recompile();
  };
  easingSelect.onchange = () => {
    deck.easing = easingSelect.value as EasingName;
    recompile();
  };
  watermarkInput.oninput = () => {
    deck.watermark = watermarkInput.value;
    recompile();
  };
  fontSizeInput.oninput = () => {
    deck.fontSize = Number(fontSizeInput.value);
    fontSizeLabel.textContent = `${deck.fontSize}px`;
    recompile();
  };
  paddingInput.oninput = () => {
    deck.padding = Number(paddingInput.value);
    paddingLabel.textContent = `${deck.padding}px`;
    recompile();
  };
  showLineNumbersCheckbox.onchange = () => {
    deck.showLineNumbers = showLineNumbersCheckbox.checked;
    recompile();
  };
  showDiffGlowCheckbox.onchange = () => {
    deck.showDiffGlow = showDiffGlowCheckbox.checked;
    recompile();
  };
  showBadgeCheckbox.onchange = () => {
    deck.showBadge = showBadgeCheckbox.checked;
    recompile();
  };

  // Share URL
  shareBtn.onclick = async () => {
    const hash = encodeDeckToUrlHash(deck);
    window.history.replaceState(null, '', hash);
    try {
      await navigator.clipboard.writeText(window.location.href);
      showToast('Shareable deck URL copied to clipboard!');
    } catch {
      showToast('URL updated in address bar — copy from browser.');
    }
  };

  // Import Modal
  importBtn.onclick = () => {
    importErrorText.classList.add('hidden');
    importModal.classList.remove('hidden');
  };
  closeImportModalBtn.onclick = () => importModal.classList.add('hidden');
  importModal.onclick = (e) => {
    if (e.target === importModal) importModal.classList.add('hidden');
  };

  fetchGithubCommitBtn.onclick = async () => {
    importErrorText.classList.add('hidden');
    fetchGithubCommitBtn.disabled = true;
    fetchGithubCommitBtn.textContent = 'Fetching...';
    try {
      const slides = await fetchGithubCommitSlides(githubCommitUrlInput.value);
      deck.slides = slides;
      deck.title = slides[1]?.badge ?? 'GitHub Commit Reel';
      selectedSlideIdx = 0;
      recompile(false);
      renderSlideStrip();
      syncInspectorFromDeck();
      importModal.classList.add('hidden');
      showToast('Loaded GitHub commit diff!');
    } catch (err) {
      importErrorText.textContent = (err as Error).message;
      importErrorText.classList.remove('hidden');
    } finally {
      fetchGithubCommitBtn.disabled = false;
      fetchGithubCommitBtn.textContent = 'Fetch Commit';
    }
  };

  applyImportBtn.onclick = () => {
    importErrorText.classList.add('hidden');
    try {
      const parsed = parseImportedTextToSlides(importPayloadInput.value);
      if (parsed.deckOverride) {
        deck = parsed.deckOverride;
      } else {
        deck.slides = parsed.slides;
      }
      selectedSlideIdx = 0;
      recompile(false);
      renderSlideStrip();
      syncInspectorFromDeck();
      importModal.classList.add('hidden');
      showToast(`Imported ${deck.slides.length} slides!`);
    } catch (err) {
      importErrorText.textContent = (err as Error).message;
      importErrorText.classList.remove('hidden');
    }
  };

  // Exports
  exportPngBtn.onclick = () => {
    previewCanvas.toBlob((blob) => {
      if (!blob) return;
      downloadBlob(blob, 'codereel-frame.png');
      showToast('Exported codereel-frame.png');
    }, 'image/png');
  };
  exportHtmlBtn.onclick = () => {
    const html = buildStandaloneHtml(deck);
    downloadBlob(new Blob([html], { type: 'text/html' }), 'codereel-player.html');
    showToast('Exported standalone codereel-player.html');
  };
  exportWebmBtn.onclick = () => {
    void exportWebm();
  };
  exportGifBtn.onclick = () => {
    void exportGif();
  };
  exportJsonBtn.onclick = () => {
    const json = JSON.stringify(deck, null, 2);
    downloadBlob(new Blob([json], { type: 'application/json' }), 'codereel-deck.json');
    showToast('Downloaded codereel-deck.json');
  };
  resetDeckBtn.onclick = () => {
    localStorage.removeItem(STORAGE_KEY);
    deck = clonePresetDeck(presetSelect.value);
    selectedSlideIdx = 0;
    recompile(false);
    renderSlideStrip();
    syncInspectorFromDeck();
    showToast('Reset to preset');
  };
}

function startPlaybackLoop(): void {
  const loop = (now: number) => {
    const dt = Math.min(80, now - lastRafTs);
    lastRafTs = now;
    if (playing && !isExporting && timeline.totalDurationMs > 0) {
      playheadMs = (playheadMs + dt * SPEEDS[speedIdx]!) % timeline.totalDurationMs;
      timelineScrubber.value = String(Math.round(playheadMs));
      renderCompiledFrame(ctx, timeline, playheadMs, previewCanvas.width, previewCanvas.height);
    }
    timeReadout.textContent = `${(playheadMs / 1000).toFixed(1)}s / ${(timeline.totalDurationMs / 1000).toFixed(1)}s`;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

async function bootstrap(): Promise<void> {
  // 1. Check URL hash
  const fromHash = decodeDeckFromUrlHash(window.location.hash);
  if (fromHash) {
    deck = fromHash;
  } else {
    // 2. Check local CLI preloaded deck (/api/deck)
    try {
      const resp = await fetch('/api/deck');
      if (resp.ok) {
        const cliDeck = (await resp.json()) as DeckConfig | null;
        if (cliDeck && Array.isArray(cliDeck.slides) && cliDeck.slides.length > 0) {
          deck = cliDeck;
        }
      }
    } catch {
      // Static GitHub Pages hosting: /api/deck does not exist
    }

    if (!fromHash && deck.title === 'Callback Hell -> Async Pipeline') {
      // 3. Restore autosaved deck if present
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved) as DeckConfig;
          if (parsed && Array.isArray(parsed.slides) && parsed.slides.length > 0) {
            deck = parsed;
          }
        }
      } catch {
        // Ignore corrupt localStorage
      }
    }
  }

  wireEvents();
  recompile(false);
  renderSlideStrip();
  syncInspectorFromDeck();
  startPlaybackLoop();
}

void bootstrap();
