import type { ReactNode } from "react";

// Подсветка позиций совпадения (fuzzy / поиск) accent-цветом. Пустые indices → сырой
// текст. Чистая функция: без side effects, только форматирует ReactNode.
export function highlightMatches(text: string, indices: number[]): ReactNode {
  if (indices.length === 0) return text;

  const parts: ReactNode[] = [];
  const indexSet = new Set(indices);
  let start = 0;

  for (let i = 0; i < text.length; i++) {
    if (!indexSet.has(i)) continue;
    if (start < i) parts.push(<span key={`t-${start}`}>{text.slice(start, i)}</span>);
    parts.push(<span key={`h-${i}`} className="text-accent font-semibold">{text[i]}</span>);
    start = i + 1;
  }

  if (start < text.length) parts.push(<span key={`t-${start}`}>{text.slice(start)}</span>);
  return <>{parts}</>;
}
