import type { CoursePrereqNode } from '../schemas/catalogue';
import type { DataCache } from './dataCache';
import { normalizeCourseCode } from './dataCache';

export interface TakenCourse {
  code: string;
  credits: number;
  discipline: string;
}

export interface PrereqContext {
  taken: TakenCourse[];
  totalCredits: number;
  disciplineCredits: Record<string, number>;
}

function getDiscipline(code: string): string {
  return code.split(/\s+/)[0]?.toUpperCase() ?? '';
}

export function buildPrereqContext(
  completedCourseCodes: string[],
  cache: DataCache,
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

    taken.push({ code: normalizeCourseCode(course.code), credits, discipline });
    totalCredits += credits;
    if (discipline) {
      disciplineCredits[discipline] = (disciplineCredits[discipline] ?? 0) + credits;
    }
  }

  return { taken, totalCredits, disciplineCredits };
}

function evaluateNonCourseRequirement(
  node: CoursePrereqNode,
  ctx: PrereqContext,
): boolean {
  const credits = node.credits;
  const disciplines = node.disciplines;

  if (credits == null) {
    // Descriptive / unsupported non-course clauses should not block eligibility.
    return true;
  }

  if (!disciplines || disciplines.length === 0) {
    return ctx.totalCredits >= credits;
  }

  // Sum credits across any of the listed disciplines.
  const sum = disciplines.reduce(
    (acc, d) => acc + (ctx.disciplineCredits[d.toUpperCase()] ?? 0),
    0,
  );
  return sum >= credits;
}

export function meetsCoursePrereq(node: CoursePrereqNode, ctx: PrereqContext): boolean {
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

