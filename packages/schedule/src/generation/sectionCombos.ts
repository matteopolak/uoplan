import type { ComponentSection, CourseSchedule } from 'schemas';
import type { DataCache } from '../dataCache';
import { isSectionAllowedByMinRating } from '../professorRatings';
import { isHonoursProject, normalizeCourseCode } from '../utils/courseUtils';
import { timeSlotSatisfiesConstraints } from './constraints';
import { timesOverlap } from './overlaps';
import type { CourseEnrollment, GenerationConstraints, SectionCombo, TimeSlot } from './types';

export function collectTimes(sections: ComponentSection[]): TimeSlot[] {
  const times: TimeSlot[] = [];
  for (const s of sections) {
    for (const t of s.times) {
      if (t.startMinutes < t.endMinutes) {
        times.push({
          day: t.day,
          startMinutes: t.startMinutes,
          endMinutes: t.endMinutes,
        });
      }
    }
  }
  return times;
}

export function cartesianProduct<T>(arrays: T[][]): T[][] {
  if (arrays.length === 0) return [[]];
  const [first, ...rest] = arrays;
  const restProduct = cartesianProduct(rest);
  const result: T[][] = [];
  for (const item of first) {
    for (const combo of restProduct) {
      result.push([item, ...combo]);
    }
  }
  return result;
}

/** True if the section has at least one real time slot (used to skip TST/other components with empty times). */
export function sectionHasTimes(section: ComponentSection): boolean {
  return (
    Array.isArray(section.times) &&
    section.times.some((t) => t.startMinutes < t.endMinutes)
  );
}

export function getValidSectionCombos(
  schedule: CourseSchedule,
  constraints?: GenerationConstraints
): SectionCombo[] {
  const componentKeys = Object.keys(schedule.components).sort();
  const sectionArrays = componentKeys.map((key) => {
    const sections = schedule.components[key] ?? [];
    return sections.filter((section) => {
      if (!sectionHasTimes(section)) return false;
      if (!constraints) return true;
      return isSectionAllowedByMinRating({
        instructors: section.instructors,
        minRating: constraints.minProfessorRating,
        professorRatings: constraints.professorRatings,
      });
    });
  });

  if (sectionArrays.some((arr) => arr.length === 0)) {
    return [];
  }

  const allCombos = cartesianProduct(sectionArrays);
  const valid: SectionCombo[] = [];

  for (const combo of allCombos) {
    const sections = combo;
    const times = collectTimes(sections);
    if (
      constraints &&
      !times.every((t) => timeSlotSatisfiesConstraints(t, constraints))
    ) {
      continue;
    }
    let hasOverlap = false;
    for (let i = 0; i < times.length; i++) {
      for (let j = i + 1; j < times.length; j++) {
        if (timesOverlap(times[i], times[j])) {
          hasOverlap = true;
          break;
        }
      }
      if (hasOverlap) break;
    }
    if (!hasOverlap) {
      const obj: SectionCombo = {};
      componentKeys.forEach((key, idx) => {
        obj[key] = { section: sections[idx] };
      });
      valid.push(obj);
    }
  }

  return valid;
}

export function getEnrollmentsForCourse(
  schedule: CourseSchedule,
  sectionCombo: SectionCombo
): CourseEnrollment {
  const sections = Object.values(sectionCombo).map((x) => x.section);
  const times = collectTimes(sections);
  return {
    courseCode: schedule.courseCode,
    sectionCombo,
    times,
  };
}

export function canonicalCourseCode(code: string, cache: DataCache): string {
  return cache.getCourse(normalizeCourseCode(code))?.code ?? code;
}

export function enrollmentForPicker(
  code: string,
  combo: SectionCombo,
  cache: DataCache,
): CourseEnrollment {
  if (isHonoursProject(code, cache)) {
    return {
      courseCode: canonicalCourseCode(code, cache),
      sectionCombo: combo,
      times: [],
    };
  }
  const schedule = cache.getSchedule(code);
  if (!schedule) {
    return { courseCode: code, sectionCombo: combo, times: [] };
  }
  return getEnrollmentsForCourse(schedule, combo);
}
