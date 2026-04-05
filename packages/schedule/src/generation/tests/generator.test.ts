import { describe, expect, it } from 'vitest';
import type { DataCache } from '../../dataCache';
import { generateSchedules, generateSchedulesWithPinned } from '../generator';
import type { GenerationConstraints, CourseEnrollment } from '../types';
import type { Course, CourseSchedule } from 'schemas';

describe('generator', () => {
  // Setup a mock cache for tests
  const mockSchedules: Record<string, CourseSchedule> = {
    'CSI2110': {
      subject: 'CSI', catalogNumber: '2110', courseCode: 'CSI2110', title: 'DS', timeZone: 'EST',
      components: {
        'LEC': [
          { section: 'A', sectionCode: 'A00', component: 'LEC', session: null, status: null, instructors: [], meetingDates: null, times: [{ startMinutes: 600, endMinutes: 690, day: 'Mo', virtual: false }, { startMinutes: 600, endMinutes: 690, day: 'We', virtual: false }] },
          { section: 'B', sectionCode: 'B00', component: 'LEC', session: null, status: null, instructors: [], meetingDates: null, times: [{ startMinutes: 900, endMinutes: 990, day: 'Tu', virtual: false }, { startMinutes: 900, endMinutes: 990, day: 'Th', virtual: false }] }
        ],
        'DGD': [
          { section: 'A', sectionCode: 'A01', component: 'DGD', session: null, status: null, instructors: [], meetingDates: null, times: [{ startMinutes: 720, endMinutes: 810, day: 'Fr', virtual: false }] },
          { section: 'A', sectionCode: 'A02', component: 'DGD', session: null, status: null, instructors: [], meetingDates: null, times: [{ startMinutes: 840, endMinutes: 930, day: 'Fr', virtual: false }] }
        ]
      }
    },
    'SEG2105': {
      subject: 'SEG', catalogNumber: '2105', courseCode: 'SEG2105', title: 'SE', timeZone: 'EST',
      components: {
        'LEC': [
          { section: 'A', sectionCode: 'A00', component: 'LEC', session: null, status: null, instructors: [], meetingDates: null, times: [{ startMinutes: 600, endMinutes: 690, day: 'Mo', virtual: false }] },
          { section: 'B', sectionCode: 'B00', component: 'LEC', session: null, status: null, instructors: [], meetingDates: null, times: [{ startMinutes: 1020, endMinutes: 1110, day: 'Mo', virtual: false }] }
        ],
        'TUT': [
          { section: 'A', sectionCode: 'A01', component: 'TUT', session: null, status: null, instructors: [], meetingDates: null, times: [{ startMinutes: 900, endMinutes: 990, day: 'We', virtual: false }] }
        ]
      }
    },
    'MAT1341': {
      subject: 'MAT', catalogNumber: '1341', courseCode: 'MAT1341', title: 'LinAlg', timeZone: 'EST',
      components: {
        'LEC': [
          { section: 'A', sectionCode: 'A00', component: 'LEC', session: null, status: null, instructors: [], meetingDates: null, times: [{ startMinutes: 480, endMinutes: 570, day: 'Mo', virtual: false }] }
        ]
      }
    },
    'SEG4910': {
      subject: 'SEG', catalogNumber: '4910', courseCode: 'SEG4910', title: 'Honours', timeZone: 'EST',
      components: {}
    }
  };

  const mockCourses = {
    'CSI2110': { code: 'CSI2110', credits: 3 },
    'SEG2105': { code: 'SEG2105', credits: 3 },
    'MAT1341': { code: 'MAT1341', credits: 3 },
    'SEG4910': { code: 'SEG4910', credits: 3, component: 'honours' }
  };

  const mockCache = {
    getSchedule: (code: string) => mockSchedules[code],
    getCourse: (code: string) => mockCourses[code as keyof typeof mockCourses] as Course,
  } as unknown as DataCache;

  describe('generateSchedules', () => {
    it('generates valid schedules without overlaps', () => {
      const schedules = generateSchedules(['CSI2110', 'SEG2105'], 2, mockCache);
      
      // Combinations:
      // CSI2110 A (LEC Mo/We 600-690) + DGD A01
      // CSI2110 A (LEC Mo/We 600-690) + DGD A02
      // CSI2110 B (LEC Tu/Th 900-990)
      // 
      // SEG2105 A (LEC Mo 600-690) + TUT A01 -> Overlaps with CSI2110 A
      // SEG2105 B (LEC Mo 1020-1110)

      // Expected valid combinations (size 2):
      // Combinations of CSI2110 (2 LEC * 2 DGD) = 4
      // Combinations of SEG2105 (2 LEC * 1 TUT) = 2
      // Total 8 combos.
      // Overlaps: CSI2110 LEC A (Mo 600-690) overlaps SEG2105 LEC A (Mo 600-690)
      // This invalidates 2 combos. Leaving 6.
      
      expect(schedules.length).toBe(6);

      // Ensure every generated schedule has exactly 2 enrollments
      for (const s of schedules) {
        expect(s.enrollments.length).toBe(2);
      }
    });

    it('returns empty if target count cannot be reached', () => {
      // We only provide 2 courses, but ask for 3
      const schedules = generateSchedules(['CSI2110', 'SEG2105'], 3, mockCache);
      expect(schedules.length).toBe(0);
    });

    it('supports constraints (e.g. time filters)', () => {
      const constraints: GenerationConstraints = {
        minStartMinutes: 0,
        maxEndMinutes: 1000, // Excludes SEG2105 B (ends 1110)
        allowedDays: ['Mo', 'Tu', 'We', 'Th', 'Fr']
      };
      
      const schedules = generateSchedules(['CSI2110', 'SEG2105'], 2, mockCache, constraints);
      
      // With maxEndMinutes = 1000, SEG2105 B is filtered out.
      // We are left with SEG2105 A.
      // But SEG2105 A overlaps with CSI2110 A.
      // So only CSI2110 B (with DGD A01 or A02) + SEG2105 A is valid.
      expect(schedules.length).toBe(2);
      expect(schedules[0].enrollments.find(e => e.courseCode === 'CSI2110')?.sectionCombo['LEC']?.section.section).toBe('B');
      expect(schedules[0].enrollments.find(e => e.courseCode === 'SEG2105')?.sectionCombo['LEC']?.section.section).toBe('A');
    });

    it('handles honours projects as stub combinations', () => {
      const schedules = generateSchedules(['CSI2110', 'SEG4910'], 2, mockCache);
      
      // CSI2110 has 4 combinations.
      // SEG4910 has 1 stub combination since it's an honours project (no schedule data).
      // Total 4 schedules.
      expect(schedules.length).toBe(4);
      const honoursEnrollment = schedules[0].enrollments.find(e => e.courseCode === 'SEG4910');
      expect(honoursEnrollment).toBeDefined();
    });
  });

  describe('generateSchedulesWithPinned', () => {
    it('forces inclusion of pinned courses', () => {
      const pinned = ['SEG2105'];
      const optional = ['CSI2110', 'MAT1341'];
      // Request target of 2 courses total (1 pinned + 1 optional)
      const schedules = generateSchedulesWithPinned(pinned, optional, 2, mockCache);
      
      // Pinned must be in all schedules
      for (const s of schedules) {
        expect(s.enrollments.find((e: CourseEnrollment) => e.courseCode === 'SEG2105')).toBeDefined();
      }
    });

    it('returns empty if pinned courses already exceed target', () => {
      const schedules = generateSchedulesWithPinned(['CSI2110', 'SEG2105'], ['MAT1341'], 1, mockCache);
      expect(schedules.length).toBe(0);
    });

    it('returns empty if pinned course has no valid sections', () => {
      // Adding a fake pinned course not in cache
      const schedules = generateSchedulesWithPinned(['FAKE1000'], ['MAT1341'], 1, mockCache);
      expect(schedules.length).toBe(0);
    });

    it('finds combinations properly when pinned overlaps some optional', () => {
      // Pinned: SEG2105 A (with time constraints limiting it to A only)
      const constraints: GenerationConstraints = {
        minStartMinutes: 0,
        maxEndMinutes: 1000,
        allowedDays: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
      };
      const schedules = generateSchedulesWithPinned(['SEG2105'], ['CSI2110'], 2, mockCache, constraints);
      
      // Only SEG2105 A is valid due to constraints.
      // CSI2110 A overlaps. So only CSI2110 B (with 2 DGDs) works.
      expect(schedules.length).toBe(2);
      expect(schedules[0].enrollments.length).toBe(2);
      expect(schedules[0].enrollments.find((e: CourseEnrollment) => e.courseCode === 'CSI2110')?.sectionCombo['LEC']?.section.section).toBe('B');
      expect(schedules[0].enrollments.find((e: CourseEnrollment) => e.courseCode === 'SEG2105')?.sectionCombo['LEC']?.section.section).toBe('A');
    });

    it('falls back to standard generateSchedules if pinned is empty', () => {
      const schedulesWithPinnedEmpty = generateSchedulesWithPinned([], ['CSI2110', 'SEG2105'], 2, mockCache);
      const standardSchedules = generateSchedules(['CSI2110', 'SEG2105'], 2, mockCache);
      expect(schedulesWithPinnedEmpty.length).toBe(standardSchedules.length);
    });
  });
});
