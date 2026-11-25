# CodeReel

[![CI](https://github.com/Fameboyq/codereel/actions/workflows/ci.yml/badge.svg)](https://github.com/Fameboyq/codereel/actions/workflows/ci.yml)
[![Deploy Studio](https://github.com/Fameboyq/codereel/actions/workflows/pages.yml/badge.svg)](https://github.com/Fameboyq/codereel/actions/workflows/pages.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Keynote Magic-Move animations for your code, diffs, and git commits — right in the browser and via `npx codereel`.**

**Live Studio (GitHub Pages):** https://fameboyq.github.io/codereel/

Zero backend. Zero external binaries (`ffmpeg` not required). Works standalone on GitHub Pages or directly on local repositories with a single CLI command.

---

## Why CodeReel?

Static code screenshot tools like Carbon and Ray.so stop at single images. Explaining a refactor, PR diff, or git commit history works better when unchanged tokens physically glide into their new positions while old code fades out and new code animates in.

CodeReel runs a **two-pass line + token LCS Magic-Move engine** shared between a client-side Web Studio and a Node.js CLI:

- **True Token-Level Magic Move** — aligns lines by trimmed LCS + token similarity, then matches tokens inside lines and across moved blocks so identifiers glide smoothly instead of flashing.
- **Zero-Backend GIF, WebM, PNG & HTML Export** — includes a pure TypeScript animated `GIF89a` encoder (median-cut 256-color palette + LZW compression), 60 FPS `MediaRecorder` WebM recording, PNG snapshots, and self-contained interactive HTML players.
- **Turn Local Git History Into Reels (`npx codereel from-git`)** — extract commit snapshots directly from your repository (`HEAD~4..HEAD` or a file's history) into an interactive HTML reel or open them straight in the Studio UI.
- **Zero-Setup Web Imports** — paste any `git diff`, Markdown fenced code blocks, Deck JSON, or a public GitHub commit URL (`https://github.com/owner/repo/commit/<sha>`), or share an entire deck via the URL `#deck=...` hash.
- **Terminal Keystroke Typing Mode** — animate shell commands with cursor blink and realistic typing cadence.
- **Curated Themes & Ratios** — Tokyo Night, Catppuccin Mocha, Dracula, GitHub Dark, Nord, One Light; `16:9`, `1:1`, `9:16` (Shorts/Reels), `4:3`, and `Auto`.

---

## Quick Start

### 1. Run Locally via CLI (`npx`)

```bash
# Build once (or publish to npm to run anywhere with npx codereel)
npm install
npm run build

# Launch the interactive Web Studio locally
npx codereel studio

# Turn the last 5 commits touching src/index.ts into a standalone HTML player
npx codereel from-git --file src/index.ts --limit 5 -o history.html

# Open local git commits directly in the Studio UI to export GIF / WebM
npx codereel from-git HEAD~4..HEAD --studio

# Turn sequential local files into a Magic-Move animation
npx codereel from-files v1.ts v2.ts v3.ts -o refactor.html

# Compile a Markdown storyboard or Deck JSON to standalone HTML
npx codereel export examples/async-refactor.md -o refactor.html
```

### 2. Deploy as a Zero-Backend GitHub Pages App

This repository ships with `.github/workflows/pages.yml`. Enable **Settings -> Pages -> Source: GitHub Actions** and push to `main` — Vite builds `dist/web/` automatically with zero backend required.

---

## CLI Reference

```text
Usage:
  npx codereel [studio] [options]
  npx codereel from-git [range] [options]
  npx codereel from-files <file1> <file2> [...] [options]
  npx codereel export <deck.json|slides.md|patch.diff> [-o out.html]
  npx codereel themes
```

| Flag | Description |
| :--- | :--- |
| `--file <path>` | Track a specific file in git history (`from-git`) |
| `--limit <n>` | Max commits to include (default: `5`) |
| `--repo <dir>` | Target git repository directory (default: cwd) |
| `-o, --out <file>` | Output HTML file path (default: `codereel.html`) |
| `--studio` | Launch Web Studio preloaded with the generated deck |
| `--theme <id>` | `tokyo-night`, `catppuccin-mocha`, `dracula`, `github-dark`, `nord`, `one-light` |
| `--bg <id>` | `nebula`, `sunset`, `emerald`, `obsidian`, `crimson`, `arctic`, `transparent` |
| `--ratio <ratio>` | `16:9`, `1:1`, `9:16`, `4:3`, `auto` |
| `--port <n>` | Local studio HTTP port (default: `4321`) |
| `--no-open` | Do not auto-open the system browser |

---

## Architecture

```text
src/
├── core/
│   ├── types.ts        # Deck, Slide, Theme, and CompiledTimeline contracts
│   ├── themes.ts       # 6 syntax themes + 7 studio backdrop gradients
│   ├── tokenizer.ts    # Zero-dep tokenizer (TS/JS, Python, Rust, Go, Bash, SQL, Diff, JSON, HTML, CSS)
│   ├── diff.ts         # 2-pass Line + Token LCS Magic-Move matching engine
│   ├── layout.ts       # Timeline compiler, easing curves, and HTML5 Canvas2D renderer
│   ├── gif.ts          # Pure TypeScript animated GIF89a encoder (median-cut + LZW)
│   ├── importers.ts    # Markdown fenced blocks, unified git diff, and JSON parser
│   ├── html-export.ts  # Self-contained Canvas HTML player generator
│   └── presets.ts      # Built-in demo storyboards
├── web/
│   ├── index.html      # Studio SPA shell
│   ├── styles.css      # Dark studio layout
│   ├── url-state.ts    # Base64URL `#deck=` state sharing + GitHub commit fetcher
│   └── main.ts         # Interactive storyboard editor, GIF/WebM/PNG/HTML exporters
└── cli/
    ├── git-source.ts   # Safe git log/show commit extractor and file loader
    ├── server.ts       # Zero-dep local HTTP static server + `/api/deck`
    └── index.ts        # `codereel` CLI entrypoint
```

---

## Development

```bash
npm run dev        # Start Vite dev server for Web Studio
npm run typecheck  # Strict TypeScript check (web + core + cli)
npm test           # Run Vitest unit & integration suite
npm run build      # Build Web Studio (dist/web) and CLI (dist/cli)
```

---

## License

MIT
