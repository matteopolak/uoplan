import type { ProgramRequirement } from 'schemas';
import type { DataCache } from '../dataCache';
export function extractCourseCodes(req: ProgramRequirement): string[] {
  const codes: string[] = [];
  if (req.code) codes.push(req.code);
  if (req.options) {
    for (const opt of req.options) {
      codes.push(...extractCourseCodes(opt));
    }
  }
  return codes;
}

export function getDiscipline(code: string): string {
  return code.split(/\s+/)[0]?.toUpperCase() ?? '';
}

export function applyExcludedDisciplines(codes: string[], excluded: string[] | undefined): string[] {
  if (!excluded?.length) return codes;
  const excludedSet = new Set(excluded.map((d) => d.toUpperCase()));
  return codes.filter((code) => !excludedSet.has(getDiscipline(code)));
}

export function resolveDisciplineElective(
  cache: DataCache,
  discipline: string,
  levels?: number[]
): string[] {
  const courses = cache.getCoursesByDiscipline(discipline);
  if (!levels || levels.length === 0) {
    return courses.map((c) => c.code);
  }
  return courses
    .filter((c) => {
      const match = c.code.match(/\d{4,5}/);
      if (!match) return false;
      const num = parseInt(match[0].replace(/\D/g, '').slice(0, 4), 10);
      return levels.some((l) => num >= l && num < l + 1000);
    })
    .map((c) => c.code);
}

export function resolveElectiveCandidates(
  cache: DataCache,
  req: ProgramRequirement,
  credits?: number
): string[] {
  switch (req.type) {
    case 'discipline_elective': {
      const disciplines = req.disciplineLevels ?? [];
      const all: string[] = [];
      for (const dl of disciplines) {
        all.push(...resolveDisciplineElective(cache, dl.discipline, dl.levels));
      }
      return applyExcludedDisciplines([...new Set(all)], req.excluded_disciplines);
    }
    case 'faculty_elective':
    case 'free_elective':
    case 'non_discipline_elective':
    case 'elective': {
      const explicit = extractCourseCodes(req);
      if (explicit.length > 0) return applyExcludedDisciplines(explicit, req.excluded_disciplines);
      const creditsNeeded = credits ?? req.credits ?? 3;
      const allCourses = cache.getAllCourses();
      const candidates = allCourses
        .filter((c) => c.credits <= creditsNeeded)
        .map((c) => c.code);
      return applyExcludedDisciplines(candidates, req.excluded_disciplines);
    }
    default:
      return [];
  }
}
