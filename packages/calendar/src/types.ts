import type {
  CanonicalProfessorName,
  DayOfWeek as DayOfWeekCode,
  GradeVizData,
} from "@uoplan/core";

export type { DayOfWeekCode };

export interface CalendarEvent {
  id: string;
  courseCode: string;
  enrollmentIndex: number;
  day: DayOfWeekCode;
  startMinutes: number;
  endMinutes: number;
  componentSection: string;
  virtual: boolean;
  /** Per-meeting room/location supplied by an imported official schedule. */
  location?: string | null;
  professor: CanonicalProfessorName;
  professorRatingValue?: number | null;
  professorRatingDetails?: Array<{
    id?: string;
    legacyId?: number;
    name: CanonicalProfessorName;
    rating: number;
    numRatings: number;
  }>;
  /**
   * Course-evaluation satisfaction (1-5), blended across the course's sections —
   * available for nearly every course, so it's the primary quality signal on the
   * calendar. `null` when the course has no scale feedback.
   */
  courseSentiment?: number | null;
  /**
   * Course-evaluation satisfaction (1-5) averaged across this section's
   * instructor(s), or `null` when none of them have scale feedback.
   */
  professorSentiment?: number | null;
  /**
   * Build-time guess of instructors, present only when the section has no known
   * instructor. Informational only — never used for ratings or generation.
   */
  predictedInstructors?: Array<{ name: CanonicalProfessorName; legacyId?: number | null }>;
  /**
   * RateMyProfessors rating details for the predicted candidates that have a
   * rating (same shape as `professorRatingDetails`). Only meaningful to display
   * when there is a single predicted instructor — a multi-candidate average is
   * misleading. Informational only — never used for ratings or generation.
   */
  predictedRatingDetails?: Array<{
    id?: string;
    legacyId?: number;
    name: CanonicalProfessorName;
    rating: number;
    numRatings: number;
  }>;
  gradeViz?: GradeVizData | null;
  meetingDates?: [string, string] | null;
}
