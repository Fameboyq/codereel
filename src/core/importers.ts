import { detectLanguageFromFilename } from './tokenizer.js';
import type { DeckConfig, Slide, SupportedLanguage } from './types.js';

export function normalizeLanguageAlias(raw: string): SupportedLanguage {
  const s = raw.trim().toLowerCase();
  if (s === 'ts' || s === 'tsx' || s === 'typescript') return 'typescript';
  if (s === 'js' || s === 'jsx' || s === 'javascript') return 'javascript';
  if (s === 'py' || s === 'python') return 'python';
  if (s === 'rs' || s === 'rust') return 'rust';
  if (s === 'go' || s === 'golang') return 'go';
  if (s === 'sh' || s === 'bash' || s === 'zsh' || s === 'shell') return 'bash';
  if (s === 'json') return 'json';
  if (s === 'css' || s === 'scss') return 'css';
  if (s === 'html' || s === 'xml' || s === 'svg') return 'html';
  if (s === 'sql') return 'sql';
  if (s === 'diff' || s === 'patch') return 'diff';
  return 'plaintext';
}

export function parseMarkdownToSlides(markdown: string, baseTitle = 'Snippet'): Slide[] {
  const normalized = markdown.replace(/\r\n/g, '\n');
  const fenceRe = /```([a-zA-Z0-9_-]*)(?:[ \t]+([^\n]+))?\n([\s\S]*?)```/g;
  const slides: Slide[] = [];
  let match: RegExpExecArray | null;
  let idx = 1;

  while ((match = fenceRe.exec(normalized)) !== null) {
    const lang = normalizeLanguageAlias(match[1] ?? '');
    const metaInfo = (match[2] ?? '').trim();
    const code = (match[3] ?? '').replace(/\n$/, '');
    if (!code.trim()) continue;

    // Look backward slightly for a markdown heading right above the fence
    const beforeFence = normalized.slice(0, match.index).trimEnd();
    const lastLine = beforeFence.split('\n').pop()?.trim() ?? '';
    const headingMatch = lastLine.match(/^#{1,4}\s+(.+)$/);

    slides.push({
      id: `md-${idx}`,
      title: metaInfo || (headingMatch ? `${baseTitle}` : `${baseTitle} (${idx})`),
      badge: headingMatch ? headingMatch[1]!.trim() : `Slide ${idx}`,
      language: lang,
      durationMs: 1700,
      transitionMs: 850,
      typingMode: lang === 'bash',
      code,
    });
    idx++;
  }

  return slides;
}

export function parseUnifiedDiffToSlides(diffText: string): Slide[] {
  const lines = diffText.replace(/\r\n/g, '\n').split('\n');
  let filename = 'patch.ts';
  const beforeLines: string[] = [];
  const afterLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith('+++ b/')) {
      filename = line.slice(6).trim();
      continue;
    }
    if (
      line.startsWith('diff --git') ||
      line.startsWith('index ') ||
      line.startsWith('--- ') ||
      line.startsWith('+++ ') ||
      line.startsWith('@@')
    ) {
      continue;
    }
    if (line.startsWith('-')) {
      beforeLines.push(line.slice(1));
    } else if (line.startsWith('+')) {
      afterLines.push(line.slice(1));
    } else if (line.startsWith(' ')) {
      const clean = line.slice(1);
      beforeLines.push(clean);
      afterLines.push(clean);
    }
  }

  if (beforeLines.length === 0 && afterLines.length === 0) {
    return [];
  }

  const language = detectLanguageFromFilename(filename);
  return [
    {
      id: 'diff-before',
      title: filename,
      badge: 'Before',
      language,
      durationMs: 1600,
      transitionMs: 900,
      code: beforeLines.join('\n') || '// (new file)',
    },
    {
      id: 'diff-after',
      title: filename,
      badge: 'After',
      language,
      durationMs: 2200,
      transitionMs: 900,
      code: afterLines.join('\n') || '// (deleted)',
    },
  ];
}

/**
 * Parses arbitrary input payload: Deck JSON, Markdown code fences, or unified git diff.
 */
export function parseImportedPayload(
  payload: string,
  baseTitle = 'Imported Snippet',
): { slides: Slide[]; deckOverride?: DeckConfig } {
  const trimmed = payload.trim();
  if (!trimmed) {
    throw new Error('Input is empty.');
  }

  if (trimmed.startsWith('{')) {
    const parsed = JSON.parse(trimmed) as Partial<DeckConfig>;
    if (Array.isArray(parsed.slides) && parsed.slides.length > 0) {
      return {
        slides: parsed.slides,
        deckOverride: parsed as DeckConfig,
      };
    }
  }

  const mdSlides = parseMarkdownToSlides(trimmed, baseTitle);
  if (mdSlides.length > 0) {
    return { slides: mdSlides };
  }

  if (/^(diff --git|---\s+a\/|@@\s+-\d+)/m.test(trimmed)) {
    const diffSlides = parseUnifiedDiffToSlides(trimmed);
    if (diffSlides.length > 0) {
      return { slides: diffSlides };
    }
  }

  throw new Error('Could not recognize Deck JSON, Markdown fenced blocks, or a unified git diff.');
}
