import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parseImportedPayload } from '../core/importers.js';
import { clonePresetDeck } from '../core/presets.js';
import { detectLanguageFromFilename } from '../core/tokenizer.js';
import type { AspectRatio, DeckConfig, Slide } from '../core/types.js';

export interface DeckStyleOptions {
  title?: string;
  themeId?: string;
  backgroundId?: string;
  aspectRatio?: AspectRatio;
  watermark?: string;
}

export interface GitDeckOptions extends DeckStyleOptions {
  range?: string;
  file?: string;
  limit?: number;
  maxLines?: number;
}

function applyStyleOptions(base: DeckConfig, options?: DeckStyleOptions): DeckConfig {
  return {
    ...base,
    title: options?.title ?? base.title,
    themeId: options?.themeId ?? base.themeId,
    backgroundId: options?.backgroundId ?? base.backgroundId,
    aspectRatio: options?.aspectRatio ?? base.aspectRatio,
    watermark: options?.watermark ?? base.watermark,
  };
}

function trimLinesForSlide(code: string, maxLines: number): string {
  const lines = code.replace(/\r\n/g, '\n').split('\n');
  if (lines.length <= maxLines) return lines.join('\n');
  return [...lines.slice(0, maxLines), `// ... (${lines.length - maxLines} more lines)`].join('\n');
}

function runGit(cwd: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function isIgnoredAsset(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return (
    lower.endsWith('package-lock.json') ||
    lower.endsWith('pnpm-lock.yaml') ||
    lower.endsWith('yarn.lock') ||
    lower.endsWith('.png') ||
    lower.endsWith('.jpg') ||
    lower.endsWith('.gif') ||
    lower.endsWith('.svg') ||
    lower.endsWith('.ico')
  );
}

export function buildDeckFromFiles(filePaths: string[], options?: DeckStyleOptions): DeckConfig {
  if (filePaths.length === 0) {
    throw new Error('At least one file path is required.');
  }

  const slides: Slide[] = filePaths.map((fp, idx) => {
    const resolved = path.resolve(fp);
    const content = fs.readFileSync(resolved, 'utf8');
    const name = path.basename(resolved);
    return {
      id: `file-${idx + 1}`,
      title: name,
      badge: `Step ${idx + 1} · ${name}`,
      language: detectLanguageFromFilename(name),
      durationMs: idx === filePaths.length - 1 ? 2200 : 1600,
      transitionMs: 850,
      code: trimLinesForSlide(content, 48),
    };
  });

  const base = clonePresetDeck('async-refactor');
  return applyStyleOptions(
    {
      ...base,
      title: options?.title ?? path.basename(filePaths[0]!),
      slides,
    },
    options,
  );
}

export function loadDeckFromInputFile(filePath: string, options?: DeckStyleOptions): DeckConfig {
  const resolved = path.resolve(filePath);
  const raw = fs.readFileSync(resolved, 'utf8');
  const parsed = parseImportedPayload(raw, path.basename(resolved));

  if (parsed.deckOverride) {
    return applyStyleOptions(parsed.deckOverride, options);
  }

  const base = clonePresetDeck('async-refactor');
  return applyStyleOptions(
    {
      ...base,
      title: options?.title ?? path.basename(resolved, path.extname(resolved)),
      slides: parsed.slides,
    },
    options,
  );
}

interface CommitInfo {
  sha: string;
  shortSha: string;
  subject: string;
}

function parseCommitLog(output: string): CommitInfo[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [sha = '', shortSha = '', ...rest] = line.split('\t');
      return { sha, shortSha, subject: rest.join(' ') };
    })
    .filter((c) => c.sha.length > 0);
}

export function buildDeckFromGit(repoDir: string, options: GitDeckOptions = {}): DeckConfig {
  const limit = Math.max(2, Math.min(12, options.limit ?? 5));
  const maxLines = options.maxLines ?? 42;
  const rootDir = runGit(repoDir, ['rev-parse', '--show-toplevel']).trim();

  let targetFile = options.file;
  if (targetFile) {
    const abs = path.resolve(repoDir, targetFile);
    targetFile = path.relative(rootDir, abs).replace(/\\/g, '/');
  }

  const logArgs = ['log'];
  if (options.range) logArgs.push(options.range);
  logArgs.push(`-n`, String(limit), '--reverse', '--format=%H%x09%h%x09%s');
  if (targetFile) {
    logArgs.push('--', targetFile);
  }

  let commits = parseCommitLog(runGit(rootDir, logArgs));
  if (commits.length === 0 && options.range) {
    throw new Error(`No commits found for range "${options.range}".`);
  }
  if (commits.length === 0) {
    throw new Error('No commits found in git repository.');
  }

  // If no explicit file was requested, pick the most touched source file across these commits
  if (!targetFile) {
    const counts = new Map<string, number>();
    for (const c of commits) {
      const changed = runGit(rootDir, ['diff-tree', '--no-commit-id', '--name-only', '-r', c.sha])
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter((s) => s && !isIgnoredAsset(s));
      for (const file of changed) {
        counts.set(file, (counts.get(file) ?? 0) + 1);
      }
    }
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    if (sorted.length === 0) {
      throw new Error('No changed text files found in the selected commits.');
    }
    targetFile = sorted[0]![0];

    // If only 1 commit was selected (or file changed in 1 commit), include parent commit so we have Before -> After
    if (commits.length === 1) {
      try {
        const parentSha = runGit(rootDir, ['rev-parse', `${commits[0]!.sha}^`]).trim();
        const parentShort = parentSha.slice(0, 7);
        commits = [
          { sha: parentSha, shortSha: parentShort, subject: 'Before' },
          ...commits,
        ];
      } catch {
        // Root commit: keep single slide
      }
    }
  }

  const language = detectLanguageFromFilename(targetFile);
  const slides: Slide[] = [];

  for (let i = 0; i < commits.length; i++) {
    const commit = commits[i]!;
    let content = '';
    try {
      content = runGit(rootDir, ['show', `${commit.sha}:${targetFile}`]);
    } catch {
      continue;
    }
    slides.push({
      id: `git-${commit.shortSha}`,
      title: targetFile,
      badge: `${commit.shortSha} · ${commit.subject.slice(0, 34)}`,
      language,
      durationMs: i === commits.length - 1 ? 2200 : 1600,
      transitionMs: 850,
      code: trimLinesForSlide(content, maxLines),
    });
  }

  if (slides.length === 0) {
    throw new Error(`Could not read "${targetFile}" in selected commits.`);
  }

  const base = clonePresetDeck('async-refactor');
  return applyStyleOptions(
    {
      ...base,
      title: options.title ?? `${path.basename(targetFile)} — Git History`,
      slides,
    },
    options,
  );
}
