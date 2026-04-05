import type { Program, ProgramRequirement } from 'schemas';
import type { DataCache } from '../dataCache';
import { normalizeCourseCode } from '../utils/courseUtils';
import type { RemainingRequirement, RequirementWithStatus } from './types';

export class RequirementContext {
  public remaining: RemainingRequirement[] = [];
  public pool: Set<string>;

  constructor(
    public program: Program,
    completedCourses: string[],
    public cache: DataCache,
    public selectedOptionsPerRequirement: Record<string, number> = {}
  ) {
    this.pool = new Set(completedCourses.map(normalizeCourseCode));
  }

  reqId(path: string): string {
    return `req-${path}`;
  }

  takeFromPool(codes: string[], dryRun: boolean): { displayCode: string; norm: string } | null {
    for (const c of codes) {
      const norm = normalizeCourseCode(c);
      if (this.pool.has(norm)) {
        if (!dryRun) this.pool.delete(norm);
        const displayCode = this.cache.getCourse(norm)?.code ?? norm;
        return { displayCode, norm };
      }
    }
    return null;
  }

  toStatusBase(req: ProgramRequirement): Omit<RequirementWithStatus, 'complete' | 'satisfiedBy' | 'options' | 'satisfiedOptionIndex' | 'requirementId' | 'candidateCourses' | 'creditsNeeded' | 'pickedCount'> {
    return {
      type: req.type ?? 'unknown',
      title: req.title,
      code: req.code,
      credits: req.credits,
      disciplineLevels: req.disciplineLevels,
      excluded_disciplines: req.excluded_disciplines,
      faculty: req.faculty,
    };
  }
}
