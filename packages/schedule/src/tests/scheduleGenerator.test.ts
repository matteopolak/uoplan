import { describe, it, expect } from 'vitest';
import {
  enrollmentsOverlap,
  generateSchedules,
  generateSchedulesWithPinned,
  getEnrollmentsForCourse,
  getValidSectionCombos,
} from '../scheduleGenerator';
import { buildDataCache } from '../dataCache';
import type { Catalogue } from 'schemas';
import type { SchedulesData, CourseSchedule, DayOfWeek } from 'schemas';

const emptyCatalogue: Catalogue = { courses: [], programs: [] };

function makeSchedule(
  courseCode: string,
  times: { day: DayOfWeek; start: number; end: number }[]
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
          })),
          instructors: [],
          meetingDates: null,
          status: null,
        },
      ],
    },
  };
}

describe('enrollmentsOverlap', () => {
  it('returns true for same-day overlapping times', () => {
    const sched = makeSchedule('A 1000', [{ day: 'Mo', start: 480, end: 570 }]);
    const a = getEnrollmentsForCourse(sched, { LEC: { section: sched.components.LEC[0] } });
    const sched2 = makeSchedule('B 2000', [{ day: 'Mo', start: 510, end: 600 }]);
    const b = getEnrollmentsForCourse(sched2, { LEC: { section: sched2.components.LEC[0] } });
    expect(enrollmentsOverlap(a, b)).toBe(true);
  });

  it('returns false for different days', () => {
    const sched = makeSchedule('A 1000', [{ day: 'Mo', start: 480, end: 570 }]);
    const a = getEnrollmentsForCourse(sched, { LEC: { section: sched.components.LEC[0] } });
    const sched2 = makeSchedule('B 2000', [{ day: 'Tu', start: 480, end: 570 }]);
    const b = getEnrollmentsForCourse(sched2, { LEC: { section: sched2.components.LEC[0] } });
    expect(enrollmentsOverlap(a, b)).toBe(false);
  });

  it('returns false for non-overlapping times same day', () => {
    const sched = makeSchedule('A 1000', [{ day: 'Mo', start: 480, end: 570 }]);
    const a = getEnrollmentsForCourse(sched, { LEC: { section: sched.components.LEC[0] } });
    const sched2 = makeSchedule('B 2000', [{ day: 'Mo', start: 600, end: 690 }]);
    const b = getEnrollmentsForCourse(sched2, { LEC: { section: sched2.components.LEC[0] } });
    expect(enrollmentsOverlap(a, b)).toBe(false);
  });

  it('returns false for enrollment with empty times', () => {
    const sched = makeSchedule('A 1000', [{ day: 'Mo', start: 480, end: 570 }]);
    const a = getEnrollmentsForCourse(sched, { LEC: { section: sched.components.LEC[0] } });
    const sched2: CourseSchedule = {
      ...makeSchedule('B 2000', []),
      components: {
        REC: [
          {
            section: 'S00',
            sectionCode: 'S00',
            component: 'REC',
            session: null,
            times: [],
            instructors: [],
            meetingDates: null,
            status: null,
          },
        ],
      },
    };
    const b = getEnrollmentsForCourse(sched2, { REC: { section: sched2.components.REC[0] } });
    expect(enrollmentsOverlap(a, b)).toBe(false);
  });
});

describe('getValidSectionCombos', () => {
  it('returns combos for course with LEC + DGD, excluding overlapping pairs', () => {
    const sched: CourseSchedule = {
      subject: 'ADM',
      catalogNumber: '1305',
      courseCode: 'ADM 1305',
      title: null,
      timeZone: 'America/Toronto',
      components: {
        LEC: [
          {
            section: 'M00-LEC',
            sectionCode: 'M00',
            component: 'LEC',
            session: null,
            times: [{ day: 'Mo', startMinutes: 1050, endMinutes: 1130 }],
            instructors: [],
            meetingDates: null,
            status: null,
          },
        ],
        DGD: [
          {
            section: 'M01-DGD',
            sectionCode: 'M01',
            component: 'DGD',
            session: null,
            times: [{ day: 'Th', startMinutes: 1050, endMinutes: 1130 }],
            instructors: [],
            meetingDates: null,
            status: null,
          },
          {
            section: 'M02-DGD',
            sectionCode: 'M02',
            component: 'DGD',
            session: null,
            times: [{ day: 'Mo', startMinutes: 1050, endMinutes: 1130 }],
            instructors: [],
            meetingDates: null,
            status: null,
          },
        ],
      },
    };
    const combos = getValidSectionCombos(sched);
    expect(combos.length).toBeGreaterThanOrEqual(1);
    const comboWithM02 = combos.find((c) => c.DGD?.section.sectionCode === 'M02');
    const comboWithM01 = combos.find((c) => c.DGD?.section.sectionCode === 'M01');
    expect(comboWithM01).toBeDefined();
    expect(comboWithM02).toBeUndefined();
  });

  it('treats empty allowedDays as Mon–Fri so clearing the day filter does not exclude all sections', () => {
    const sched = makeSchedule("X 1000", [{ day: "Mo", start: 480, end: 570 }]);
    const combos = getValidSectionCombos(sched, {
      minStartMinutes: 0,
      maxEndMinutes: 24 * 60,
      allowedDays: [],
    });
    expect(combos.length).toBeGreaterThanOrEqual(1);
  });
});

describe('generateSchedules', () => {
  it('returns at least 1 valid schedule for non-overlapping courses', () => {
    const schedulesData: SchedulesData = {
      termId: '2261',
      schedules: [
        makeSchedule('A 1000', [{ day: 'Mo', start: 480, end: 570 }]),
        makeSchedule('B 2000', [{ day: 'Tu', start: 480, end: 570 }]),
        makeSchedule('C 3000', [{ day: 'We', start: 480, end: 570 }]),
      ],
    };
    const cache = buildDataCache(emptyCatalogue, schedulesData);
    const result = generateSchedules(['A 1000', 'B 2000', 'C 3000'], 3, cache);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].enrollments).toHaveLength(3);
  });

  it('stops at max schedules cap', () => {
    const schedulesData: SchedulesData = {
      termId: '2261',
      schedules: [
        makeSchedule('A 1000', [{ day: 'Mo', start: 480, end: 570 }]),
        makeSchedule('B 2000', [{ day: 'Tu', start: 480, end: 570 }]),
        makeSchedule('C 3000', [{ day: 'We', start: 480, end: 570 }]),
        makeSchedule('D 4000', [{ day: 'Th', start: 480, end: 570 }]),
        makeSchedule('E 5000', [{ day: 'Fr', start: 480, end: 570 }]),
      ],
    };
    const cache = buildDataCache(emptyCatalogue, schedulesData);
    const result = generateSchedules(
      ['A 1000', 'B 2000', 'C 3000', 'D 4000', 'E 5000'],
      2,
      cache
    );
    expect(result.length).toBeLessThanOrEqual(150);
  });

  it('returns empty when fewer courses than targetCount have schedules', () => {
    const schedulesData: SchedulesData = {
      termId: '2261',
      schedules: [makeSchedule('A 1000', [{ day: 'Mo', start: 480, end: 570 }])],
    };
    const cache = buildDataCache(emptyCatalogue, schedulesData);
    const result = generateSchedules(['A 1000', 'B 2000'], 2, cache);
    expect(result).toHaveLength(0);
  });

  it('treats honours project (*900) as having no fixed meeting times', () => {
    const catalogue: Catalogue = {
      courses: [
        {
          code: 'CSI 4900',
          title: 'Honours project',
          credits: 6,
          description: '',
          component: 'LEC',
        },
      ],
      programs: [],
    };
    const schedulesData: SchedulesData = {
      termId: '2261',
      schedules: [
        makeSchedule('A 1000', [{ day: 'Mo', start: 480, end: 570 }]),
        makeSchedule('B 2000', [{ day: 'Tu', start: 480, end: 570 }]),
      ],
    };
    const cache = buildDataCache(catalogue, schedulesData);
    const result = generateSchedules(['CSI 4900', 'A 1000', 'B 2000'], 3, cache);
    expect(result.length).toBeGreaterThanOrEqual(1);
    const codes = result[0].enrollments.map((e) => e.courseCode);
    expect(codes).toContain('CSI 4900');
    const honours = result[0].enrollments.find((e) => e.courseCode === 'CSI 4900');
    expect(honours?.times).toEqual([]);
  });
});

describe('generateSchedulesWithPinned', () => {
  it('allows honours pinned courses without timetable sections', () => {
    const catalogue: Catalogue = {
      courses: [
        {
          code: 'CSI 4900',
          title: 'Honours project',
          credits: 6,
          description: '',
          component: 'LEC',
        },
      ],
      programs: [],
    };
    const schedulesData: SchedulesData = {
      termId: '2261',
      schedules: [makeSchedule('A 1000', [{ day: 'Mo', start: 480, end: 570 }])],
    };
    const cache = buildDataCache(catalogue, schedulesData);
    const result = generateSchedulesWithPinned(
      ['CSI 4900'],
      ['A 1000'],
      2,
      cache,
    );
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].enrollments).toHaveLength(2);
    const honours = result[0].enrollments.find((e) => e.courseCode === 'CSI 4900');
    expect(honours?.times).toEqual([]);
  });
});
