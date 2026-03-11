import {
  filterScheduleExcludingClosed,
  getEffectiveSchedule,
} from './scheduleFilters';
import type { CourseSchedule } from '../schemas/schedules';
import type { DataCache } from './dataCache';
import { describe, it, expect } from 'vitest';

function makeSchedule(components: CourseSchedule['components']): CourseSchedule {
  return {
    subject: 'CSI',
    catalogNumber: '1234',
    courseCode: 'CSI 1234',
    title: 'Test',
    timeZone: 'America/Toronto',
    components,
  };
}

describe('filterScheduleExcludingClosed', () => {
  it('returns same schedule when all sections are open or non-closed', () => {
    const sched = makeSchedule({
      LEC: [
        {
          section: 'A00',
          sectionCode: 'A00',
          component: 'LEC',
          session: null,
          times: [{ day: 'Mo', startMinutes: 540, endMinutes: 630 }],
          instructors: [],
          meetingDates: null,
          status: 'Open',
        },
      ],
    });
    const out = filterScheduleExcludingClosed(sched);
    expect(out).toBeDefined();
    expect(out?.components.LEC).toHaveLength(1);
    expect(out?.components.LEC[0].status).toBe('Open');
  });

  it('returns undefined when one component has only closed sections', () => {
    const sched = makeSchedule({
      LEC: [
        {
          section: 'A00',
          sectionCode: 'A00',
          component: 'LEC',
          session: null,
          times: [{ day: 'Mo', startMinutes: 540, endMinutes: 630 }],
          instructors: [],
          meetingDates: null,
          status: 'Closed',
        },
      ],
    });
    const out = filterScheduleExcludingClosed(sched);
    expect(out).toBeUndefined();
  });

  it('filters out closed sections and keeps open in same component', () => {
    const sched = makeSchedule({
      LEC: [
        {
          section: 'A00',
          sectionCode: 'A00',
          component: 'LEC',
          session: null,
          times: [{ day: 'Mo', startMinutes: 540, endMinutes: 630 }],
          instructors: [],
          meetingDates: null,
          status: 'Open',
        },
        {
          section: 'A01',
          sectionCode: 'A01',
          component: 'LEC',
          session: null,
          times: [{ day: 'Tu', startMinutes: 540, endMinutes: 630 }],
          instructors: [],
          meetingDates: null,
          status: 'Closed',
        },
      ],
    });
    const out = filterScheduleExcludingClosed(sched);
    expect(out).toBeDefined();
    expect(out?.components.LEC).toHaveLength(1);
    expect(out?.components.LEC[0].sectionCode).toBe('A00');
  });

  it('returns undefined when one of multiple components ends up empty', () => {
    const sched = makeSchedule({
      LEC: [
        {
          section: 'A00',
          sectionCode: 'A00',
          component: 'LEC',
          session: null,
          times: [{ day: 'Mo', startMinutes: 540, endMinutes: 630 }],
          instructors: [],
          meetingDates: null,
          status: 'Open',
        },
      ],
      TUT: [
        {
          section: 'T01',
          sectionCode: 'T01',
          component: 'TUT',
          session: null,
          times: [{ day: 'We', startMinutes: 540, endMinutes: 630 }],
          instructors: [],
          meetingDates: null,
          status: 'Closed',
        },
      ],
    });
    const out = filterScheduleExcludingClosed(sched);
    expect(out).toBeUndefined();
  });
});

describe('getEffectiveSchedule', () => {
  const schedOpen = makeSchedule({
    LEC: [
      {
        section: 'A00',
        sectionCode: 'A00',
        component: 'LEC',
        session: null,
        times: [{ day: 'Mo', startMinutes: 540, endMinutes: 630 }],
        instructors: [],
        meetingDates: null,
        status: 'Open',
      },
    ],
  });

  it('returns raw schedule when includeClosed is true', () => {
    const cache: DataCache = {
      getCourse: () => undefined,
      getSchedule: () => schedOpen,
      getCoursesByDiscipline: () => [],
      getAllCourses: () => [],
      getAllSchedules: () => [schedOpen],
    };
    const out = getEffectiveSchedule(cache, 'CSI 1234', true);
    expect(out).toBe(schedOpen);
  });

  it('returns undefined when code not in cache', () => {
    const cache: DataCache = {
      getCourse: () => undefined,
      getSchedule: () => undefined,
      getCoursesByDiscipline: () => [],
      getAllCourses: () => [],
      getAllSchedules: () => [],
    };
    const out = getEffectiveSchedule(cache, 'CSI 9999', false);
    expect(out).toBeUndefined();
  });
});
