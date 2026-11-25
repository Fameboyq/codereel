import type {
  MorphEndpoint,
  MorphToken,
  ThemePalette,
  Token,
  TokenizedLine,
} from './types.js';

export interface LineDiffMatch {
  pairs: Array<{ fromLine: number; toLine: number }>;
  removedLines: number[];
  addedLines: number[];
}

export interface MagicMoveDiffResult {
  tokens: MorphToken[];
  removedLines: number[];
  addedLines: number[];
}

function lcsPairs<T>(
  a: T[],
  b: T[],
  equals: (x: T, y: T) => boolean,
): Array<{ aIndex: number; bIndex: number }> {
  const m = a.length;
  const n = b.length;
  if (m === 0 || n === 0) return [];

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    const row = dp[i]!;
    const nextRow = dp[i + 1]!;
    for (let j = n - 1; j >= 0; j--) {
      if (equals(a[i]!, b[j]!)) {
        row[j] = 1 + nextRow[j + 1]!;
      } else {
        row[j] = Math.max(nextRow[j]!, row[j + 1]!);
      }
    }
  }

  const result: Array<{ aIndex: number; bIndex: number }> = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (equals(a[i]!, b[j]!)) {
      result.push({ aIndex: i, bIndex: j });
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      i++;
    } else {
      j++;
    }
  }
  return result;
}

function lineTokenSimilarity(a: TokenizedLine, b: TokenizedLine): number {
  if (a.tokens.length === 0 && b.tokens.length === 0) return 0;
  const aTexts = a.tokens.map((t) => t.text);
  const bTexts = b.tokens.map((t) => t.text);
  const matches = lcsPairs(aTexts, bTexts, (x, y) => x === y).length;
  return (2 * matches) / (aTexts.length + bTexts.length);
}

/**
 * Aligns lines between two slides using exact trimmed LCS anchors first,
 * then fuzzy token similarity inside unmatched gaps so modified lines stay paired.
 */
export function alignLines(fromLines: TokenizedLine[], toLines: TokenizedLine[]): LineDiffMatch {
  const fromNorm = fromLines.map((l) => l.raw.trim());
  const toNorm = toLines.map((l) => l.raw.trim());

  const exactAnchors = lcsPairs(
    fromNorm,
    toNorm,
    (x, y) => x.length > 0 && x === y,
  );

  const sentinelAnchors = [
    { aIndex: -1, bIndex: -1 },
    ...exactAnchors,
    { aIndex: fromLines.length, bIndex: toLines.length },
  ];

  const pairs: Array<{ fromLine: number; toLine: number }> = [];
  const matchedFrom = new Set<number>();
  const matchedTo = new Set<number>();

  for (let s = 0; s < sentinelAnchors.length - 1; s++) {
    const start = sentinelAnchors[s]!;
    const end = sentinelAnchors[s + 1]!;

    if (start.aIndex >= 0) {
      pairs.push({ fromLine: start.aIndex, toLine: start.bIndex });
      matchedFrom.add(start.aIndex);
      matchedTo.add(start.bIndex);
    }

    const gapFrom: number[] = [];
    for (let i = start.aIndex + 1; i < end.aIndex; i++) gapFrom.push(i);
    const gapTo: number[] = [];
    for (let j = start.bIndex + 1; j < end.bIndex; j++) gapTo.push(j);

    // Greedily pair highest-similarity modified lines inside the gap
    const candidates: Array<{ fromIdx: number; toIdx: number; score: number }> = [];
    for (const fi of gapFrom) {
      for (const ti of gapTo) {
        const score = lineTokenSimilarity(fromLines[fi]!, toLines[ti]!);
        if (score >= 0.34) {
          candidates.push({ fromIdx: fi, toIdx: ti, score });
        }
      }
    }
    candidates.sort((x, y) => y.score - x.score);

    const usedA = new Set<number>();
    const usedB = new Set<number>();
    const gapPairs: Array<{ fromLine: number; toLine: number }> = [];

    for (const cand of candidates) {
      if (usedA.has(cand.fromIdx) || usedB.has(cand.toIdx)) continue;
      // Preserve relative order inside gap
      const crossesOrder = gapPairs.some(
        (p) =>
          (cand.fromIdx < p.fromLine && cand.toIdx > p.toLine) ||
          (cand.fromIdx > p.fromLine && cand.toIdx < p.toLine),
      );
      if (crossesOrder) continue;
      usedA.add(cand.fromIdx);
      usedB.add(cand.toIdx);
      gapPairs.push({ fromLine: cand.fromIdx, toLine: cand.toIdx });
      matchedFrom.add(cand.fromIdx);
      matchedTo.add(cand.toIdx);
    }

    gapPairs.sort((x, y) => x.fromLine - y.fromLine);
    pairs.push(...gapPairs);
  }

  const removedLines: number[] = [];
  for (let i = 0; i < fromLines.length; i++) {
    if (!matchedFrom.has(i) && fromLines[i]!.tokens.length > 0) {
      removedLines.push(i);
    }
  }

  const addedLines: number[] = [];
  for (let j = 0; j < toLines.length; j++) {
    if (!matchedTo.has(j) && toLines[j]!.tokens.length > 0) {
      addedLines.push(j);
    }
  }

  return { pairs, removedLines, addedLines };
}

function makeEndpoint(
  lineIndex: number,
  token: Token,
  theme: ThemePalette,
  highlighted: boolean,
): MorphEndpoint {
  return {
    lineIndex,
    col: token.col,
    text: token.text,
    kind: token.kind,
    color: theme.tokens[token.kind],
    highlighted,
  };
}

function isSubstantiveToken(token: Token): boolean {
  if (token.kind === 'punctuation') return false;
  return token.text.length >= 2;
}

/**
 * Computes Magic Move token matches between two tokenized slides:
 * 1) Pairs tokens inside aligned lines using token LCS.
 * 2) Cross-matches moved substantive identifiers/strings across relocated lines.
 */
export function computeMagicMoveDiff(
  fromLines: TokenizedLine[],
  toLines: TokenizedLine[],
  theme: ThemePalette,
  fromHighlights: Set<number>,
  toHighlights: Set<number>,
): MagicMoveDiffResult {
  const { pairs, removedLines, addedLines } = alignLines(fromLines, toLines);

  const matchedFromTokens = new Set<string>();
  const matchedToTokens = new Set<string>();
  const tokens: MorphToken[] = [];

  const tokenKey = (lineIdx: number, tokenIdx: number) => `${lineIdx}:${tokenIdx}`;

  // Pass 1: Intra-line LCS for all paired lines
  for (const pair of pairs) {
    const lineA = fromLines[pair.fromLine]!;
    const lineB = toLines[pair.toLine]!;
    const aHL = fromHighlights.has(pair.fromLine + 1);
    const bHL = toHighlights.has(pair.toLine + 1);

    const tokenMatches = lcsPairs(
      lineA.tokens,
      lineB.tokens,
      (x, y) => x.text === y.text,
    );

    for (const m of tokenMatches) {
      matchedFromTokens.add(tokenKey(pair.fromLine, m.aIndex));
      matchedToTokens.add(tokenKey(pair.toLine, m.bIndex));
      tokens.push({
        state: 'matched',
        from: makeEndpoint(pair.fromLine, lineA.tokens[m.aIndex]!, theme, aHL),
        to: makeEndpoint(pair.toLine, lineB.tokens[m.bIndex]!, theme, bHL),
      });
    }
  }

  // Collect unmatched substantive tokens for cross-line refactoring glide
  interface FlatToken {
    lineIndex: number;
    tokenIndex: number;
    token: Token;
  }

  const unmatchedFrom: FlatToken[] = [];
  for (let li = 0; li < fromLines.length; li++) {
    const line = fromLines[li]!;
    for (let ti = 0; ti < line.tokens.length; ti++) {
      if (!matchedFromTokens.has(tokenKey(li, ti))) {
        unmatchedFrom.push({ lineIndex: li, tokenIndex: ti, token: line.tokens[ti]! });
      }
    }
  }

  const unmatchedTo: FlatToken[] = [];
  for (let li = 0; li < toLines.length; li++) {
    const line = toLines[li]!;
    for (let ti = 0; ti < line.tokens.length; ti++) {
      if (!matchedToTokens.has(tokenKey(li, ti))) {
        unmatchedTo.push({ lineIndex: li, tokenIndex: ti, token: line.tokens[ti]! });
      }
    }
  }

  const subFrom = unmatchedFrom.filter((f) => isSubstantiveToken(f.token));
  const subTo = unmatchedTo.filter((t) => isSubstantiveToken(t.token));

  const crossMatches = lcsPairs(
    subFrom,
    subTo,
    (x, y) => x.token.text === y.token.text,
  );

  for (const m of crossMatches) {
    const a = subFrom[m.aIndex]!;
    const b = subTo[m.bIndex]!;
    matchedFromTokens.add(tokenKey(a.lineIndex, a.tokenIndex));
    matchedToTokens.add(tokenKey(b.lineIndex, b.tokenIndex));
    tokens.push({
      state: 'matched',
      from: makeEndpoint(a.lineIndex, a.token, theme, fromHighlights.has(a.lineIndex + 1)),
      to: makeEndpoint(b.lineIndex, b.token, theme, toHighlights.has(b.lineIndex + 1)),
    });
  }

  // Remaining unmatched tokens -> exit and enter
  for (const item of unmatchedFrom) {
    if (matchedFromTokens.has(tokenKey(item.lineIndex, item.tokenIndex))) continue;
    tokens.push({
      state: 'exit',
      from: makeEndpoint(
        item.lineIndex,
        item.token,
        theme,
        fromHighlights.has(item.lineIndex + 1),
      ),
    });
  }

  for (const item of unmatchedTo) {
    if (matchedToTokens.has(tokenKey(item.lineIndex, item.tokenIndex))) continue;
    tokens.push({
      state: 'enter',
      to: makeEndpoint(
        item.lineIndex,
        item.token,
        theme,
        toHighlights.has(item.lineIndex + 1),
      ),
    });
  }

  return { tokens, removedLines, addedLines };
}
