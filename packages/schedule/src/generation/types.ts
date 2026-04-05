import type { ComponentSection, DayOfWeek } from 'schemas';
import type { ProfessorRatingsMap } from '../professorRatings';

export interface TimeSlot {
  day: DayOfWeek;
  startMinutes: number;
  endMinutes: number;
}

export interface CourseEnrollment {
  courseCode: string;
  sectionCombo: SectionCombo;
  times: TimeSlot[];
}

export interface SectionCombo {
  [component: string]: { section: ComponentSection };
}

export interface GeneratedSchedule {
  enrollments: CourseEnrollment[];
}

export interface GenerationConstraints {
  minStartMinutes: number;
  maxEndMinutes: number;
  allowedDays: DayOfWeek[];
  minProfessorRating?: number;
  professorRatings?: ProfessorRatingsMap;
  /** Max credits from 1000-level courses allowed in the schedule (48 - already completed). */
  maxFirstYearCredits?: number;
  /** If true, each day may have at most one gap between classes, and that gap must be ≤ 90 minutes. */
  compressedSchedule?: boolean;
}

export interface PrecomputedCombo {
  combo: SectionCombo;
  enrollment: CourseEnrollment;
}
