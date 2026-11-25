import { describe, expect, it } from 'vitest';
import { detectLanguageFromFilename, tokenizeCode } from '../src/core/tokenizer.js';

describe('tokenizer', () => {
  it('detects languages from file extensions', () => {
    expect(detectLanguageFromFilename('src/api.ts')).toBe('typescript');
    expect(detectLanguageFromFilename('component.tsx')).toBe('typescript');
    expect(detectLanguageFromFilename('script.py')).toBe('python');
    expect(detectLanguageFromFilename('main.rs')).toBe('rust');
    expect(detectLanguageFromFilename('server.go')).toBe('go');
    expect(detectLanguageFromFilename('deploy.sh')).toBe('bash');
    expect(detectLanguageFromFilename('query.sql')).toBe('sql');
    expect(detectLanguageFromFilename('unknown.xyz')).toBe('plaintext');
  });

  it('tokenizes TypeScript keywords, types, functions, strings, and comments', () => {
    const code = [
      '/* multi-line',
      '   comment */',
      'async function getUser(id: string): Promise<User> {',
      '  const url = "https://api.example.com"; // inline',
      '  return fetchJson(url);',
      '}',
    ].join('\n');

    const lines = tokenizeCode(code, 'typescript');
    expect(lines).toHaveLength(6);
    expect(lines[0]!.tokens[0]!.kind).toBe('comment');
    expect(lines[1]!.tokens[0]!.kind).toBe('comment');

    const fnLine = lines[2]!.tokens;
    expect(fnLine.find((t) => t.text === 'async')?.kind).toBe('keyword');
    expect(fnLine.find((t) => t.text === 'function')?.kind).toBe('keyword');
    expect(fnLine.find((t) => t.text === 'getUser')?.kind).toBe('function');
    expect(fnLine.find((t) => t.text === 'string')?.kind).toBe('type');
    expect(fnLine.find((t) => t.text === 'Promise')?.kind).toBe('type');

    const strLine = lines[3]!.tokens;
    expect(strLine.find((t) => t.text === '"https://api.example.com"')?.kind).toBe('string');
    expect(strLine.find((t) => t.text === '// inline')?.kind).toBe('comment');
  });

  it('tokenizes Bash prompts, commands, flags, and comments', () => {
    const code = '$ npx codereel from-git --limit 5\n# done';
    const lines = tokenizeCode(code, 'bash');
    expect(lines[0]!.tokens[0]).toMatchObject({ text: '$', kind: 'prompt', col: 0 });
    expect(lines[0]!.tokens.find((t) => t.text === 'npx')?.kind).toBe('keyword');
    expect(lines[0]!.tokens.find((t) => t.text === '--limit')?.kind).toBe('property');
    expect(lines[0]!.tokens.find((t) => t.text === '5')?.kind).toBe('number');
    expect(lines[1]!.tokens[0]!.kind).toBe('comment');
  });

  it('distinguishes JSON object property keys from string values', () => {
    const lines = tokenizeCode('{"name": "codereel", "stars": 9001, "ok": true}', 'json');
    const tokens = lines[0]!.tokens;
    expect(tokens.find((t) => t.text === '"name"')?.kind).toBe('property');
    expect(tokens.find((t) => t.text === '"codereel"')?.kind).toBe('string');
    expect(tokens.find((t) => t.text === '9001')?.kind).toBe('number');
    expect(tokens.find((t) => t.text === 'true')?.kind).toBe('keyword');
  });

  it('handles SQL case-insensitive keywords and unified diffs', () => {
    const sqlLines = tokenizeCode('select id, count(*) from users where active = true;', 'sql');
    expect(sqlLines[0]!.tokens.find((t) => t.text === 'select')?.kind).toBe('keyword');
    expect(sqlLines[0]!.tokens.find((t) => t.text === 'from')?.kind).toBe('keyword');

    const diffLines = tokenizeCode('@@ -1,2 +1,2 @@\n-old()\n+new()', 'diff');
    expect(diffLines[0]!.tokens[0]!.kind).toBe('keyword');
    expect(diffLines[1]!.tokens[0]!.kind).toBe('removed');
    expect(diffLines[2]!.tokens[0]!.kind).toBe('added');
  });
});
