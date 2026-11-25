#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { buildStandaloneHtml } from '../core/html-export.js';
import { BACKGROUNDS, THEMES } from '../core/themes.js';
import type { AspectRatio, DeckConfig } from '../core/types.js';
import {
  buildDeckFromFiles,
  buildDeckFromGit,
  loadDeckFromInputFile,
  type DeckStyleOptions,
} from './git-source.js';
import { startStudioServer } from './server.js';

interface ParsedArgs {
  command: string;
  positionals: string[];
  flags: Map<string, string | boolean>;
}

function parseCliArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags = new Map<string, string | boolean>();

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      if (eq !== -1) {
        flags.set(arg.slice(2, eq), arg.slice(eq + 1));
      } else {
        const key = arg.slice(2);
        const next = argv[i + 1];
        if (next && !next.startsWith('-')) {
          flags.set(key, next);
          i++;
        } else {
          flags.set(key, true);
        }
      }
    } else if (arg.startsWith('-') && arg.length === 2) {
      const short = arg.slice(1);
      const next = argv[i + 1];
      if (next && !next.startsWith('-')) {
        flags.set(short, next);
        i++;
      } else {
        flags.set(short, true);
      }
    } else {
      positionals.push(arg);
    }
  }

  const command = positionals[0] ?? 'studio';
  return { command, positionals: positionals.slice(1), flags };
}

function getStringFlag(flags: Map<string, string | boolean>, ...names: string[]): string | undefined {
  for (const name of names) {
    const v = flags.get(name);
    if (typeof v === 'string') return v;
  }
  return undefined;
}

function hasBoolFlag(flags: Map<string, string | boolean>, ...names: string[]): boolean {
  return names.some((n) => flags.get(n) === true);
}

function extractStyleOptions(flags: Map<string, string | boolean>): DeckStyleOptions {
  return {
    title: getStringFlag(flags, 'title'),
    themeId: getStringFlag(flags, 'theme'),
    backgroundId: getStringFlag(flags, 'bg', 'background'),
    aspectRatio: getStringFlag(flags, 'ratio', 'aspect') as AspectRatio | undefined,
    watermark: getStringFlag(flags, 'watermark'),
  };
}

function printHelp(): void {
  console.log(`
CodeReel — Magic-Move animations for code, diffs & git commits

Usage:
  npx codereel [studio] [options]
  npx codereel from-git [range] [options]
  npx codereel from-files <file1> <file2> [...] [options]
  npx codereel export <deck.json|slides.md|patch.diff> [-o out.html]
  npx codereel themes

Commands:
  studio            Start the local Web Studio (default)
  from-git          Generate a reel from local git commit history
  from-files        Generate a reel from sequential files
  export            Compile JSON / Markdown / Diff into standalone HTML player
  themes            List available syntax themes and background presets

Options:
  --file <path>     Track a specific file in git history (from-git)
  --limit <n>       Max commits to include (default: 5)
  --repo <dir>      Target git repository directory (default: cwd)
  -o, --out <file>  Output HTML file path (default: codereel.html)
  --studio          Open generated deck directly in Web Studio instead of writing HTML
  --theme <id>      Theme ID (e.g. tokyo-night, catppuccin-mocha, dracula)
  --bg <id>         Background ID (e.g. nebula, sunset, emerald, obsidian)
  --ratio <ratio>   Aspect ratio (16:9, 1:1, 9:16, 4:3, auto)
  --port <n>        Local server port (default: 4321)
  --no-open         Do not automatically open browser
  -h, --help        Show this help
`);
}

async function launchStudio(port: number, deck: DeckConfig | null, open: boolean): Promise<void> {
  const { url } = await startStudioServer({ port, deck, open });
  console.log(`CodeReel Studio running at ${url}`);
  console.log('Press Ctrl+C to stop.');
}

async function main(): Promise<void> {
  const { command, positionals, flags } = parseCliArgs(process.argv.slice(2));

  if (hasBoolFlag(flags, 'h', 'help') || command === 'help') {
    printHelp();
    return;
  }

  if (hasBoolFlag(flags, 'v', 'version') || command === 'version') {
    console.log('codereel 1.0.0');
    return;
  }

  if (command === 'themes') {
    console.log('Themes:', THEMES.map((t) => t.id).join(', '));
    console.log('Backgrounds:', BACKGROUNDS.map((b) => b.id).join(', '));
    return;
  }

  const port = Number(getStringFlag(flags, 'port', 'p') ?? '4321');
  const shouldOpen = !hasBoolFlag(flags, 'no-open');
  const styleOpts = extractStyleOptions(flags);

  if (command === 'studio') {
    const deckPath = getStringFlag(flags, 'deck');
    const preloaded = deckPath ? loadDeckFromInputFile(deckPath, styleOpts) : null;
    await launchStudio(port, preloaded, shouldOpen);
    return;
  }

  if (command === 'from-git') {
    const repoDir = path.resolve(getStringFlag(flags, 'repo') ?? process.cwd());
    const limitRaw = getStringFlag(flags, 'limit', 'n');
    const deck = buildDeckFromGit(repoDir, {
      ...styleOpts,
      range: positionals[0],
      file: getStringFlag(flags, 'file', 'f'),
      limit: limitRaw ? Number(limitRaw) : 5,
    });

    if (hasBoolFlag(flags, 'studio')) {
      await launchStudio(port, deck, shouldOpen);
      return;
    }

    const outPath = path.resolve(getStringFlag(flags, 'o', 'out') ?? 'codereel.html');
    fs.writeFileSync(outPath, buildStandaloneHtml(deck), 'utf8');
    console.log(`Generated ${outPath} (${deck.slides.length} commits from git)`);
    return;
  }

  if (command === 'from-files') {
    if (positionals.length === 0) {
      throw new Error('Provide one or more files: codereel from-files a.ts b.ts');
    }
    const deck = buildDeckFromFiles(positionals, styleOpts);

    if (hasBoolFlag(flags, 'studio')) {
      await launchStudio(port, deck, shouldOpen);
      return;
    }

    const outPath = path.resolve(getStringFlag(flags, 'o', 'out') ?? 'codereel.html');
    fs.writeFileSync(outPath, buildStandaloneHtml(deck), 'utf8');
    console.log(`Generated ${outPath} (${deck.slides.length} slides)`);
    return;
  }

  if (command === 'export') {
    const input = positionals[0];
    if (!input) {
      throw new Error('Provide an input file: codereel export deck.json -o out.html');
    }
    const deck = loadDeckFromInputFile(input, styleOpts);
    const outPath = path.resolve(getStringFlag(flags, 'o', 'out') ?? 'codereel.html');
    fs.writeFileSync(outPath, buildStandaloneHtml(deck), 'utf8');
    console.log(`Exported ${outPath} (${deck.slides.length} slides)`);
    return;
  }

  throw new Error(`Unknown command "${command}". Run "codereel --help" for usage.`);
}

main().catch((err: unknown) => {
  console.error(`Error: ${(err as Error).message}`);
  process.exitCode = 1;
});
