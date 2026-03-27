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

  const flags = options.caseSensitive ? "g" : "gi";
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
  options: { caseSensitive: boolean; regex: boolean }
): { result: string; count: number } {
  const matches = findMatches(content, query, options);
  if (matches.length === 0) return { result: content, count: 0 };

  let result = "";
  let lastEnd = 0;

  for (const m of matches) {
    result += content.slice(lastEnd, m.index) + replacement;
    lastEnd = m.index + m.length;
  }

  result += content.slice(lastEnd);
  return { result, count: matches.length };
}
