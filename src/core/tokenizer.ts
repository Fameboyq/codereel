import type { SupportedLanguage, Token, TokenKind, TokenizedLine } from './types.js';

const COMMON_JS_KEYWORDS = new Set([
  'async', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue',
  'debugger', 'default', 'delete', 'do', 'else', 'enum', 'export', 'extends',
  'false', 'finally', 'for', 'from', 'function', 'if', 'implements', 'import',
  'in', 'instanceof', 'interface', 'let', 'new', 'null', 'of', 'package',
  'private', 'protected', 'public', 'readonly', 'return', 'static', 'super',
  'switch', 'this', 'throw', 'true', 'try', 'type', 'typeof', 'undefined',
  'var', 'void', 'while', 'with', 'yield', 'as', 'satisfies', 'keyof',
]);

const PYTHON_KEYWORDS = new Set([
  'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break',
  'class', 'continue', 'def', 'del', 'elif', 'else', 'except', 'finally',
  'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'match',
  'case', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try', 'while',
  'with', 'yield', 'self',
]);

const RUST_KEYWORDS = new Set([
  'as', 'async', 'await', 'break', 'const', 'continue', 'crate', 'dyn', 'else',
  'enum', 'extern', 'false', 'fn', 'for', 'if', 'impl', 'in', 'let', 'loop',
  'match', 'mod', 'move', 'mut', 'pub', 'ref', 'return', 'self', 'Self',
  'static', 'struct', 'super', 'trait', 'true', 'type', 'unsafe', 'use',
  'where', 'while',
]);

const GO_KEYWORDS = new Set([
  'break', 'case', 'chan', 'const', 'continue', 'default', 'defer', 'else',
  'fallthrough', 'false', 'for', 'func', 'go', 'goto', 'if', 'import',
  'interface', 'map', 'nil', 'package', 'range', 'return', 'select', 'struct',
  'switch', 'true', 'type', 'var',
]);

const BASH_KEYWORDS = new Set([
  'if', 'then', 'else', 'elif', 'fi', 'for', 'in', 'do', 'done', 'case',
  'esac', 'while', 'function', 'export', 'local', 'return', 'exit', 'echo',
  'cd', 'npx', 'npm', 'git', 'curl', 'docker', 'pnpm', 'bun', 'node', 'python',
  'cargo', 'go', 'sudo', 'mkdir', 'rm', 'cp', 'mv', 'cat', 'grep', 'ls',
]);

const SQL_KEYWORDS = new Set([
  'SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'ON',
  'GROUP', 'BY', 'ORDER', 'HAVING', 'LIMIT', 'OFFSET', 'INSERT', 'INTO',
  'VALUES', 'UPDATE', 'SET', 'DELETE', 'CREATE', 'TABLE', 'ALTER', 'DROP',
  'INDEX', 'AS', 'AND', 'OR', 'NOT', 'NULL', 'TRUE', 'FALSE', 'DISTINCT',
  'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'WITH', 'CASE', 'WHEN', 'THEN', 'END',
  'ASC', 'DESC', 'PRIMARY', 'KEY',
]);

const BUILTIN_TYPES = new Set([
  'string', 'number', 'boolean', 'unknown', 'never', 'any', 'object', 'symbol',
  'bigint', 'Promise', 'Record', 'Partial', 'Required', 'Readonly', 'Array',
  'Map', 'Set', 'Date', 'Error', 'Response', 'Request', 'Uint8Array',
  'int', 'float', 'str', 'bool', 'list', 'dict', 'tuple', 'set', 'Optional',
  'Union', 'Any', 'Callable', 'i8', 'i16', 'i32', 'i64', 'u8', 'u16', 'u32',
  'u64', 'usize', 'isize', 'f32', 'f64', 'String', 'Vec', 'Option', 'Result',
  'Box', 'Arc', 'Rc', 'error', 'rune', 'byte', 'any', 'INT', 'TEXT', 'VARCHAR',
  'BOOLEAN', 'TIMESTAMP', 'UUID', 'JSONB',
]);

function getKeywordSet(language: SupportedLanguage): Set<string> {
  switch (language) {
    case 'python':
      return PYTHON_KEYWORDS;
    case 'rust':
      return RUST_KEYWORDS;
    case 'go':
      return GO_KEYWORDS;
    case 'bash':
      return BASH_KEYWORDS;
    case 'sql':
      return SQL_KEYWORDS;
    case 'typescript':
    case 'javascript':
      return COMMON_JS_KEYWORDS;
    default:
      return new Set();
  }
}

function isWordStart(ch: string): boolean {
  return /[A-Za-z_$]/.test(ch);
}

function isWordChar(ch: string): boolean {
  return /[A-Za-z0-9_$]/.test(ch);
}

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}

export function detectLanguageFromFilename(filename: string): SupportedLanguage {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.ts') || lower.endsWith('.tsx') || lower.endsWith('.mts')) return 'typescript';
  if (lower.endsWith('.js') || lower.endsWith('.jsx') || lower.endsWith('.mjs')) return 'javascript';
  if (lower.endsWith('.py')) return 'python';
  if (lower.endsWith('.rs')) return 'rust';
  if (lower.endsWith('.go')) return 'go';
  if (lower.endsWith('.sh') || lower.endsWith('.bash') || lower.endsWith('.zsh')) return 'bash';
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.css') || lower.endsWith('.scss')) return 'css';
  if (lower.endsWith('.html') || lower.endsWith('.xml') || lower.endsWith('.svg')) return 'html';
  if (lower.endsWith('.sql')) return 'sql';
  if (lower.endsWith('.diff') || lower.endsWith('.patch')) return 'diff';
  return 'plaintext';
}

export function tokenizeCode(code: string, language: SupportedLanguage): TokenizedLine[] {
  const normalized = code.replace(/\r\n/g, '\n');
  const rawLines = normalized.split('\n');
  const keywords = getKeywordSet(language);
  const usesHashComment = language === 'python' || language === 'bash';
  const usesSlashComment =
    language === 'typescript' ||
    language === 'javascript' ||
    language === 'rust' ||
    language === 'go' ||
    language === 'css';
  const usesDashComment = language === 'sql';

  let inBlockComment = false;
  let blockEndMarker = '*/';

  return rawLines.map((raw, lineIdx) => {
    const tokens: Token[] = [];
    let i = 0;
    const len = raw.length;

    if (language === 'diff') {
      if (raw.startsWith('+++') || raw.startsWith('---') || raw.startsWith('diff ')) {
        tokens.push({ text: raw, kind: 'comment', col: 0 });
        return { lineNumber: lineIdx + 1, tokens, raw };
      }
      if (raw.startsWith('@@')) {
        tokens.push({ text: raw, kind: 'keyword', col: 0 });
        return { lineNumber: lineIdx + 1, tokens, raw };
      }
      if (raw.startsWith('+')) {
        tokens.push({ text: raw, kind: 'added', col: 0 });
        return { lineNumber: lineIdx + 1, tokens, raw };
      }
      if (raw.startsWith('-')) {
        tokens.push({ text: raw, kind: 'removed', col: 0 });
        return { lineNumber: lineIdx + 1, tokens, raw };
      }
    }

    if (language === 'bash' && !inBlockComment) {
      const promptMatch = raw.match(/^(\s*(?:[\w.-]+@[\w.-]+:[^\s$#]*\s*[$#>]|[$>])\s+)/);
      if (promptMatch && promptMatch[1]) {
        const promptText = promptMatch[1].trimEnd();
        const startCol = raw.indexOf(promptText);
        tokens.push({ text: promptText, kind: 'prompt', col: startCol });
        i = promptMatch[1].length;
      }
    }

    while (i < len) {
      const ch = raw[i]!;

      if (inBlockComment) {
        const closeIdx = raw.indexOf(blockEndMarker, i);
        if (closeIdx === -1) {
          const slice = raw.slice(i);
          if (slice.trim().length > 0) {
            tokens.push({ text: slice, kind: 'comment', col: i });
          }
          i = len;
        } else {
          const end = closeIdx + blockEndMarker.length;
          tokens.push({ text: raw.slice(i, end), kind: 'comment', col: i });
          inBlockComment = false;
          i = end;
        }
        continue;
      }

      if (ch === ' ' || ch === '\t') {
        i++;
        continue;
      }

      if (usesSlashComment && ch === '/' && raw[i + 1] === '/') {
        tokens.push({ text: raw.slice(i), kind: 'comment', col: i });
        break;
      }

      if (usesSlashComment && ch === '/' && raw[i + 1] === '*') {
        inBlockComment = true;
        blockEndMarker = '*/';
        const closeIdx = raw.indexOf('*/', i + 2);
        if (closeIdx === -1) {
          tokens.push({ text: raw.slice(i), kind: 'comment', col: i });
          break;
        } else {
          const end = closeIdx + 2;
          tokens.push({ text: raw.slice(i, end), kind: 'comment', col: i });
          inBlockComment = false;
          i = end;
          continue;
        }
      }

      if (language === 'html' && raw.startsWith('<!--', i)) {
        inBlockComment = true;
        blockEndMarker = '-->';
        const closeIdx = raw.indexOf('-->', i + 4);
        if (closeIdx === -1) {
          tokens.push({ text: raw.slice(i), kind: 'comment', col: i });
          break;
        } else {
          const end = closeIdx + 3;
          tokens.push({ text: raw.slice(i, end), kind: 'comment', col: i });
          inBlockComment = false;
          i = end;
          continue;
        }
      }

      if (usesHashComment && ch === '#') {
        tokens.push({ text: raw.slice(i), kind: 'comment', col: i });
        break;
      }

      if (usesDashComment && ch === '-' && raw[i + 1] === '-') {
        tokens.push({ text: raw.slice(i), kind: 'comment', col: i });
        break;
      }

      if (ch === '"' || ch === "'" || ch === '`') {
        const quote = ch;
        let j = i + 1;
        while (j < len) {
          if (raw[j] === '\\') {
            j += 2;
            continue;
          }
          if (raw[j] === quote) {
            j++;
            break;
          }
          j++;
        }
        const text = raw.slice(i, j);
        // Check if JSON object key: "key":
        let kind: TokenKind = 'string';
        if (language === 'json') {
          const after = raw.slice(j).trimStart();
          if (after.startsWith(':')) kind = 'property';
        }
        tokens.push({ text, kind, col: i });
        i = j;
        continue;
      }

      if (language === 'bash' && ch === '-' && i + 1 < len && /[A-Za-z-]/.test(raw[i + 1]!)) {
        let j = i + 1;
        while (j < len && /[A-Za-z0-9_-]/.test(raw[j]!)) j++;
        tokens.push({ text: raw.slice(i, j), kind: 'property', col: i });
        i = j;
        continue;
      }

      if (isDigit(ch) || (ch === '.' && i + 1 < len && isDigit(raw[i + 1]!))) {
        let j = i + 1;
        while (j < len && /[0-9a-fA-FxXbBoO._]/.test(raw[j]!)) j++;
        tokens.push({ text: raw.slice(i, j), kind: 'number', col: i });
        i = j;
        continue;
      }

      if (language === 'html' && ch === '<') {
        const tagMatch = raw.slice(i).match(/^<\/?[A-Za-z][A-Za-z0-9-]*/);
        if (tagMatch) {
          const text = tagMatch[0];
          tokens.push({ text, kind: 'keyword', col: i });
          i += text.length;
          continue;
        }
      }

      if (isWordStart(ch)) {
        let j = i + 1;
        while (j < len && isWordChar(raw[j]!)) j++;
        const word = raw.slice(i, j);
        const prevToken = tokens[tokens.length - 1];
        const nextSlice = raw.slice(j).trimStart();
        let kind: TokenKind = 'plain';

        if (language === 'json' && (word === 'true' || word === 'false' || word === 'null')) {
          kind = 'keyword';
        } else if (language === 'sql' && keywords.has(word.toUpperCase())) {
          kind = 'keyword';
        } else if (keywords.has(word)) {
          kind = 'keyword';
        } else if (BUILTIN_TYPES.has(word)) {
          kind = 'type';
        } else if (nextSlice.startsWith('(')) {
          kind = 'function';
        } else if (prevToken && prevToken.text === '.' && nextSlice.startsWith(':')) {
          kind = 'property';
        } else if (nextSlice.startsWith(':') && prevToken?.text !== '?') {
          kind = 'property';
        } else if (/^[A-Z][A-Za-z0-9_]*$/.test(word) && word.length > 1 && word !== word.toUpperCase()) {
          kind = 'type';
        } else if (/^[A-Z0-9_]{2,}$/.test(word)) {
          kind = 'number';
        }

        tokens.push({ text: word, kind, col: i });
        i = j;
        continue;
      }

      // Multi-char operators
      const twoChar = raw.slice(i, i + 2);
      const threeChar = raw.slice(i, i + 3);
      if (threeChar === '===' || threeChar === '!==' || threeChar === '...' || threeChar === '>>=') {
        tokens.push({ text: threeChar, kind: 'operator', col: i });
        i += 3;
        continue;
      }
      if (
        twoChar === '=>' ||
        twoChar === '->' ||
        twoChar === '::' ||
        twoChar === '==' ||
        twoChar === '!=' ||
        twoChar === '<=' ||
        twoChar === '>=' ||
        twoChar === '&&' ||
        twoChar === '||' ||
        twoChar === '??' ||
        twoChar === '?.' ||
        twoChar === '+=' ||
        twoChar === '-='
      ) {
        tokens.push({ text: twoChar, kind: 'operator', col: i });
        i += 2;
        continue;
      }

      if ('=+-*/%<>!&|^~?:'.includes(ch)) {
        tokens.push({ text: ch, kind: 'operator', col: i });
        i++;
        continue;
      }

      if ('()[]{}.,;@'.includes(ch)) {
        tokens.push({ text: ch, kind: 'punctuation', col: i });
        i++;
        continue;
      }

      tokens.push({ text: ch, kind: 'plain', col: i });
      i++;
    }

    return { lineNumber: lineIdx + 1, tokens, raw };
  });
}
