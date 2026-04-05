import type { CoursePrereqNode } from 'schemas';
import type { DataCache } from '../dataCache';
import { normalizeCourseCode } from '../utils/courseUtils';
import type { PrereqContext } from './types';

export function meetsCoursePrereq(node: CoursePrereqNode, ctx: PrereqContext): boolean {
  if (node.programs && node.programs.length > 0) {
    const inProgram = node.programs.some((p) => ctx.studentPrograms.includes(p));
    if (!inProgram) return false;
  }

  switch (node.type) {
    case 'course':
      return evaluateCourseRequirement(node, ctx);
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

function evaluateCourseRequirement(node: CoursePrereqNode, ctx: PrereqContext): boolean {
  if (!node.code) return true;
  const target = normalizeCourseCode(node.code);
  return ctx.taken.some((c) => c.code === target);
}

function evaluateNonCourseRequirement(node: CoursePrereqNode, ctx: PrereqContext): boolean {
  const credits = node.credits;

  if (credits == null) {
    // Plain descriptive clauses (permission, standing, etc.) are not modeled;
    // do not treat them as satisfied — course stays ineligible until we can evaluate.
    return false;
  }

  return creditsMatchingNonCourse(node, ctx) >= credits;
}

function creditsMatchingNonCourse(node: CoursePrereqNode, ctx: PrereqContext): number {
  const taken = ctx.taken;

  // 1. Specific discipline + level constraints
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

  // 2. Both disciplines and levels constrained
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

  // 3. Only levels constrained
  if (node.levels?.length && (!node.disciplines || node.disciplines.length === 0)) {
    const allowed = new Set(node.levels);
    let sum = 0;
    for (const t of taken) {
      if (t.level != null && allowed.has(t.level)) sum += t.credits;
    }
    return sum;
  }

  // 4. Only disciplines constrained
  if (node.disciplines?.length) {
    return node.disciplines.reduce(
      (acc, d) => acc + (ctx.disciplineCredits[d.toUpperCase()] ?? 0),
      0,
    );
  }

  // 5. No specific constraints -> fallback to total credits
  return ctx.totalCredits;
}

/**
 * True if the prerequisite tree contains any `non_course` node (standing,
 * permission, etc.). Used to deprioritize those courses when sampling schedules.
 */
export function prerequisitesContainNonCourse(node: CoursePrereqNode | undefined): boolean {
  if (!node) return false;
  if (node.type === 'non_course') return true;
  for (const child of node.children ?? []) {
    if (prerequisitesContainNonCourse(child)) return true;
  }
  return false;
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
