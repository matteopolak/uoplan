export interface TakenCourse {
  code: string;
  credits: number;
  discipline: string;
  /** Thousands digit × 1000 from course code (e.g. CSI 3101 → 3000), or null if unparsable. */
  level: number | null;
}

export interface PrereqContext {
  taken: TakenCourse[];
  totalCredits: number;
  disciplineCredits: Record<string, number>;
  studentPrograms: string[];
}
