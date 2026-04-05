import { describe, expect, it } from 'vitest';
import { enrollmentsOverlap, timesOverlap } from '../overlaps';
import type { CourseEnrollment, TimeSlot } from '../types';

describe('overlaps', () => {
  it('timesOverlap detects overlapping times on the same day', () => {
    const a: TimeSlot = { day: 'Mo', startMinutes: 600, endMinutes: 700 }; // 10:00 - 11:40
    const b: TimeSlot = { day: 'Mo', startMinutes: 630, endMinutes: 730 }; // 10:30 - 12:10
    expect(timesOverlap(a, b)).toBe(true);
  });

  it('timesOverlap allows adjacent times on the same day', () => {
    const a: TimeSlot = { day: 'Mo', startMinutes: 600, endMinutes: 700 };
    const b: TimeSlot = { day: 'Mo', startMinutes: 700, endMinutes: 800 };
    expect(timesOverlap(a, b)).toBe(false);
  });

  it('timesOverlap ignores different days', () => {
    const a: TimeSlot = { day: 'Mo', startMinutes: 600, endMinutes: 700 };
    const b: TimeSlot = { day: 'Tu', startMinutes: 600, endMinutes: 700 };
    expect(timesOverlap(a, b)).toBe(false);
  });

  it('enrollmentsOverlap checks all time slots in enrollments', () => {
    const e1: CourseEnrollment = {
      courseCode: 'AAA 1000',
      sectionCombo: {},
      times: [
        { day: 'Mo', startMinutes: 600, endMinutes: 700 },
        { day: 'We', startMinutes: 600, endMinutes: 700 },
      ]
    };
    const e2: CourseEnrollment = {
      courseCode: 'BBB 2000',
      sectionCombo: {},
      times: [
        { day: 'Tu', startMinutes: 600, endMinutes: 700 },
        { day: 'We', startMinutes: 650, endMinutes: 750 },
      ]
    };
    expect(enrollmentsOverlap(e1, e2)).toBe(true);
  });
});
