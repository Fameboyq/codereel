import { describe, expect, it } from 'vitest';
import { alignLines, computeMagicMoveDiff } from '../src/core/diff.js';
import { getThemeById } from '../src/core/themes.js';
import { tokenizeCode } from '../src/core/tokenizer.js';

describe('Magic Move diff engine', () => {
  const theme = getThemeById('tokyo-night');

  it('pairs exact and modified lines while preserving relative order', () => {
    const a = tokenizeCode('const a = 1;\nconst res = fetch(url);\nreturn res;', 'typescript');
    const b = tokenizeCode('const a = 1;\nconst res = await fetch(url);\nreturn res;', 'typescript');

    const aligned = alignLines(a, b);
    expect(aligned.pairs).toEqual([
      { fromLine: 0, toLine: 0 },
      { fromLine: 1, toLine: 1 },
      { fromLine: 2, toLine: 2 },
    ]);
    expect(aligned.removedLines).toEqual([]);
    expect(aligned.addedLines).toEqual([]);
  });

  it('tracks gliding matched tokens, exiting tokens, and entering tokens', () => {
    const a = tokenizeCode('const data = fetchUser(id);', 'typescript');
    const b = tokenizeCode('const user = await fetchUser(id);', 'typescript');

    const diff = computeMagicMoveDiff(a, b, theme, new Set(), new Set());

    const matchedTexts = diff.tokens
      .filter((t) => t.state === 'matched')
      .map((t) => t.to?.text);
    expect(matchedTexts).toContain('const');
    expect(matchedTexts).toContain('fetchUser');

    // `fetchUser` shifted rightward after inserting `await`
    const fetchMorph = diff.tokens.find((t) => t.state === 'matched' && t.to?.text === 'fetchUser');
    expect(fetchMorph?.from?.col).toBeLessThan(fetchMorph?.to?.col ?? 0);

    const exited = diff.tokens.filter((t) => t.state === 'exit').map((t) => t.from?.text);
    const entered = diff.tokens.filter((t) => t.state === 'enter').map((t) => t.to?.text);
    expect(exited).toContain('data');
    expect(entered).toContain('user');
    expect(entered).toContain('await');
  });

  it('glides relocated substantive tokens across lines without flying bare punctuation', () => {
    const a = tokenizeCode('function alpha() {\n  computeMetrics();\n}', 'typescript');
    const b = tokenizeCode('function beta() {\n  const x = 1;\n  computeMetrics();\n}', 'typescript');

    const diff = computeMagicMoveDiff(a, b, theme, new Set(), new Set());
    const movedCall = diff.tokens.find(
      (t) => t.state === 'matched' && t.from?.text === 'computeMetrics',
    );
    expect(movedCall).toBeDefined();
    expect(movedCall?.from?.lineIndex).toBe(1);
    expect(movedCall?.to?.lineIndex).toBe(2);
  });
});
