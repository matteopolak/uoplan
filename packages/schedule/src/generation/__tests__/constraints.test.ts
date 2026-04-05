import { describe, expect, it } from 'vitest';
import { timeSlotSatisfiesConstraints, satisfiesCompressedConstraint } from '../constraints';
import type { CourseEnrollment, GenerationConstraints, TimeSlot } from '../types';

describe('constraints', () => {
  it('timeSlotSatisfiesConstraints respects time bounds and allowed days', () => {
    const c: GenerationConstraints = {
      minStartMinutes: 480, // 8:00
      maxEndMinutes: 1020, // 17:00
      allowedDays: ['Mo', 'Tu']
    };
    
    const valid: TimeSlot = { day: 'Mo', startMinutes: 500, endMinutes: 600 };
    expect(timeSlotSatisfiesConstraints(valid, c)).toBe(true);

    const wrongDay: TimeSlot = { day: 'We', startMinutes: 500, endMinutes: 600 };
    expect(timeSlotSatisfiesConstraints(wrongDay, c)).toBe(false);

    const tooEarly: TimeSlot = { day: 'Mo', startMinutes: 400, endMinutes: 500 };
    expect(timeSlotSatisfiesConstraints(tooEarly, c)).toBe(false);

    const tooLate: TimeSlot = { day: 'Mo', startMinutes: 1000, endMinutes: 1100 };
    expect(timeSlotSatisfiesConstraints(tooLate, c)).toBe(false);
  });

  it('satisfiesCompressedConstraint allows at most one gap <= 90 mins', () => {
    const validEnrollments: CourseEnrollment[] = [
      {
        courseCode: 'A',
        sectionCombo: {},
        times: [
          { day: 'Mo', startMinutes: 600, endMinutes: 690 }, // 10:00 - 11:30
          { day: 'Mo', startMinutes: 720, endMinutes: 810 }, // 12:00 - 13:30 (30 min gap)
        ]
      }
    ];
    expect(satisfiesCompressedConstraint(validEnrollments)).toBe(true);

    const tooLongGap: CourseEnrollment[] = [
      {
        courseCode: 'A',
        sectionCombo: {},
        times: [
          { day: 'Mo', startMinutes: 600, endMinutes: 690 }, // 10:00 - 11:30
          { day: 'Mo', startMinutes: 800, endMinutes: 890 }, // 13:20 - 14:50 (110 min gap)
        ]
      }
    ];
    expect(satisfiesCompressedConstraint(tooLongGap)).toBe(false);

    const tooManyGaps: CourseEnrollment[] = [
      {
        courseCode: 'A',
        sectionCombo: {},
        times: [
          { day: 'Mo', startMinutes: 600, endMinutes: 690 }, // 10:00 - 11:30
          { day: 'Mo', startMinutes: 720, endMinutes: 810 }, // 12:00 - 13:30 (30 min gap)
          { day: 'Mo', startMinutes: 840, endMinutes: 930 }, // 14:00 - 15:30 (30 min gap)
        ]
      }
    ];
    expect(satisfiesCompressedConstraint(tooManyGaps)).toBe(false);
  });
});
