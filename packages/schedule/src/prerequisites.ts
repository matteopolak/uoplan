import type { CoursePrereqNode } from 'schemas';
import type { DataCache } from './dataCache';
import { getCourseLevel, normalizeCourseCode } from './utils/courseUtils';

export interface TakenCourse {
  code: string;
  credits: number;
  discipline: string;
  /** Thousands digit × 1000 from course code (e.g. CSI 3101 → 3000), or null if unparsable. */
  level: number | null;
}

export interface PrereqContext {
  taken: TakenCourse[];
  totalCredits: number;
  disciplineCredits: Record<string, number>;
  studentPrograms: string[];
}

function getDiscipline(code: string): string {
  return code.split(/\s+/)[0]?.toUpperCase() ?? '';
}

export function buildPrereqContext(
  completedCourseCodes: string[],
  cache: DataCache,
  studentPrograms: string[] = [],
): PrereqContext {
  const taken: TakenCourse[] = [];
  let totalCredits = 0;
  const disciplineCredits: Record<string, number> = {};

  for (const raw of completedCourseCodes) {
    const norm = normalizeCourseCode(raw);
    const course = cache.getCourse(norm);
    if (!course) continue;
    const credits = course.credits ?? 0;
    const discipline = getDiscipline(course.code);

    taken.push({
      code: normalizeCourseCode(course.code),
      credits,
      discipline,
      level: getCourseLevel(course.code),
    });
    totalCredits += credits;
    if (discipline) {
      disciplineCredits[discipline] = (disciplineCredits[discipline] ?? 0) + credits;
    }
  }

  return { taken, totalCredits, disciplineCredits, studentPrograms };
}

function creditsMatchingNonCourse(node: CoursePrereqNode, ctx: PrereqContext): number {
  const taken = ctx.taken;

  if (node.disciplineLevels?.length) {
    let sum = 0;
    for (const t of taken) {
      for (const dl of node.disciplineLevels) {
        if (dl.discipline.toUpperCase() !== t.discipline.toUpperCase()) continue;
        const allowed = dl.levels;
        if (!allowed?.length) {
          sum += t.credits;
          break;
        }
        if (t.level != null && allowed.includes(t.level)) {
          sum += t.credits;
          break;
        }
      }
    }
    return sum;
  }

  if (node.disciplines?.length && node.levels?.length) {
    let sum = 0;
    const dset = new Set(node.disciplines.map((d) => d.toUpperCase()));
    const allowed = new Set(node.levels);
    for (const t of taken) {
      if (!dset.has(t.discipline.toUpperCase())) continue;
      if (t.level != null && allowed.has(t.level)) sum += t.credits;
    }
    return sum;
  }

  if (node.levels?.length && (!node.disciplines || node.disciplines.length === 0)) {
    const allowed = new Set(node.levels);
    let sum = 0;
    for (const t of taken) {
      if (t.level != null && allowed.has(t.level)) sum += t.credits;
    }
    return sum;
  }

  if (node.disciplines?.length) {
    return node.disciplines.reduce(
      (acc, d) => acc + (ctx.disciplineCredits[d.toUpperCase()] ?? 0),
      0,
    );
  }

  return ctx.totalCredits;
}

function evaluateNonCourseRequirement(
  node: CoursePrereqNode,
  ctx: PrereqContext,
): boolean {
  const credits = node.credits;

  if (credits == null) {
    // Descriptive / unsupported non-course clauses should not block eligibility.
    return true;
  }

  return creditsMatchingNonCourse(node, ctx) >= credits;
}

export function meetsCoursePrereq(node: CoursePrereqNode, ctx: PrereqContext): boolean {
  if (node.programs && node.programs.length > 0) {
    const inProgram = node.programs.some((p) => ctx.studentPrograms.includes(p));
    if (!inProgram) return false;
  }
  switch (node.type) {
    case 'course': {
      if (!node.code) return true;
      const target = normalizeCourseCode(node.code);
      return ctx.taken.some((c) => c.code === target);
    }
    case 'and_group':
      return (node.children ?? []).every((child) => meetsCoursePrereq(child, ctx));
    case 'or_group':
      return (node.children ?? []).some((child) => meetsCoursePrereq(child, ctx));
    case 'non_course':
      return evaluateNonCourseRequirement(node, ctx);
    default:
      return true;
  }
}

export function canTakeCourse(
  courseCode: string,
  cache: DataCache,
  ctx: PrereqContext,
): boolean {
  const course = cache.getCourse(courseCode);
  if (!course) return false;
  const prereq = course.prerequisites;
  if (!prereq) return true;
  return meetsCoursePrereq(prereq, ctx);
}

