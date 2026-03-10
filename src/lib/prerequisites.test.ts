import { describe, it, expect } from 'vitest';
import type { CoursePrereqNode } from '../schemas/catalogue';
import type { DataCache } from './dataCache';
import { buildPrereqContext, canTakeCourse, meetsCoursePrereq } from './prerequisites';
import {
  courseMatchesFilters,
  getCourseLanguageBucket,
  getCourseLevelBucket,
  isGraduateCourse,
} from './courseFilters';

function makeMockCache(courses: Array<{ code: string; credits: number; discipline?: string }>): DataCache {
  const map = new Map<string, { code: string; credits: number; component?: string }>();
  for (const c of courses) {
    map.set(c.code, { code: c.code, credits: c.credits });
  }
  return {
    getCourse(code: string) {
      return map.get(code);
    },
    getSchedule: () => undefined as any,
    getCoursesByDiscipline: () => [],
    getAllCourses: () => Array.from(map.values()) as any,
    getAllSchedules: () => [],
  };
}

describe('prerequisites evaluation', () => {
  it('handles simple course prerequisite', () => {
    const node: CoursePrereqNode = { type: 'course', code: 'ADM 1100' };
    const cache = makeMockCache([{ code: 'ADM 1100', credits: 3 }]);
    const ctx = buildPrereqContext(['ADM 1100'], cache);
    expect(meetsCoursePrereq(node, ctx)).toBe(true);

    const ctxMissing = buildPrereqContext([], cache);
    expect(meetsCoursePrereq(node, ctxMissing)).toBe(false);
  });

  it('handles AND of courses', () => {
    const node: CoursePrereqNode = {
      type: 'and_group',
      children: [
        { type: 'course', code: 'ECO 1502' },
        { type: 'course', code: 'ECO 1504' },
      ],
    };
    const cache = makeMockCache([
      { code: 'ECO 1502', credits: 3 },
      { code: 'ECO 1504', credits: 3 },
    ]);
    const ctxOk = buildPrereqContext(['ECO 1502', 'ECO 1504'], cache);
    expect(meetsCoursePrereq(node, ctxOk)).toBe(true);

    const ctxPartial = buildPrereqContext(['ECO 1502'], cache);
    expect(meetsCoursePrereq(node, ctxPartial)).toBe(false);
  });

  it('handles OR of course and credits', () => {
    const node: CoursePrereqNode = {
      type: 'or_group',
      children: [
        { type: 'course', code: 'ANT 1101' },
        { type: 'non_course', text: '18 university units', credits: 18 },
      ],
    };
    const cache = makeMockCache([{ code: 'ANT 1101', credits: 3 }]);

    const ctxCourse = buildPrereqContext(['ANT 1101'], cache);
    expect(meetsCoursePrereq(node, ctxCourse)).toBe(true);

    const cache2 = makeMockCache([
      { code: 'AAA 1001', credits: 9 },
      { code: 'AAA 1002', credits: 9 },
    ]);
    const ctxCredits = buildPrereqContext(['AAA 1001', 'AAA 1002'], cache2);
    expect(meetsCoursePrereq(node, ctxCredits)).toBe(true);
  });

  it('handles discipline-scoped credit thresholds', () => {
    const node: CoursePrereqNode = {
      type: 'non_course',
      text: '9 course units in anthropology (ANT)',
      credits: 9,
      disciplines: ['ANT'],
    };
    const cache = makeMockCache([
      { code: 'ANT 1101', credits: 3 },
      { code: 'ANT 2103', credits: 6 },
      { code: 'CSI 1101', credits: 3 },
    ]);

    const ctxOk = buildPrereqContext(['ANT 1101', 'ANT 2103'], cache);
    expect(meetsCoursePrereq(node, ctxOk)).toBe(true);

    const ctxWrongDiscipline = buildPrereqContext(['CSI 1101', 'ANT 1101'], cache);
    expect(meetsCoursePrereq(node, ctxWrongDiscipline)).toBe(false);
  });

  it('treats descriptive non_course without credits as non-blocking', () => {
    const node: CoursePrereqNode = {
      type: 'non_course',
      text: 'All 1000-, 2000-, and 3000-level core ADM courses completed',
    };
    const cache = makeMockCache([]);
    const ctx = buildPrereqContext([], cache);
    expect(meetsCoursePrereq(node, ctx)).toBe(true);
  });

  it('canTakeCourse returns true when no prerequisites tree', () => {
    const cache = makeMockCache([{ code: 'ADM 1340', credits: 3 }]);
    const ctx = buildPrereqContext([], cache);
    expect(canTakeCourse('ADM 1340', cache, ctx)).toBe(true);
  });

  it('detects graduate-level courses correctly', () => {
    expect(isGraduateCourse('CRM 5101')).toBe(true);
    expect(isGraduateCourse('CRM5101')).toBe(true);
    expect(isGraduateCourse('CRM 6100')).toBe(true);
    expect(isGraduateCourse('CRM 7100')).toBe(true);
    expect(isGraduateCourse('CRM 8999')).toBe(true);
    expect(isGraduateCourse('CRM 1300')).toBe(false);
    expect(isGraduateCourse('CRM 1700')).toBe(false);
    expect(isGraduateCourse('CRM 1900')).toBe(false);
  });

  it('maps course codes to language buckets from second digit', () => {
    expect(getCourseLanguageBucket('CRM 1300')).toBe('en'); // 1-4 => English
    expect(getCourseLanguageBucket('CRM 1700')).toBe('fr'); // 5-8 => French
    expect(getCourseLanguageBucket('CRM 1900')).toBe('other'); // 0 or 9 => Other
    expect(getCourseLanguageBucket('CRM 0900')).toBe('other');
  });

  it('applies combined filters for graduate and language buckets', () => {
    const filtersNoGradAllLang = {
      levels: ['undergrad'] as const,
      languageBuckets: ['en', 'fr', 'other'] as const,
    };
    expect(courseMatchesFilters('CRM 1300', filtersNoGradAllLang)).toBe(true);
    expect(courseMatchesFilters('CRM 1700', filtersNoGradAllLang)).toBe(true);
    expect(courseMatchesFilters('CRM 1900', filtersNoGradAllLang)).toBe(true);
    expect(courseMatchesFilters('CRM 5101', filtersNoGradAllLang)).toBe(false);

    const filtersFrenchOnly = {
      levels: ['undergrad', 'grad'] as const,
      languageBuckets: ['fr'] as const,
    };
    expect(courseMatchesFilters('CRM 1700', filtersFrenchOnly)).toBe(true);
    expect(courseMatchesFilters('CRM 1300', filtersFrenchOnly)).toBe(false);
    expect(courseMatchesFilters('CRM 1900', filtersFrenchOnly)).toBe(false);
  });

  it('maps course codes to level buckets', () => {
    expect(getCourseLevelBucket('CRM 1300')).toBe('undergrad');
    expect(getCourseLevelBucket('CRM 4999')).toBe('undergrad');
    expect(getCourseLevelBucket('CRM 5101')).toBe('grad');
  });
});

