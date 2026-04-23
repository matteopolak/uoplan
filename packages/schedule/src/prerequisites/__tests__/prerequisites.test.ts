import { describe, expect, it, beforeEach } from 'vitest';
import type { DataCache } from '../../dataCache';
import { buildPrereqContext } from '../context';
import type { Course } from 'schemas';
import { meetsCoursePrereq, canTakeCourse } from '../evaluator';
import type { CoursePrereqNode } from 'schemas';

describe('prerequisites', () => {
  let mockCache: DataCache;

  beforeEach(() => {
    const courseA: Course = { code: 'AAA 1000', credits: 3, title: 'A', description: '' };
    const courseB: Course = { code: 'BBB 2000', credits: 3, title: 'B', description: '', prerequisites: { type: 'course', code: 'AAA 1000' } };
    const courses = [courseA, courseB];
    mockCache = {
      getCourse: (c) => courses.find(x => x.code === c) || undefined,
      resolveToCanonical: (c) => c,
      getAllCourses: () => courses,
      getCoursesByDiscipline: () => [],
      getSchedule: () => undefined,
      getAllSchedules: () => [],
    };
  });

  describe('context', () => {
    it('builds context with total credits', () => {
      const ctx = buildPrereqContext(['AAA 1000', 'BBB 2000'], mockCache);
      expect(ctx.totalCredits).toBe(6);
      expect(ctx.taken.length).toBe(2);
      expect(ctx.disciplineCredits['AAA']).toBe(3);
    });
  });

  describe('evaluator', () => {
    it('can take course with met prereq', () => {
      const ctx = buildPrereqContext(['AAA 1000'], mockCache);
      expect(canTakeCourse('BBB 2000', mockCache, ctx)).toBe(true);
    });

    it('cannot take course without met prereq', () => {
      const ctx = buildPrereqContext([], mockCache);
      expect(canTakeCourse('BBB 2000', mockCache, ctx)).toBe(false);
    });
    
    it('evaluates non_course level requirement', () => {
      const ctx = buildPrereqContext(['AAA 1000'], mockCache);
      const req: CoursePrereqNode = {
        type: 'non_course',
        credits: 3,
        levels: [1000]
      };
      expect(meetsCoursePrereq(req, ctx)).toBe(true);
      
      const reqFail: CoursePrereqNode = {
        type: 'non_course',
        credits: 3,
        levels: [2000]
      };
      expect(meetsCoursePrereq(reqFail, ctx)).toBe(false);
    });
  });
});
