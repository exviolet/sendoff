export interface FuzzyMatch {
  match: boolean;
  score: number;
  indices: number[];
}

// Subsequence fuzzy-матч query по text. Бонусы: подряд идущие совпадения (+2),
// начало слова — старт строки или после ` `/`-`/`_` (+3). `baseScore` позволяет
// приоритизировать поле (title > binding > preview > content). `source` — концерн
// консьюмера (TabSwitcher оборачивает и добавляет сам), в lib его нет.
export function fuzzyMatch(query: string, text: string, baseScore = 0): FuzzyMatch {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  const indices: number[] = [];
  let qi = 0;
  let score = baseScore;
  let lastMatchIndex = -1;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      indices.push(ti);
      if (lastMatchIndex === ti - 1) score += 2;
      if (ti === 0 || t[ti - 1] === " " || t[ti - 1] === "-" || t[ti - 1] === "_") score += 3;
      score += 1;
      lastMatchIndex = ti;
      qi++;
    }
  }

  return { match: qi === q.length, score, indices };
}
