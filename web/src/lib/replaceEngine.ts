export interface MatchResult {
  index: number;
  length: number;
  text: string;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function findMatches(
  content: string,
  query: string,
  options: { caseSensitive: boolean; regex: boolean }
): MatchResult[] {
  if (!query) return [];

  const flags = options.caseSensitive ? "gu" : "giu";
  let pattern: RegExp;

  try {
    pattern = new RegExp(options.regex ? query : escapeRegex(query), flags);
  } catch {
    return [];
  }

  const results: MatchResult[] = [];
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content)) !== null) {
    if (match[0].length === 0) {
      pattern.lastIndex++;
      continue;
    }
    results.push({ index: match.index, length: match[0].length, text: match[0] });
  }

  return results;
}

export function replaceAt(
  content: string,
  match: MatchResult,
  replacement: string
): string {
  return content.slice(0, match.index) + replacement + content.slice(match.index + match.length);
}

export function replaceAll(
  content: string,
  query: string,
  replacement: string,
  options: { caseSensitive: boolean; regex: boolean; wholeWord?: boolean }
): { result: string; count: number } {
  if (!query) return { result: content, count: 0 };

  const flags = options.caseSensitive ? "gu" : "giu";
  const escaped = options.regex ? query : escapeRegex(query);
  // \b doesn't work with Cyrillic in JS — use Unicode-aware word boundary lookarounds
  const wb = `(?<![\\p{L}\\p{N}])`;
  const wbEnd = `(?![\\p{L}\\p{N}])`;
  const pattern = options.wholeWord ? `${wb}${escaped}${wbEnd}` : escaped;

  let re: RegExp;
  try {
    re = new RegExp(pattern, flags);
  } catch {
    return { result: content, count: 0 };
  }

  let count = 0;
  const result = content.replace(re, () => {
    count++;
    return replacement;
  });

  return { result, count };
}

export interface ReplacePair {
  from: string;
  to: string;
  caseSensitive: boolean;
  wholeWord: boolean;
}

export function applyReplacePairs(
  content: string,
  pairs: ReplacePair[]
): { result: string; totalCount: number } {
  let result = content;
  let totalCount = 0;

  for (const pair of pairs) {
    const { result: newResult, count } = replaceAll(result, pair.from, pair.to, {
      caseSensitive: pair.caseSensitive,
      regex: false,
      wholeWord: pair.wholeWord,
    });
    result = newResult;
    totalCount += count;
  }

  return { result, totalCount };
}

export interface DiffEntry {
  from: string;
  to: string;
  count: number;
}

export function previewReplacePairs(
  content: string,
  pairs: ReplacePair[]
): { entries: DiffEntry[]; totalCount: number; result: string } {
  let current = content;
  const entries: DiffEntry[] = [];
  let totalCount = 0;

  for (const pair of pairs) {
    const { result: newContent, count } = replaceAll(current, pair.from, pair.to, {
      caseSensitive: pair.caseSensitive,
      regex: false,
      wholeWord: pair.wholeWord,
    });
    if (count > 0) {
      entries.push({ from: pair.from, to: pair.to, count });
      totalCount += count;
    }
    current = newContent;
  }

  return { entries, totalCount, result: current };
}
