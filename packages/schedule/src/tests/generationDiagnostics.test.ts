import { describe, it, expect } from 'vitest';
import { diagnoseTimetableFailure } from '../generationDiagnostics';
import { buildDataCache } from '../dataCache';
import type { Catalogue } from 'schemas';
import type { SchedulesData, CourseSchedule, DayOfWeek } from 'schemas';

const emptyCatalogue: Catalogue = { courses: [], programs: [] };

function makeSchedule(
  courseCode: string,
  times: { day: DayOfWeek; start: number; end: number }[],
): CourseSchedule {
  return {
    subject: courseCode.split(' ')[0],
    catalogNumber: courseCode.split(' ')[1],
    courseCode,
    title: null,
    timeZone: 'America/Toronto',
    components: {
      LEC: [
        {
          section: 'M00',
          sectionCode: 'M00',
          component: 'LEC',
          session: null,
          times: times.map((t) => ({
            day: t.day,
            startMinutes: t.start,
            endMinutes: t.end,
            virtual: false,
          })),
          instructors: [],
          meetingDates: null,
          status: null,
        },
      ],
    },
  };
}

describe('diagnoseTimetableFailure', () => {
  it('classifies too_few when not enough courses have timetable data', () => {
    const schedulesData: SchedulesData = {
      termId: '2261',
      schedules: [makeSchedule('A 1000', [{ day: 'Mo', start: 480, end: 570 }])],
    };
    const cache = buildDataCache(emptyCatalogue, schedulesData);
    const d = diagnoseTimetableFailure({
      pinnedCourseCodes: [],
      optionalCourseCodes: ['A 1000', 'B 2000'],
      targetCount: 2,
      cache,
    });
    expect(d.kind).toBe('too_few_courses_with_combos');
    expect(d.eligibleCourseCount).toBe(1);
    expect(d.coursesWithNoCombo.length).toBeGreaterThanOrEqual(1);
  });

  it('classifies no_section_combos when every course lacks valid sections', () => {
    const schedulesData: SchedulesData = {
      termId: '2261',
      schedules: [],
    };
    const cache = buildDataCache(emptyCatalogue, schedulesData);
    const d = diagnoseTimetableFailure({
      pinnedCourseCodes: [],
      optionalCourseCodes: ['X 1000', 'Y 2000'],
      targetCount: 2,
      cache,
    });
    expect(d.kind).toBe('no_section_combos');
    expect(d.eligibleCourseCount).toBe(0);
  });

  it('classifies no_conflict_free_assignment when combos exist but no non-overlapping schedule', () => {
    const schedulesData: SchedulesData = {
      termId: '2261',
      schedules: [
        makeSchedule('A 1000', [{ day: 'Mo', start: 480, end: 570 }]),
        makeSchedule('B 2000', [{ day: 'Mo', start: 510, end: 600 }]),
      ],
    };
    const cache = buildDataCache(emptyCatalogue, schedulesData);
    const d = diagnoseTimetableFailure({
      pinnedCourseCodes: [],
      optionalCourseCodes: ['A 1000', 'B 2000'],
      targetCount: 2,
      cache,
    });
    expect(d.kind).toBe('no_conflict_free_assignment');
    expect(d.eligibleCourseCount).toBe(2);
    expect(d.suggestions.some((s) => s.includes('Compressed'))).toBe(false);
  });

  it('classifies pinned course with no sections as no_section_combos', () => {
    const schedulesData: SchedulesData = {
      termId: '2261',
      schedules: [makeSchedule('A 1000', [{ day: 'Mo', start: 480, end: 570 }])],
    };
    const cache = buildDataCache(emptyCatalogue, schedulesData);
    const d = diagnoseTimetableFailure({
      pinnedCourseCodes: ['B 2000'],
      optionalCourseCodes: ['A 1000'],
      targetCount: 2,
      cache,
    });
    expect(d.kind).toBe('no_section_combos');
    expect(d.coursesWithNoCombo).toContain('B 2000');
  });

  it('includes compressed schedule in suggestions when no_conflict_free_assignment', () => {
    const schedulesData: SchedulesData = {
      termId: '2261',
      schedules: [
        makeSchedule('A 1000', [{ day: 'Mo', start: 480, end: 570 }]),
        makeSchedule('B 2000', [{ day: 'Mo', start: 510, end: 600 }]),
      ],
    };
    const cache = buildDataCache(emptyCatalogue, schedulesData);
    const d = diagnoseTimetableFailure({
      pinnedCourseCodes: [],
      optionalCourseCodes: ['A 1000', 'B 2000'],
      targetCount: 2,
      cache,
      constraints: {
        minStartMinutes: 8 * 60,
        maxEndMinutes: 22 * 60,
        allowedDays: [],
        compressedSchedule: true,
      },
    });
    expect(d.kind).toBe('no_conflict_free_assignment');
    expect(d.activeConstraintsSummary.compressedSchedule).toBe(true);
    expect(d.suggestions.some((s) => s.includes('Compressed'))).toBe(true);
  });
});
