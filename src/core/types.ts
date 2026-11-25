export type SupportedLanguage =
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'rust'
  | 'go'
  | 'bash'
  | 'json'
  | 'css'
  | 'html'
  | 'sql'
  | 'diff'
  | 'plaintext';

export type TokenKind =
  | 'plain'
  | 'keyword'
  | 'string'
  | 'number'
  | 'comment'
  | 'type'
  | 'function'
  | 'operator'
  | 'punctuation'
  | 'property'
  | 'prompt'
  | 'added'
  | 'removed';

export interface Token {
  text: string;
  kind: TokenKind;
  col: number;
}

export interface TokenizedLine {
  lineNumber: number;
  tokens: Token[];
  raw: string;
}

export type WindowStyle = 'macos' | 'minimal' | 'terminal' | 'none';
export type AspectRatio = '16:9' | '1:1' | '9:16' | '4:3' | 'auto';
export type EasingName = 'easeInOutCubic' | 'spring' | 'easeOutQuart' | 'linear';

export interface Slide {
  id: string;
  title: string;
  code: string;
  language: SupportedLanguage;
  durationMs: number;
  transitionMs: number;
  highlightLines?: number[];
  typingMode?: boolean;
  badge?: string;
}

export interface DeckConfig {
  title: string;
  themeId: string;
  backgroundId: string;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  padding: number;
  windowStyle: WindowStyle;
  showLineNumbers: boolean;
  showDiffGlow: boolean;
  showBadge: boolean;
  aspectRatio: AspectRatio;
  easing: EasingName;
  watermark?: string;
  slides: Slide[];
}

export interface ThemePalette {
  id: string;
  name: string;
  isDark: boolean;
  windowBg: string;
  windowBorder: string;
  titleBarBg: string;
  titleText: string;
  lineNumber: string;
  highlightLineBg: string;
  addedBg: string;
  removedBg: string;
  badgeBg: string;
  badgeText: string;
  tokens: Record<TokenKind, string>;
}

export interface BackgroundPreset {
  id: string;
  name: string;
  angle: number;
  stops: Array<{ offset: number; color: string }>;
  transparent?: boolean;
}

export interface MorphEndpoint {
  lineIndex: number;
  col: number;
  text: string;
  kind: TokenKind;
  color: string;
  highlighted: boolean;
}

export interface MorphToken {
  state: 'matched' | 'exit' | 'enter';
  from?: MorphEndpoint;
  to?: MorphEndpoint;
}

export interface CompiledSlide {
  id: string;
  title: string;
  badge?: string;
  typingMode: boolean;
  durationMs: number;
  transitionMs: number;
  lineCount: number;
  maxCols: number;
  highlightLines: number[];
  lines: Array<{
    lineNumber: number;
    highlighted: boolean;
    tokens: Array<{
      text: string;
      col: number;
      kind: TokenKind;
      color: string;
    }>;
  }>;
}

export interface CompiledTransition {
  fromSlideIndex: number;
  toSlideIndex: number;
  durationMs: number;
  fromLineCount: number;
  toLineCount: number;
  fromMaxCols: number;
  toMaxCols: number;
  tokens: MorphToken[];
  removedLines: number[];
  addedLines: number[];
}

export interface CanvasGradientLike {
  addColorStop(offset: number, color: string): void;
}

export interface CanvasContext2DLike {
  font: string;
  textBaseline: 'alphabetic' | 'bottom' | 'hanging' | 'ideographic' | 'middle' | 'top';
  textAlign: 'center' | 'end' | 'left' | 'right' | 'start';
  fillStyle: string | CanvasGradientLike | object;
  strokeStyle: string | CanvasGradientLike | object;
  lineWidth: number;
  globalAlpha: number;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetY: number;
  clearRect(x: number, y: number, w: number, h: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): CanvasGradientLike;
  createRadialGradient(
    x0: number,
    y0: number,
    r0: number,
    x1: number,
    y1: number,
    r1: number,
  ): CanvasGradientLike;
  measureText(text: string): { width: number };
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void;
  closePath(): void;
  arc(x: number, y: number, r: number, startAngle: number, endAngle: number): void;
  fill(): void;
  stroke(): void;
  clip(): void;
  save(): void;
  restore(): void;
  fillText(text: string, x: number, y: number): void;
}

export interface CompiledTimeline {
  title: string;
  theme: ThemePalette;
  background: BackgroundPreset;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  padding: number;
  windowStyle: WindowStyle;
  showLineNumbers: boolean;
  showDiffGlow: boolean;
  showBadge: boolean;
  aspectRatio: AspectRatio;
  easing: EasingName;
  watermark?: string;
  totalDurationMs: number;
  slides: CompiledSlide[];
  transitions: CompiledTransition[];
  segments: Array<{
    kind: 'hold' | 'transition';
    index: number;
    startMs: number;
    endMs: number;
  }>;
}
