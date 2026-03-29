import { describe, it, expect } from 'vitest';
import type { Course, CoursePrereqNode } from 'schemas';
import type { DataCache } from '../dataCache';
import {
  buildPrereqContext,
  canTakeCourse,
  meetsCoursePrereq,
  prerequisitesContainNonCourse,
} from '../prerequisites';
import {
  CourseFilters,
  courseMatchesFilters,
  getCourseLanguageBucket,
  getCourseLevelBucket,
  isGraduateCourse,
} from '../courseFilters';

function makeMockCache(
  courses: Array<{
    code: string;
    credits: number;
    discipline?: string;
    prerequisites?: CoursePrereqNode;
  }>,
): DataCache {
  const map = new Map<string, { code: string; credits: number; component?: string; prerequisites?: CoursePrereqNode }>();
  for (const c of courses) {
    map.set(c.code, { code: c.code, credits: c.credits, prerequisites: c.prerequisites });
  }
  return {
    getCourse(code: string) {
      return map.get(code) as Course;
    },
    getSchedule: () => undefined as any,
    getCoursesByDiscipline: () => [],
    getAllCourses: () => Array.from(map.values()) as any,
    getAllSchedules: () => [],
  };
}

describe('prerequisitesContainNonCourse', () => {
  it('is false when tree has only course/or/and nodes', () => {
    const node: CoursePrereqNode = {
      type: 'and_group',
      children: [{ type: 'course', code: 'CSI 2101' }],
    };
    expect(prerequisitesContainNonCourse(node)).toBe(false);
    expect(prerequisitesContainNonCourse(undefined)).toBe(false);
  });

  it('is true when tree includes non_course', () => {
    const node: CoursePrereqNode = {
      type: 'or_group',
      children: [
        { type: 'course', code: 'CSI 3105' },
        { type: 'non_course', text: 'fourth-year standing' },
      ],
    };
    expect(prerequisitesContainNonCourse(node)).toBe(true);
  });
});

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

  it('non_course without credits is never satisfiable', () => {
    const node: CoursePrereqNode = {
      type: 'non_course',
      text: 'All 1000-, 2000-, and 3000-level core ADM courses completed',
    };
    const cache = makeMockCache([]);
    const ctx = buildPrereqContext([], cache);
    expect(meetsCoursePrereq(node, ctx)).toBe(false);
  });

  it('merged discipline credit pool with disciplineLevels needs sum at allowed levels', () => {
    const merged: CoursePrereqNode = {
      type: 'non_course',
      credits: 18,
      disciplines: ['CSI', 'SEG'],
      disciplineLevels: [
        { discipline: 'CSI', levels: [3000, 4000] },
        { discipline: 'SEG', levels: [3000, 4000] },
      ],
      text: '18 units in (CSI) or (SEG) at level',
    };
    const cache = makeMockCache([
      { code: 'CSI 4900', credits: 3, prerequisites: merged },
    ]);
    expect(canTakeCourse('CSI 4900', cache, buildPrereqContext([], cache))).toBe(false);
    const six = Array.from({ length: 6 }, (_, i) => ({
      code: `CSI ${3001 + i}`,
      credits: 3,
    }));
    const cacheOk = makeMockCache([
      ...six,
      { code: 'CSI 4900', credits: 3, prerequisites: merged },
    ]);
    expect(
      canTakeCourse(
        'CSI 4900',
        cacheOk,
        buildPrereqContext(
          six.map((c) => c.code),
          cacheOk,
        ),
      ),
    ).toBe(true);
  });

  it('disciplineLevels exclude credits outside listed levels', () => {
    const node: CoursePrereqNode = {
      type: 'non_course',
      credits: 18,
      disciplines: ['CSI', 'SEG'],
      disciplineLevels: [
        { discipline: 'CSI', levels: [3000, 4000] },
        { discipline: 'SEG', levels: [3000, 4000] },
      ],
      text: 'x',
    };
    const low = Array.from({ length: 6 }, (_, i) => ({
      code: `CSI ${1001 + i}`,
      credits: 3,
    }));
    const cache = makeMockCache([
      ...low,
      { code: 'CSI 4900', credits: 3, prerequisites: node },
    ]);
    expect(
      canTakeCourse(
        'CSI 4900',
        cache,
        buildPrereqContext(
          low.map((c) => c.code),
          cache,
        ),
      ),
    ).toBe(false);
  });

  it('levels-only non_course counts credits at those course levels', () => {
    const node: CoursePrereqNode = {
      type: 'non_course',
      credits: 15,
      levels: [5000, 6000, 7000, 8000],
      text: '15 units at grad level',
    };
    const cache = makeMockCache([
      { code: 'AAA 5001', credits: 5 },
      { code: 'AAA 5002', credits: 5 },
      { code: 'AAA 5003', credits: 5 },
      { code: 'X 9999', credits: 3, prerequisites: node },
    ]);
    const ctx = buildPrereqContext(['AAA 5001', 'AAA 5002', 'AAA 5003'], cache);
    expect(meetsCoursePrereq(node, ctx)).toBe(true);
  });

  it('canTakeCourse returns true when no prerequisites tree', () => {
    const cache = makeMockCache([{ code: 'ADM 1340', credits: 3 }]);
    const ctx = buildPrereqContext([], cache);
    expect(canTakeCourse('ADM 1340', cache, ctx)).toBe(true);
  });

  it('program-filtered node passes when student is in a listed program', () => {
    const node: CoursePrereqNode = {
      type: 'course',
      code: 'GNG 1106',
      programs: ['CEG', 'CSI', 'CTI'],
    };
    const cache = makeMockCache([{ code: 'GNG 1106', credits: 3 }]);
    const ctx = buildPrereqContext(['GNG 1106'], cache, ['CSI']);
    expect(meetsCoursePrereq(node, ctx)).toBe(true);
  });

  it('program-filtered node fails when student is not in a listed program', () => {
    const node: CoursePrereqNode = {
      type: 'course',
      code: 'GNG 1106',
      programs: ['CEG', 'CSI', 'CTI'],
    };
    const cache = makeMockCache([{ code: 'GNG 1106', credits: 3 }]);
    const ctx = buildPrereqContext(['GNG 1106'], cache, ['BIO']);
    expect(meetsCoursePrereq(node, ctx)).toBe(false);
  });

  it('ITI 1121 AST: CEG student with GNG 1106 is eligible', () => {
    // CEG student who has taken GNG 1106 — satisfies the program-filtered or_group
    const iti1121: CoursePrereqNode = {
      type: 'or_group',
      children: [
        {
          type: 'or_group',
          programs: ['CEG', 'CSI', 'CTI'],
          children: [
            { type: 'course', code: 'GNG 1106' },
            { type: 'course', code: 'ITI 1120' },
          ],
        },
        { type: 'course', code: 'ITI 1120' },
      ],
    };
    const cache = makeMockCache([
      { code: 'GNG 1106', credits: 3 },
      { code: 'ITI 1120', credits: 3 },
    ]);
    const ctxCEGwithGNG = buildPrereqContext(['GNG 1106'], cache, ['CEG']);
    expect(meetsCoursePrereq(iti1121, ctxCEGwithGNG)).toBe(true);
  });

  it('ITI 1121 AST: non-CEG/CSI/CTI student with only GNG 1106 is not eligible', () => {
    const iti1121: CoursePrereqNode = {
      type: 'or_group',
      children: [
        {
          type: 'or_group',
          programs: ['CEG', 'CSI', 'CTI'],
          children: [
            { type: 'course', code: 'GNG 1106' },
            { type: 'course', code: 'ITI 1120' },
          ],
        },
        { type: 'course', code: 'ITI 1120' },
      ],
    };
    const cache = makeMockCache([
      { code: 'GNG 1106', credits: 3 },
      { code: 'ITI 1120', credits: 3 },
    ]);
    const ctxOtherWithGNG = buildPrereqContext(['GNG 1106'], cache, ['BIO']);
    expect(meetsCoursePrereq(iti1121, ctxOtherWithGNG)).toBe(false);
  });

  it('ITI 1121 AST: any student with ITI 1120 is eligible', () => {
    const iti1121: CoursePrereqNode = {
      type: 'or_group',
      children: [
        {
          type: 'or_group',
          programs: ['CEG', 'CSI', 'CTI'],
          children: [
            { type: 'course', code: 'GNG 1106' },
            { type: 'course', code: 'ITI 1120' },
          ],
        },
        { type: 'course', code: 'ITI 1120' },
      ],
    };
    const cache = makeMockCache([
      { code: 'GNG 1106', credits: 3 },
      { code: 'ITI 1120', credits: 3 },
    ]);
    // BIO student with ITI 1120 — satisfies the fallback course
    const ctxOtherWithITI = buildPrereqContext(['ITI 1120'], cache, ['BIO']);
    expect(meetsCoursePrereq(iti1121, ctxOtherWithITI)).toBe(true);

    // No-program student with ITI 1120
    const ctxNoProgramWithITI = buildPrereqContext(['ITI 1120'], cache);
    expect(meetsCoursePrereq(iti1121, ctxNoProgramWithITI)).toBe(true);
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
      levels: ['undergrad'],
      languageBuckets: ['en', 'fr', 'other'],
    } satisfies CourseFilters;
    expect(courseMatchesFilters('CRM 1300', filtersNoGradAllLang)).toBe(true);
    expect(courseMatchesFilters('CRM 1700', filtersNoGradAllLang)).toBe(true);
    expect(courseMatchesFilters('CRM 1900', filtersNoGradAllLang)).toBe(true);
    expect(courseMatchesFilters('CRM 5101', filtersNoGradAllLang)).toBe(false);

    const filtersFrenchOnly = {
      levels: ['undergrad', 'grad'],
      languageBuckets: ['fr'],
    } satisfies CourseFilters;
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

