import type { DeckConfig } from './types.js';

export const PRESET_DECKS: Record<string, DeckConfig> = {
  'async-refactor': {
    title: 'Callback Hell -> Async Pipeline',
    themeId: 'tokyo-night',
    backgroundId: 'nebula',
    fontFamily: '"JetBrains Mono", "Fira Code", ui-monospace, monospace',
    fontSize: 18,
    lineHeight: 1.58,
    padding: 56,
    windowStyle: 'macos',
    showLineNumbers: true,
    showDiffGlow: true,
    showBadge: true,
    aspectRatio: '16:9',
    easing: 'easeInOutCubic',
    watermark: '',
    slides: [
      {
        id: 'step-1',
        title: 'src/profile.ts',
        badge: 'Step 1 · Nested callbacks',
        language: 'typescript',
        durationMs: 1600,
        transitionMs: 850,
        code: `function loadProfile(userId: string, done: Callback) {
  fetchUser(userId, (err, user) => {
    if (err) return done(err);
    fetchPosts(user.id, (postErr, posts) => {
      if (postErr) return done(postErr);
      done(null, { user, posts });
    });
  });
}`,
      },
      {
        id: 'step-2',
        title: 'src/profile.ts',
        badge: 'Step 2 · Async/Await',
        language: 'typescript',
        durationMs: 1600,
        transitionMs: 850,
        highlightLines: [2, 3],
        code: `async function loadProfile(userId: string): Promise<Profile> {
  const user = await fetchUser(userId);
  const posts = await fetchPosts(user.id);
  return { user, posts };
}`,
      },
      {
        id: 'step-3',
        title: 'src/profile.ts',
        badge: 'Step 3 · Parallel Promise.all',
        language: 'typescript',
        durationMs: 2200,
        transitionMs: 850,
        highlightLines: [2, 3, 4, 5],
        code: `async function loadProfile(userId: string): Promise<Profile> {
  const [user, posts] = await Promise.all([
    fetchUser(userId),
    fetchPosts(userId),
  ]);
  return { user, posts };
}`,
      },
    ],
  },
  'cli-launch': {
    title: 'Zero to Deployed in 3 Commands',
    themeId: 'catppuccin-mocha',
    backgroundId: 'emerald',
    fontFamily: '"JetBrains Mono", "Fira Code", ui-monospace, monospace',
    fontSize: 19,
    lineHeight: 1.65,
    padding: 56,
    windowStyle: 'terminal',
    showLineNumbers: false,
    showDiffGlow: false,
    showBadge: true,
    aspectRatio: '16:9',
    easing: 'easeInOutCubic',
    watermark: 'npx codereel',
    slides: [
      {
        id: 'term-1',
        title: 'zsh — ~/my-app',
        badge: '1 · Turn git history into reel',
        language: 'bash',
        durationMs: 2300,
        transitionMs: 700,
        typingMode: true,
        code: `$ npx codereel from-git HEAD~4..HEAD --file src/api.ts
# Scanning 4 commits on main...
# Generated reel.html (4 slides, 11.4 KB)`,
      },
      {
        id: 'term-2',
        title: 'zsh — ~/my-app',
        badge: '2 · Open Studio UI',
        language: 'bash',
        durationMs: 2200,
        transitionMs: 700,
        typingMode: true,
        code: `$ npx codereel studio --port 4321
# Studio running at http://localhost:4321
# Zero backend · Export GIF / WebM / HTML`,
      },
    ],
  },
  'rust-safety': {
    title: 'Python Script -> Zero-Copy Rust',
    themeId: 'dracula',
    backgroundId: 'sunset',
    fontFamily: '"JetBrains Mono", "Fira Code", ui-monospace, monospace',
    fontSize: 18,
    lineHeight: 1.58,
    padding: 56,
    windowStyle: 'macos',
    showLineNumbers: true,
    showDiffGlow: true,
    showBadge: true,
    aspectRatio: '16:9',
    easing: 'spring',
    slides: [
      {
        id: 'rs-1',
        title: 'parser.rs',
        badge: 'Naive allocation',
        language: 'rust',
        durationMs: 1700,
        transitionMs: 900,
        code: `fn extract_hosts(lines: Vec<String>) -> Vec<String> {
    let mut hosts = Vec::new();
    for line in lines {
        if let Some(host) = line.split(':').next() {
            hosts.push(host.to_string());
        }
    }
    hosts
}`,
      },
      {
        id: 'rs-2',
        title: 'parser.rs',
        badge: 'Zero-copy iterator',
        language: 'rust',
        durationMs: 2200,
        transitionMs: 900,
        highlightLines: [1, 2, 3],
        code: `fn extract_hosts<'a>(lines: &'a [&'a str]) -> impl Iterator<Item = &'a str> + 'a {
    lines.iter().filter_map(|line| {
        line.split(':').next()
    })
}`,
      },
    ],
  },
};

export function clonePresetDeck(key: string): DeckConfig {
  const preset = PRESET_DECKS[key] ?? PRESET_DECKS['async-refactor']!;
  return JSON.parse(JSON.stringify(preset)) as DeckConfig;
}
