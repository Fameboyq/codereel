import { parseImportedPayload } from '../core/importers.js';
import type { DeckConfig, Slide } from '../core/types.js';

export { parseImportedPayload as parseImportedTextToSlides };

function utf8ToBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToUtf8(b64url: string): string {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const binary = atob(b64 + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

export function encodeDeckToUrlHash(deck: DeckConfig): string {
  const json = JSON.stringify(deck);
  return `#deck=${utf8ToBase64Url(json)}`;
}

export function decodeDeckFromUrlHash(hash: string): DeckConfig | null {
  if (!hash.startsWith('#deck=')) return null;
  try {
    const raw = hash.slice('#deck='.length);
    const parsed = JSON.parse(base64UrlToUtf8(raw)) as DeckConfig;
    if (!parsed || !Array.isArray(parsed.slides) || parsed.slides.length === 0) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

interface GithubCommitFile {
  filename: string;
  patch?: string;
}

interface GithubCommitResponse {
  sha: string;
  commit: { message: string };
  files?: GithubCommitFile[];
}

export async function fetchGithubCommitSlides(commitUrl: string): Promise<Slide[]> {
  const m = commitUrl.trim().match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/commit\/([0-9a-fA-F]+)/);
  if (!m) {
    throw new Error('Expected URL like https://github.com/owner/repo/commit/<sha>');
  }
  const [, owner, repo, sha] = m;
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/commits/${sha}`;
  const resp = await fetch(apiUrl, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!resp.ok) {
    throw new Error(`GitHub API error (${resp.status}): ${resp.statusText}`);
  }
  const data = (await resp.json()) as GithubCommitResponse;
  const targetFile = data.files?.find((f) => Boolean(f.patch)) ?? data.files?.[0];
  if (!targetFile?.patch) {
    throw new Error('No text diff patch found in this commit.');
  }

  const parsed = parseImportedPayload(
    `--- a/${targetFile.filename}\n+++ b/${targetFile.filename}\n${targetFile.patch}`,
    targetFile.filename,
  );
  const shortSha = data.sha.slice(0, 7);
  const subject = data.commit.message.split('\n')[0] ?? 'Commit';
  if (parsed.slides[0]) parsed.slides[0].badge = `${shortSha} · Before`;
  if (parsed.slides[1]) parsed.slides[1].badge = `${shortSha} · ${subject.slice(0, 32)}`;
  return parsed.slides;
}
