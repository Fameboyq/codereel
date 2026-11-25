import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildDeckFromFiles,
  buildDeckFromGit,
  loadDeckFromInputFile,
} from '../src/cli/git-source.js';

function runGit(cwd: string, args: string[]): void {
  execFileSync('git', args, { cwd, stdio: 'ignore' });
}

describe('CLI git & file sources', () => {
  it('extracts multi-commit evolution from a real local git repository', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codereel-git-'));
    try {
      runGit(tmpDir, ['init']);
      runGit(tmpDir, ['config', 'user.email', 'dev@example.com']);
      runGit(tmpDir, ['config', 'user.name', 'CodeReel Test']);

      fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
      const filePath = path.join(tmpDir, 'src', 'greeter.ts');

      fs.writeFileSync(filePath, 'export function greet(name: string) {\n  return "hi " + name;\n}\n');
      runGit(tmpDir, ['add', '.']);
      runGit(tmpDir, ['commit', '-m', 'init greeter']);

      fs.writeFileSync(
        filePath,
        'export function greet(name: string): string {\n  return `Hello, ${name}!`;\n}\n',
      );
      runGit(tmpDir, ['add', '.']);
      runGit(tmpDir, ['commit', '-m', 'use template literal']);

      fs.writeFileSync(
        filePath,
        'export function greet(name = "world"): string {\n  return `Hello, ${name.trim()}!`;\n}\n',
      );
      runGit(tmpDir, ['add', '.']);
      runGit(tmpDir, ['commit', '-m', 'add default name and trim']);

      const deck = buildDeckFromGit(tmpDir, {
        file: 'src/greeter.ts',
        limit: 5,
        themeId: 'dracula',
      });

      expect(deck.themeId).toBe('dracula');
      expect(deck.slides).toHaveLength(3);
      expect(deck.slides[0]!.badge).toContain('init greeter');
      expect(deck.slides[1]!.badge).toContain('use template literal');
      expect(deck.slides[2]!.badge).toContain('add default name and trim');
      expect(deck.slides[0]!.code).toContain('"hi " + name');
      expect(deck.slides[2]!.code).toContain('name.trim()');

      // Also verify auto-detecting the primary file without --file
      const autoDeck = buildDeckFromGit(tmpDir, { limit: 3 });
      expect(autoDeck.slides).toHaveLength(3);
      expect(autoDeck.slides[0]!.title).toBe('src/greeter.ts');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('builds decks from local files and example markdown/json inputs', () => {
    const deckFromExamples = loadDeckFromInputFile('examples/async-refactor.md', {
      themeId: 'nord',
    });
    expect(deckFromExamples.themeId).toBe('nord');
    expect(deckFromExamples.slides).toHaveLength(2);

    const fileDeck = buildDeckFromFiles(['src/core/types.ts', 'src/core/themes.ts']);
    expect(fileDeck.slides).toHaveLength(2);
    expect(fileDeck.slides[0]!.language).toBe('typescript');
  });
});
