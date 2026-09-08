import type { CanonicalProfessorName } from "@uoplan/core/brand";
import type { GeneratedSchedule } from "@uoplan/core/src/generation/types";
import { isUnknownInstructorName } from "@uoplan/core/instructorPrediction";
import { normalizeGradeVizDistribution } from "@uoplan/core/gradeDistribution";
import { pickCanonicalProfessorName } from "@uoplan/core/professorIdentity";
import type { ProfessorRatingsMap } from "@uoplan/core/professorRatings";
import {
  getRatingDetailsForInstructors,
  getRatingsForInstructors,
  uniqueInstructors,
} from "@uoplan/core/professorRatings";
import { normalizeCourseCode } from "@uoplan/core/utils/courseUtils";
import { unsafeBrand } from "@uoplan/core/brand";
import type { CalendarEvent } from "./types";

// Em dash is the deliberate "no instructor assigned" display sentinel.
const NO_PROFESSOR = unsafeBrand<CanonicalProfessorName>("—");

/**
 * Optional course-evaluation sentiment maps (1-5), used to surface satisfaction
 * on calendar events. Both are keyed the way `@uoplan/core` produces them
 * (`courseSentimentByNorm` / `professorSentimentByName`).
 */
export interface ScheduleSentiment {
  courseByNorm?: Map<string, number> | null;
  professorByName?: Map<string, number> | null;
}

export function scheduleToEvents(
  schedule: GeneratedSchedule,
  professorRatings: ProfessorRatingsMap | null,
  sentiment?: ScheduleSentiment | null,
): CalendarEvent[] {
  const courseByNorm = sentiment?.courseByNorm ?? null;
  const professorByName = sentiment?.professorByName ?? null;
  return schedule.enrollments.flatMap((enrollment, enrollIdx) => {
    const aggregateDistribution: Record<string, number> = {};
    for (const { section } of Object.values(enrollment.sectionCombo)) {
      const distribution = section.distribution;
      if (!distribution) continue;
      for (const [grade, countRaw] of Object.entries(distribution)) {
        const count = Number(countRaw);
        if (!Number.isFinite(count) || count <= 0) continue;
        aggregateDistribution[grade] = (aggregateDistribution[grade] ?? 0) + count;
      }
    }
    const gradeViz = normalizeGradeVizDistribution(aggregateDistribution);

    const courseSentiment = courseByNorm
      ? (courseByNorm.get(normalizeCourseCode(enrollment.courseCode)) ?? null)
      : null;

    const out: CalendarEvent[] = [];
    let timeIdx = 0;

    for (const [comp, { section }] of Object.entries(enrollment.sectionCombo)) {
      const sectionCode = section.sectionCode ?? section.section ?? "";
      const componentSection = `${comp} - ${sectionCode}`;
      const sectionInstructors = [
        ...new Set(section.times.map((t) => t.instructor).filter((i): i is string => i !== null)),
      ];
      // "Staff"/"TBA"/blank are placeholders, not real instructors — drop them
      // from the display so unassigned sections fall back to predictions.
      const knownInstructors = sectionInstructors.filter((name) => !isUnknownInstructorName(name));
      const professor =
        knownInstructors.length > 0
          ? pickCanonicalProfessorName([knownInstructors.join(", ")])
          : NO_PROFESSOR;
      const ratings = getRatingsForInstructors(sectionInstructors, professorRatings);
      const professorRatingValue =
        ratings.length > 0
          ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
          : null;
      const professorRatingDetails = canonicalizeRatingDetails(
        getRatingDetailsForInstructors(sectionInstructors, professorRatings),
      );
      // Only surface guesses when there is no confirmed instructor.
      const hasKnownInstructor = knownInstructors.length > 0;
      const predictedInstructors =
        !hasKnownInstructor && section.predictedInstructors?.length
          ? section.predictedInstructors.map((p) => ({
              ...p,
              name: pickCanonicalProfessorName([p.name]),
            }))
          : undefined;
      // For predicted sections, the satisfaction signal is the average across
      // the guessed candidates (the section has no confirmed instructor);
      // otherwise it's the average across the confirmed instructor(s).
      const sentimentInstructors = predictedInstructors
        ? predictedInstructors.map((p) => p.name)
        : sectionInstructors;
      const professorSentiment = professorByName
        ? averageSentiment(sentimentInstructors, professorByName)
        : null;
      // Predicted candidates' RMP rating details — only displayed when there is
      // a single guess (a multi-candidate average would be misleading). The
      // satisfaction signal above still pools across all guesses.
      const predictedRatingDetails = predictedInstructors
        ? canonicalizeRatingDetails(
            getRatingDetailsForInstructors(
              predictedInstructors.map((p) => p.name),
              professorRatings,
            ),
          )
        : [];

      for (const t of section.times) {
        if (t.startMinutes >= t.endMinutes) continue;

        out.push({
          id: `${enrollment.courseCode}-${comp}-${timeIdx}`,
          courseCode: enrollment.courseCode,
          enrollmentIndex: enrollIdx,
          day: t.day,
          startMinutes: t.startMinutes,
          endMinutes: t.endMinutes,
          componentSection,
          virtual: Boolean(t.virtual),
          location: t.location?.trim() || null,
          professor,
          professorRatingValue,
          professorRatingDetails,
          courseSentiment,
          professorSentiment,
          ...(predictedInstructors ? { predictedInstructors, predictedRatingDetails } : {}),
          gradeViz,
          meetingDates: t.meetingDates ?? null,
        });
        timeIdx += 1;
      }
    }
    return out;
  });
}

/** Mean course-evaluation sentiment (1-5) across the instructors that have one. */
function averageSentiment(
  instructors: string[],
  professorByName: Map<string, number>,
): number | null {
  let sum = 0;
  let n = 0;
  for (const { key } of uniqueInstructors(instructors)) {
    const value = professorByName.get(key);
    if (value != null && Number.isFinite(value)) {
      sum += value;
      n += 1;
    }
  }
  return n > 0 ? sum / n : null;
}

function canonicalizeRatingDetails(
  details: Array<{
    id?: string;
    legacyId?: number;
    name: string;
    rating: number;
    numRatings: number;
  }>,
): Array<{
  id?: string;
  legacyId?: number;
  name: CanonicalProfessorName;
  rating: number;
  numRatings: number;
}> {
  return details.map((d) => ({ ...d, name: pickCanonicalProfessorName([d.name]) }));
}
