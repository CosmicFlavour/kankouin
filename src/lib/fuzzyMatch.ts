// Case-insensitive subsequence match with a lightweight score: rewards
// consecutive matched characters and matches that land on a word boundary,
// so "tsk rep" ranks "Task: Quarterly Report" above a weaker match.
export function fuzzyScore(query: string, target: string): number | null {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let qi = 0;
  let score = 0;
  let consecutive = 0;
  let lastMatchIndex = -1;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] !== q[qi]) continue;
    consecutive = lastMatchIndex === ti - 1 ? consecutive + 1 : 0;
    const isWordStart = ti === 0 || /[\s\-_/]/.test(t[ti - 1]);
    score += 1 + consecutive + (isWordStart ? 2 : 0);
    lastMatchIndex = ti;
    qi += 1;
  }

  return qi === q.length ? score : null;
}

// Filters `items` to those whose text (via `getText`) fuzzy-matches `query`,
// ranked best match first. An empty/whitespace-only query returns no
// results — callers should show a "type to search" hint instead.
export function fuzzySearch<T>(
  query: string,
  items: T[],
  getText: (item: T) => string,
): T[] {
  const trimmed = query.trim();
  if (!trimmed) return [];
  return items
    .map((item) => ({ item, score: fuzzyScore(trimmed, getText(item)) }))
    .filter(
      (entry): entry is { item: T; score: number } => entry.score !== null,
    )
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.item);
}
