export type ProfessorRatingsEntry = { rating: number; numRatings: number };
export type ProfessorRatingsMap = Record<string, ProfessorRatingsEntry>;

export function normalizeProfessorName(name: string): string {
  return (name ?? '').trim().replace(/\s+/g, ' ');
}

export function buildProfessorRatingsMap(input: {
  professors: Array<{ name: string; rating: number | null; numRatings?: number }>;
}): ProfessorRatingsMap {
  const map: ProfessorRatingsMap = {};
  for (const p of input.professors ?? []) {
    const key = normalizeProfessorName(p.name);
    if (!key) continue;
    const rating = typeof p.rating === 'number' ? p.rating : Number(p.rating);
    if (!Number.isFinite(rating)) continue;
    map[key] = { rating, numRatings: p.numRatings ?? 0 };
  }
  return map;
}

export function getRatingsForInstructors(
  instructors: string[] | null | undefined,
  map: ProfessorRatingsMap | null | undefined
): number[] {
  if (!map || !instructors?.length) return [];
  const out: number[] = [];
  const seen = new Set<string>();
  for (const raw of instructors) {
    const key = normalizeProfessorName(raw);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const entry = map[key];
    if (entry && Number.isFinite(entry.rating)) out.push(entry.rating);
  }
  return out;
}

export function getRatingDetailsForInstructors(
  instructors: string[] | null | undefined,
  map: ProfessorRatingsMap | null | undefined
): Array<{ name: string; rating: number; numRatings: number }> {
  if (!map || !instructors?.length) return [];
  const out: Array<{ name: string; rating: number; numRatings: number }> = [];
  const seen = new Set<string>();
  for (const raw of instructors) {
    const key = normalizeProfessorName(raw);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const entry = map[key];
    if (entry && Number.isFinite(entry.rating)) {
      out.push({ name: raw.trim(), rating: entry.rating, numRatings: entry.numRatings });
    }
  }
  return out;
}

export function isSectionAllowedByMinRating(args: {
  instructors: string[] | null | undefined;
  minRating: number | null | undefined;
  professorRatings: ProfessorRatingsMap | null | undefined;
}): boolean {
  const { instructors, minRating, professorRatings } = args;
  if (minRating == null || !Number.isFinite(minRating)) return true;
  const ratings = getRatingsForInstructors(instructors, professorRatings);
  if (ratings.length === 0) return true; // no rating => always allowed
  return ratings.every((r) => r >= minRating);
}

export function formatRatingsDisplay(ratings: number[]): string | null {
  if (!ratings.length) return null;
  return ratings.map((r) => r.toFixed(1).replace(/\.0$/, '')).join(' · ');
}
