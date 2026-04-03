import { describe, it, expect } from 'vitest';
import {
  applyLatestAliasesToMergedCourses,
  buildDataCache,
  normalizeCourseCode,
  removeMergedCoursesSupersededByAliases,
} from '../dataCache';
import type { Catalogue } from 'schemas';
import type { SchedulesData } from 'schemas';

const minimalCatalogue: Catalogue = {
  courses: [
    { code: 'AMM 5101', title: 'Theory of Elasticity', credits: 3, description: '', component: 'Lecture' },
    { code: 'AMM 5168', title: 'Industrial Organization', credits: 3, description: '', component: 'Lecture' },
    { code: 'ENG 1100', title: 'Literature', credits: 3, description: '', component: 'Lecture' },
    { code: 'ENG 2100', title: 'Writing', credits: 3, description: '', component: 'Lecture' },
  ],
  programs: [],
};

const minimalSchedules: SchedulesData = {
  termId: '2261',
  schedules: [
    {
      subject: 'AMM',
      catalogNumber: '5168',
      courseCode: 'AMM 5168',
      title: 'Industrial Organization',
      timeZone: 'America/Toronto',
      components: {
        LEC: [
          {
            section: 'M00-LEC',
            sectionCode: 'M00',
            component: 'LEC',
            session: null,
            times: [{ day: 'Tu', startMinutes: 510, endMinutes: 680, virtual: false }],
            instructors: ['Jamel-Eddine Cherbib'],
            meetingDates: ['2026-01-12', '2026-04-15'],
            status: 'Open',
          },
        ],
      },
    },
  ],
};

describe('normalizeCourseCode', () => {
  it('normalizes "AMM 5101" and "AMM5101" to same key', () => {
    expect(normalizeCourseCode('AMM 5101')).toBe('AMM 5101');
    expect(normalizeCourseCode('AMM5101')).toBe('AMM 5101');
    expect(normalizeCourseCode('amm 5101')).toBe('AMM 5101');
  });
});

describe('buildDataCache', () => {
  const cache = buildDataCache(minimalCatalogue, minimalSchedules);

  it('getCourse resolves both "AMM 5101" and "AMM5101" to same course', () => {
    const a = cache.getCourse('AMM 5101');
    const b = cache.getCourse('AMM5101');
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(a).toBe(b);
    expect(a?.code).toBe('AMM 5101');
  });

  it('getSchedule returns schedule for scheduled course', () => {
    const s = cache.getSchedule('AMM 5168');
    expect(s).toBeDefined();
    expect(s?.courseCode).toBe('AMM 5168');
  });

  it('getSchedule returns undefined for non-scheduled course', () => {
    const s = cache.getSchedule('AMM 5101');
    expect(s).toBeUndefined();
  });

  it('getCoursesByDiscipline returns only ENG-prefixed courses', () => {
    const eng = cache.getCoursesByDiscipline('ENG');
    expect(eng).toHaveLength(2);
    expect(eng.every((c) => c.code.startsWith('ENG'))).toBe(true);
  });

  it('getCoursesByDiscipline returns empty for unknown discipline', () => {
    const xyz = cache.getCoursesByDiscipline('XYZ');
    expect(xyz).toEqual([]);
  });
});

describe('applyLatestAliasesToMergedCourses', () => {
  const latestSta = {
    code: 'STA 2100',
    title: 'Introduction to Statistics',
    credits: 3,
    description: '',
    aliases: ['MAT 2375'],
  };
  const yearSta = {
    code: 'STA 2100',
    title: 'Introduction to Statistics',
    credits: 3,
    description: '',
  };

  it('copies aliases from the latest catalogue row onto merged course objects', () => {
    const merged = applyLatestAliasesToMergedCourses([latestSta], [yearSta]);
    expect(merged).toHaveLength(1);
    expect(merged[0].aliases).toEqual(['MAT 2375']);
  });

  it('leaves merged courses unchanged when latest has no aliases field', () => {
    const latestNoAlias = { ...latestSta };
    delete (latestNoAlias as { aliases?: string[] }).aliases;
    const merged = applyLatestAliasesToMergedCourses([latestNoAlias], [yearSta]);
    expect(merged[0].aliases).toBeUndefined();
  });
});

describe('removeMergedCoursesSupersededByAliases', () => {
  const latestSta = {
    code: 'STA 2100',
    title: 'Introduction to Statistics',
    credits: 3,
    description: '',
    aliases: ['MAT 2375'],
  };
  const legacyMat = {
    code: 'MAT 2375',
    title: 'Old title',
    credits: 3,
    description: '',
  };

  it('drops merged rows whose code is only an alias on the latest catalogue', () => {
    const merged = [legacyMat, latestSta];
    const out = removeMergedCoursesSupersededByAliases([latestSta], merged);
    expect(out.map((c) => c.code)).toEqual(['STA 2100']);
  });

  it('keeps courses that are not listed as aliases on latest', () => {
    const other = {
      code: 'MAT 1341',
      title: 'Calculus',
      credits: 3,
      description: '',
    };
    const out = removeMergedCoursesSupersededByAliases([latestSta], [other, latestSta]);
    expect(out.map((c) => c.code).sort()).toEqual(['MAT 1341', 'STA 2100']);
  });
});
