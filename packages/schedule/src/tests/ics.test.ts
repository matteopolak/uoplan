import { describe, it, expect } from 'vitest';
import { buildScheduleIcs } from '../ics';
import type { GeneratedSchedule } from '../generation';
import type { DataCache } from '../dataCache';

describe('buildScheduleIcs', () => {
  it('creates weekly recurring events with bounded UNTIL and escapes fields', () => {
    const sched: GeneratedSchedule = {
      enrollments: [
        {
          courseCode: 'CSI 2132',
          times: [{ day: 'Mo', startMinutes: 540, endMinutes: 600 }],
          sectionCombo: {
            LEC: {
              section: {
                section: 'A00-LEC',
                sectionCode: 'A00',
                component: 'LEC',
                session: null,
                times: [{ day: 'Mo', startMinutes: 540, endMinutes: 600, virtual: false }],
                instructors: ['Prof, Name; Jr'],
                meetingDates: null,
                status: null,
              },
            },
          },
        },
      ],
    };

    const cache: DataCache = {
      getCourse: (code) => {
        if (code === 'CSI 2132') {
          return {
            code: 'CSI 2132',
            title: 'Data Structures, Algorithms',
            credits: 3,
            description: '',
            component: 'Lecture',
          };
        }
        return undefined;
      },
      getSchedule: () => undefined,
      getCoursesByDiscipline: () => [],
      getAllCourses: () => [],
      getAllSchedules: () => [],
    };

    const ics = buildScheduleIcs({
      schedule: sched,
      cache,
      startDate: '2026-01-12', // Monday
      endDate: '2026-04-15',
    });

    expect(ics).toContain('BEGIN:VCALENDAR\r\n');
    expect(ics).toContain('BEGIN:VEVENT\r\n');
    expect(ics).toContain('RRULE:FREQ=WEEKLY;UNTIL=20260415T000000Z\r\n');
    expect(ics).toContain('DTSTART;TZID=America/Toronto:20260112T090000\r\n');
    expect(ics).toContain('DTEND;TZID=America/Toronto:20260112T100000\r\n');
    expect(ics).toContain('SUMMARY:CSI 2132\r\n');
    // Commas/semicolons must be escaped in DESCRIPTION; allow iCalendar line-folding.
    expect(ics).toContain(
      'DESCRIPTION:Course: Data Structures\\, Algorithms\\nProf: Prof\\, Name\\; Jr\\n'
    );
    expect(ics).toContain('ection: LEC - A00\r\n');
    expect(ics).toContain('END:VCALENDAR\r\n');
  });
});

