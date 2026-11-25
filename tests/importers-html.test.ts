import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { buildStandaloneHtml } from '../src/core/html-export.js';
import { parseImportedPayload } from '../src/core/importers.js';
import { clonePresetDeck } from '../src/core/presets.js';

describe('importers and standalone HTML exporter', () => {
  it('parses Markdown fenced code blocks with heading badges', () => {
    const md = [
      '## Before',
      '```ts app.ts',
      'const x = 1;',
      '```',
      '',
      '## After',
      '```ts app.ts',
      'const x: number = 2;',
      '```',
    ].join('\n');

    const parsed = parseImportedPayload(md);
    expect(parsed.slides).toHaveLength(2);
    expect(parsed.slides[0]!.language).toBe('typescript');
    expect(parsed.slides[0]!.badge).toBe('Before');
    expect(parsed.slides[1]!.badge).toBe('After');
    expect(parsed.slides[1]!.code).toBe('const x: number = 2;');
  });

  it('parses unified git diff into Before and After slides', () => {
    const diff = [
      'diff --git a/src/math.ts b/src/math.ts',
      '--- a/src/math.ts',
      '+++ b/src/math.ts',
      '@@ -1,3 +1,3 @@',
      ' export function add(a: number, b: number) {',
      '-  return a + b;',
      '+  return Number(a) + Number(b);',
      ' }',
    ].join('\n');

    const parsed = parseImportedPayload(diff);
    expect(parsed.slides).toHaveLength(2);
    expect(parsed.slides[0]!.title).toBe('src/math.ts');
    expect(parsed.slides[0]!.language).toBe('typescript');
    expect(parsed.slides[0]!.code).toContain('return a + b;');
    expect(parsed.slides[1]!.code).toContain('return Number(a) + Number(b);');
  });

  it('builds valid standalone HTML with escaped title and syntactically valid inline JS', () => {
    const deck = clonePresetDeck('async-refactor');
    deck.title = 'Demo <script>alert(1)</script>';
    const html = buildStandaloneHtml(deck);

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Demo &lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('Demo <script>alert(1)</script>');

    const scriptMatch = html.match(/<script>([\s\S]*)<\/script>/);
    expect(scriptMatch).not.toBeNull();
    // Verify generated player JS parses cleanly with zero syntax errors
    expect(() => new vm.Script(scriptMatch![1]!)).not.toThrow();
  });
});
