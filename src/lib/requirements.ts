import type { Program, ProgramRequirement } from '../schemas/catalogue';
import type { DataCache } from './dataCache';
import { normalizeCourseCode } from './dataCache';

export interface RemainingRequirement {
  requirementId: string;
  type: string;
  title?: string;
  candidateCourses: string[];
  creditsNeeded?: number;
  pickedCount?: number;
  /** Completed courses allocated to this requirement (each course used at most once at same "and" level) */
  satisfiedBy: string[];
}

/** Mirror of a program requirement node with completion status for UI. */
export interface RequirementWithStatus {
  type: string;
  title?: string;
  code?: string;
  credits?: number;
  disciplineLevels?: { discipline: string; levels?: number[] }[];
  excluded_disciplines?: string[];
  faculty?: string;
  options?: RequirementWithStatus[];
  complete: boolean;
  satisfiedBy: string[];
  satisfiedOptionIndex?: number;
  requirementId?: string;
  candidateCourses?: string[];
  creditsNeeded?: number;
  pickedCount?: number;
}

export interface CompletedRequirementItem {
  title: string;
  satisfiedBy: string[];
}

function getCreditsForCourse(cache: DataCache, code: string): number {
  const course = cache.getCourse(code);
  return course?.credits ?? 3;
}

function extractCourseCodes(req: ProgramRequirement): string[] {
  const codes: string[] = [];
  if (req.code) codes.push(req.code);
  if (req.options) {
    for (const opt of req.options) {
      codes.push(...extractCourseCodes(opt));
    }
  }
  return codes;
}

function resolveDisciplineElective(
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

function getDiscipline(code: string): string {
  return code.split(/\s+/)[0]?.toUpperCase() ?? '';
}

function applyExcludedDisciplines(codes: string[], excluded: string[] | undefined): string[] {
  if (!excluded?.length) return codes;
  const excludedSet = new Set(excluded.map((d) => d.toUpperCase()));
  return codes.filter((code) => !excludedSet.has(getDiscipline(code)));
}

function resolveElectiveCandidates(
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

type ProcessResult = { satisfied: boolean; creditsUsed: number; coursesUsed: string[] };

type ProcessOptions = {
  /** When true, do not mutate the shared completion pool, but still build a status node. */
  dryRun?: boolean;
  /**
   * When true, assign a requirementId even in dry-run mode.
   * This is used to give option branches in OR groups their own selectable slots in the UI
   * without emitting additional RemainingRequirement entries.
   */
  forceRequirementId?: boolean;
};

function runRequirementPass(
  program: Program,
  completedCourses: string[],
  cache: DataCache
): {
  remaining: RemainingRequirement[];
  tree: RequirementWithStatus[];
} {
  const result: RemainingRequirement[] = [];
  const tree: RequirementWithStatus[] = [];
  const pool = new Set(completedCourses.map(normalizeCourseCode));

  function reqId(path: string): string {
    return `req-${path}`;
  }

  function takeFromPool(
    codes: string[],
    dryRun: boolean
  ): { displayCode: string; norm: string } | null {
    for (const c of codes) {
      const norm = normalizeCourseCode(c);
      if (pool.has(norm)) {
        if (!dryRun) pool.delete(norm);
        const displayCode = cache.getCourse(norm)?.code ?? norm;
        return { displayCode, norm };
      }
    }
    return null;
  }

  type RequirementStatusBase = Omit<
    RequirementWithStatus,
    | 'complete'
    | 'satisfiedBy'
    | 'options'
    | 'satisfiedOptionIndex'
    | 'requirementId'
    | 'candidateCourses'
    | 'creditsNeeded'
    | 'pickedCount'
  >;

  function toStatusBase(req: ProgramRequirement): RequirementStatusBase {
    return {
      // ProgramRequirementSchema should always provide type, but keep a safe fallback.
      type: req.type ?? 'unknown',
      title: req.title,
      code: req.code,
      credits: req.credits,
      disciplineLevels: req.disciplineLevels,
      excluded_disciplines: req.excluded_disciplines,
      faculty: req.faculty,
    };
  }

  function process(
    req: ProgramRequirement,
    path: string,
    opts: ProcessOptions = {}
  ): { result: ProcessResult; node: RequirementWithStatus } {
    const dryRun = opts.dryRun ?? false;
    const forceRequirementId = opts.forceRequirementId ?? false;

    switch (req.type) {
      case 'section': {
        return {
          result: { satisfied: true, creditsUsed: 0, coursesUsed: [] },
          node: { ...toStatusBase(req), complete: true, satisfiedBy: [], options: [] },
        };
      }

      case 'course':
      case 'or_course': {
        const code = req.code ? normalizeCourseCode(req.code) : null;
        if (!code) {
          return {
            result: { satisfied: true, creditsUsed: 0, coursesUsed: [] },
            node: { ...toStatusBase(req), complete: true, satisfiedBy: [], options: [] },
          };
        }
        const taken = takeFromPool([code], dryRun);
        if (taken) {
          return {
            result: {
              satisfied: true,
              creditsUsed: getCreditsForCourse(cache, taken.norm),
              coursesUsed: [taken.displayCode],
            },
            node: {
              ...toStatusBase(req),
              complete: true,
              satisfiedBy: [taken.displayCode],
              options: [],
            },
          };
        }
        const course = cache.getCourse(code);
        const displayCode = course?.code ?? code;
        const requirementId = forceRequirementId || !dryRun ? reqId(path) : undefined;
        if (!dryRun) {
          result.push({
            requirementId: requirementId!,
            type: req.type,
            title: req.title,
            candidateCourses: [displayCode],
            creditsNeeded: req.credits ?? course?.credits ?? 3,
            satisfiedBy: [],
          });
        }
        return {
          result: { satisfied: false, creditsUsed: 0, coursesUsed: [] },
          node: {
            ...toStatusBase(req),
            complete: false,
            satisfiedBy: [],
            requirementId,
            candidateCourses: [displayCode],
            creditsNeeded: req.credits ?? course?.credits ?? 3,
            options: [],
          },
        };
      }

      case 'and': {
        if (!req.options?.length) {
          return {
            result: { satisfied: true, creditsUsed: 0, coursesUsed: [] },
            node: { ...toStatusBase(req), complete: true, satisfiedBy: [], options: [] },
          };
        }
        let totalCredits = 0;
        const allCoursesUsed: string[] = [];
        let allSatisfied = true;
        const childNodes: RequirementWithStatus[] = [];
        for (let i = 0; i < req.options.length; i++) {
          const { result: r, node } = process(req.options[i], `${path}-${i}`, opts);
          totalCredits += r.creditsUsed;
          allCoursesUsed.push(...r.coursesUsed);
          if (!r.satisfied) allSatisfied = false;
          childNodes.push(node);
        }
        return {
          result: {
            satisfied: allSatisfied,
            creditsUsed: totalCredits,
            coursesUsed: allCoursesUsed,
          },
          node: {
            ...toStatusBase(req),
            complete: allSatisfied,
            satisfiedBy: allCoursesUsed,
            options: childNodes,
          },
        };
      }

      case 'or_group': {
        if (!req.options?.length) {
          return {
            result: { satisfied: true, creditsUsed: 0, coursesUsed: [] },
            node: { ...toStatusBase(req), complete: true, satisfiedBy: [], options: [] },
          };
        }
        const allCandidates: string[] = [];
        const orChildNodes: RequirementWithStatus[] = [];
        // Do not consume from pool: always process options in dryRun so user assigns explicitly.
        for (let i = 0; i < req.options.length; i++) {
          const opt = req.options[i];
          const { node } = process(opt, `${path}-${i}`, { ...opts, dryRun: true, forceRequirementId: true });
          orChildNodes.push(node);
          if (opt.type === 'course' && opt.code) {
            allCandidates.push(cache.getCourse(opt.code)?.code ?? opt.code);
          } else if (opt.type === 'discipline_elective' && opt.disciplineLevels?.length) {
            allCandidates.push(
              ...resolveDisciplineElective(
                cache,
                opt.disciplineLevels[0].discipline,
                opt.disciplineLevels[0].levels
              )
            );
          }
        }

        if (allCandidates.length > 0) {
          const requirementId = reqId(path);
          if (!dryRun) {
            result.push({
              requirementId,
              type: 'or_group',
              title: req.title,
              candidateCourses: [...new Set(allCandidates)],
              creditsNeeded: req.credits,
              satisfiedBy: [],
            });
          }
          return {
            result: { satisfied: false, creditsUsed: 0, coursesUsed: [] },
            node: {
              ...toStatusBase(req),
              complete: false,
              satisfiedBy: [],
              satisfiedOptionIndex: undefined,
              requirementId,
              candidateCourses: [...new Set(allCandidates)],
              creditsNeeded: req.credits,
              options: orChildNodes,
            },
          };
        }
        return {
          result: { satisfied: false, creditsUsed: 0, coursesUsed: [] },
          node: {
            ...toStatusBase(req),
            complete: false,
            satisfiedBy: [],
            options: orChildNodes,
          },
        };
      }

      case 'group': {
        const creditsNeeded = req.credits ?? 0;
        const options = req.options ?? [];
        const courseCodes = options.flatMap((o) =>
          o.type === 'course' && o.code ? [cache.getCourse(o.code)?.code ?? o.code] : []
        );
        const electiveOptions = options.filter(
          (o) =>
            o.type === 'discipline_elective' ||
            o.type === 'elective' ||
            o.type === 'faculty_elective' ||
            o.type === 'free_elective' ||
            o.type === 'non_discipline_elective'
        );
        const electiveCandidates = electiveOptions.flatMap((o) =>
          resolveElectiveCandidates(cache, o, creditsNeeded)
        );
        const allCandidates = [...new Set([...courseCodes, ...electiveCandidates])];

        // Do not consume from pool: user assigns courses explicitly to group requirements.
        const coursesUsed: string[] = [];
        const remainingCredits = creditsNeeded;

        const requirementId = forceRequirementId || !dryRun ? reqId(path) : undefined;
        if (!dryRun && requirementId) {
          result.push({
            requirementId,
            type: 'group',
            title: req.title,
            candidateCourses: allCandidates,
            creditsNeeded: remainingCredits,
            pickedCount: Math.ceil(remainingCredits / 3),
            satisfiedBy: coursesUsed,
          });
        }
        const childNodes = req.options?.map((o, i) => process(o, `${path}-${i}`, { dryRun: true }).node) ?? [];
        return {
          result: { satisfied: false, creditsUsed: 0, coursesUsed },
          node: {
            ...toStatusBase(req),
            complete: false,
            satisfiedBy: coursesUsed,
            requirementId,
            candidateCourses: allCandidates,
            creditsNeeded: remainingCredits,
            pickedCount: Math.ceil(remainingCredits / 3),
            options: childNodes,
          },
        };
      }

      case 'options_group': {
        if (!req.options?.length) {
          return {
            result: { satisfied: true, creditsUsed: 0, coursesUsed: [] },
            node: { ...toStatusBase(req), complete: true, satisfiedBy: [], options: [] },
          };
        }
        // Do not consume from pool: process each option in dryRun so user assigns explicitly.
        const requirementId = opts.dryRun ? undefined : reqId(path);
        const optNodes: RequirementWithStatus[] = [];
        for (let i = 0; i < req.options.length; i++) {
          const { node } = process(req.options[i], `${path}-${i}`, { ...opts, dryRun: true });
          optNodes.push(node);
        }

        return {
          result: { satisfied: false, creditsUsed: 0, coursesUsed: [] },
          node: {
            ...toStatusBase(req),
            complete: false,
            satisfiedBy: [],
            requirementId,
            options: optNodes,
          },
        };
      }

      case 'pick': {
        const creditsNeeded = req.credits ?? 3;
        const options = req.options ?? [];
        const allCandidates = options.flatMap((o) => {
          if (o.type === 'course' && o.code) return [cache.getCourse(o.code)?.code ?? o.code];
          if (o.type === 'discipline_elective' && o.disciplineLevels?.length) {
            return resolveDisciplineElective(
              cache,
              o.disciplineLevels[0].discipline,
              o.disciplineLevels[0].levels
            );
          }
          return [];
        });
        const unique = [...new Set(allCandidates)];

        // Do not consume from pool: user assigns courses explicitly to pick requirements.
        const coursesUsed: string[] = [];
        const remaining = creditsNeeded;

        const requirementId = forceRequirementId || !dryRun ? reqId(path) : undefined;
        if (!dryRun && requirementId) {
          result.push({
            requirementId,
            type: 'pick',
            title: req.title,
            candidateCourses: unique,
            creditsNeeded: remaining,
            satisfiedBy: coursesUsed,
          });
        }
        const childNodes = options.map((o, i) => process(o, `${path}-${i}`, { dryRun: true }).node);
        return {
          result: { satisfied: false, creditsUsed: 0, coursesUsed },
          node: {
            ...toStatusBase(req),
            complete: false,
            satisfiedBy: coursesUsed,
            requirementId,
            candidateCourses: unique,
            creditsNeeded: remaining,
            options: childNodes,
          },
        };
      }

      case 'elective':
      case 'discipline_elective':
      case 'faculty_elective':
      case 'free_elective':
      case 'non_discipline_elective': {
        const creditsNeeded = req.credits ?? 3;
        const candidates = resolveElectiveCandidates(cache, req, creditsNeeded);

        // Do not consume from pool: user assigns courses explicitly to elective requirements.
        const coursesUsed: string[] = [];
        const remaining = creditsNeeded;

        const requirementId = forceRequirementId || !dryRun ? reqId(path) : undefined;
        if (!dryRun && requirementId) {
          result.push({
            requirementId,
            type: req.type,
            title: req.title,
            candidateCourses: candidates,
            creditsNeeded: remaining,
            satisfiedBy: coursesUsed,
          });
        }
        return {
          result: { satisfied: false, creditsUsed: 0, coursesUsed },
          node: {
            ...toStatusBase(req),
            complete: false,
            satisfiedBy: coursesUsed,
            requirementId,
            candidateCourses: candidates,
            creditsNeeded: remaining,
            options: [],
          },
        };
      }

      default:
        return {
          result: { satisfied: true, creditsUsed: 0, coursesUsed: [] },
          node: { ...toStatusBase(req), complete: true, satisfiedBy: [], options: [] },
        };
    }
  }

  for (let i = 0; i < program.requirements.length; i++) {
    const { node } = process(program.requirements[i], String(i));
    tree.push(node);
  }

  return { remaining: result, tree };
}

/** Collect completed requirement items: nodes that are complete and whose parent is not in the list (topmost complete only). */
export function collectCompletedRequirements(
  tree: RequirementWithStatus[],
  parentComplete = false
): CompletedRequirementItem[] {
  const out: CompletedRequirementItem[] = [];
  for (const node of tree) {
    const title = node.title ?? node.code ?? `${node.type} requirement`;
    if (node.complete) {
      if (!parentComplete && node.satisfiedBy.length > 0) {
        out.push({ title, satisfiedBy: node.satisfiedBy });
      }
      if (node.options?.length) {
        out.push(...collectCompletedRequirements(node.options, true));
      }
    } else {
      if (node.options?.length) {
        out.push(...collectCompletedRequirements(node.options, false));
      }
    }
  }
  return out;
}

export function computeRequirementTreeWithStatus(
  program: Program,
  completedCourses: string[],
  cache: DataCache
): RequirementWithStatus[] {
  return runRequirementPass(program, completedCourses, cache).tree;
}

export interface RequirementsState {
  remaining: RemainingRequirement[];
  tree: RequirementWithStatus[];
  completedList: CompletedRequirementItem[];
}

export function computeRequirementsState(
  program: Program,
  completedCourses: string[],
  cache: DataCache
): RequirementsState {
  const { remaining, tree } = runRequirementPass(program, completedCourses, cache);
  return {
    remaining,
    tree,
    completedList: collectCompletedRequirements(tree),
  };
}

export function computeRemainingRequirements(
  program: Program,
  completedCourses: string[],
  cache: DataCache
): RemainingRequirement[] {
  return runRequirementPass(program, completedCourses, cache).remaining;
}
