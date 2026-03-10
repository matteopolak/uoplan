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

function normalizeSet(codes: string[]): Set<string> {
  return new Set(codes.map(normalizeCourseCode));
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

type ProcessOptions = { dryRun?: boolean };

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
  let idCounter = 0;
  const pool = new Set(completedCourses.map(normalizeCourseCode));

  function nextId(): string {
    return `req-${idCounter++}`;
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

  function toStatusBase(req: ProgramRequirement): Partial<RequirementWithStatus> {
    return {
      type: req.type,
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
    _path: string,
    opts: ProcessOptions = {}
  ): { result: ProcessResult; node: RequirementWithStatus } {
    const dryRun = opts.dryRun ?? false;

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
        const requirementId = dryRun ? undefined : nextId();
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
        for (const opt of req.options) {
          const { result: r, node } = process(opt, '', opts);
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
        let satisfiedIdx = -1;
        let processResult: ProcessResult = { satisfied: false, creditsUsed: 0, coursesUsed: [] };

        for (let i = 0; i < req.options.length; i++) {
          const opt = req.options[i];
          const codes = extractCourseCodes(opt);
          const taken = takeFromPool(codes, dryRun);
          if (taken) {
            processResult = {
              satisfied: true,
              creditsUsed: getCreditsForCourse(cache, taken.norm),
              coursesUsed: [taken.displayCode],
            };
            satisfiedIdx = i;
            const { node } = process(opt, '', { ...opts, dryRun: true });
            orChildNodes.push({ ...node, complete: true, satisfiedBy: [taken.displayCode] });
            for (let j = i + 1; j < req.options.length; j++) {
              const { node: n } = process(req.options[j], '', { ...opts, dryRun: true });
              orChildNodes.push(n);
            }
            break;
          }
          const { node } = process(opt, '', { ...opts, dryRun: true });
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

        if (processResult.satisfied) {
          return {
            result: processResult,
            node: {
              ...toStatusBase(req),
              complete: true,
              satisfiedBy: processResult.coursesUsed,
              satisfiedOptionIndex: satisfiedIdx,
              options: orChildNodes,
            },
          };
        }

        if (allCandidates.length > 0 && !dryRun) {
          const requirementId = nextId();
          result.push({
            requirementId,
            type: 'or_group',
            title: req.title,
            candidateCourses: [...new Set(allCandidates)],
            creditsNeeded: req.credits,
            satisfiedBy: [],
          });
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
            o.type === 'faculty_elective'
        );
        const electiveCandidates = electiveOptions.flatMap((o) =>
          resolveElectiveCandidates(cache, o, creditsNeeded)
        );
        const allCandidates = [...new Set([...courseCodes, ...electiveCandidates])];

        const coursesUsed: string[] = [];
        let completedCredits = 0;
        if (!dryRun) {
          for (const code of allCandidates) {
            if (completedCredits >= creditsNeeded) break;
            const norm = normalizeCourseCode(code);
            if (pool.has(norm)) {
              pool.delete(norm);
              const displayCode = cache.getCourse(norm)?.code ?? norm;
              coursesUsed.push(displayCode);
              completedCredits += getCreditsForCourse(cache, norm);
            }
          }
        }

        const remainingCredits = creditsNeeded - completedCredits;
        if (remainingCredits <= 0) {
          const childNodes = req.options?.map((o) => process(o, '', { dryRun: true }).node) ?? [];
          return {
            result: { satisfied: true, creditsUsed: creditsNeeded, coursesUsed },
            node: {
              ...toStatusBase(req),
              complete: true,
              satisfiedBy: coursesUsed,
              options: childNodes,
            },
          };
        }

        const requirementId = dryRun ? undefined : nextId();
        if (!dryRun) {
          result.push({
            requirementId: requirementId!,
            type: 'group',
            title: req.title,
            candidateCourses: allCandidates,
            creditsNeeded: remainingCredits,
            pickedCount: Math.ceil(remainingCredits / 3),
            satisfiedBy: coursesUsed,
          });
        }
        const childNodes = req.options?.map((o) => process(o, '', { dryRun: true }).node) ?? [];
        return {
          result: { satisfied: false, creditsUsed: completedCredits, coursesUsed },
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
        const optNodes: RequirementWithStatus[] = [];
        let optResult: ProcessResult = { satisfied: false, creditsUsed: 0, coursesUsed: [] };
        let satisfiedOptIdx = -1;

        for (let i = 0; i < req.options.length; i++) {
          const { result: r, node } = process(req.options[i], '', opts);
          optNodes.push(node);
          if (r.satisfied) {
            optResult = r;
            satisfiedOptIdx = i;
            for (let j = i + 1; j < req.options.length; j++) {
              const { node: n } = process(req.options[j], '', { dryRun: true });
              optNodes.push(n);
            }
            break;
          }
        }

        return {
          result: optResult,
          node: {
            ...toStatusBase(req),
            complete: optResult.satisfied,
            satisfiedBy: optResult.coursesUsed,
            satisfiedOptionIndex: satisfiedOptIdx >= 0 ? satisfiedOptIdx : undefined,
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

        const coursesUsed: string[] = [];
        let completedCredits = 0;
        if (!dryRun) {
          for (const code of unique) {
            if (completedCredits >= creditsNeeded) break;
            const norm = normalizeCourseCode(code);
            if (pool.has(norm)) {
              pool.delete(norm);
              const displayCode = cache.getCourse(norm)?.code ?? norm;
              coursesUsed.push(displayCode);
              completedCredits += getCreditsForCourse(cache, norm);
            }
          }
        }

        const remaining = creditsNeeded - completedCredits;
        if (remaining <= 0) {
          const childNodes = options.map((o) => process(o, '', { dryRun: true }).node);
          return {
            result: { satisfied: true, creditsUsed: creditsNeeded, coursesUsed },
            node: {
              ...toStatusBase(req),
              complete: true,
              satisfiedBy: coursesUsed,
              options: childNodes,
            },
          };
        }

        const requirementId = dryRun ? undefined : nextId();
        if (!dryRun) {
          result.push({
            requirementId: requirementId!,
            type: 'pick',
            title: req.title,
            candidateCourses: unique,
            creditsNeeded: remaining,
            satisfiedBy: coursesUsed,
          });
        }
        const childNodes = options.map((o) => process(o, '', { dryRun: true }).node);
        return {
          result: { satisfied: false, creditsUsed: completedCredits, coursesUsed },
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

        const coursesUsed: string[] = [];
        let completedCredits = 0;
        if (!dryRun) {
          for (const code of candidates) {
            if (completedCredits >= creditsNeeded) break;
            const norm = normalizeCourseCode(code);
            if (pool.has(norm)) {
              pool.delete(norm);
              const displayCode = cache.getCourse(norm)?.code ?? norm;
              coursesUsed.push(displayCode);
              completedCredits += getCreditsForCourse(cache, norm);
            }
          }
        }

        const remaining = creditsNeeded - completedCredits;
        if (remaining <= 0) {
          return {
            result: { satisfied: true, creditsUsed: creditsNeeded, coursesUsed },
            node: {
              ...toStatusBase(req),
              complete: true,
              satisfiedBy: coursesUsed,
              options: [],
            },
          };
        }

        const requirementId = dryRun ? undefined : nextId();
        if (!dryRun) {
          result.push({
            requirementId: requirementId!,
            type: req.type,
            title: req.title,
            candidateCourses: candidates,
            creditsNeeded: remaining,
            satisfiedBy: coursesUsed,
          });
        }
        return {
          result: { satisfied: false, creditsUsed: completedCredits, coursesUsed },
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

  for (const req of program.requirements) {
    const { node } = process(req, 'root');
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
