import type { Course, Catalogue } from '../schemas/catalogue';
import type { CourseSchedule, SchedulesData } from '../schemas/schedules';

/** Normalize course code for consistent lookup (e.g. "AMM 5101" and "AMM5101" -> same key) */
export function normalizeCourseCode(code: string): string {
  const match = code.match(/^([A-Z]{3,4})\s*(\d{4,5}[A-Z]?)$/i);
  if (!match) return code.trim();
  return `${match[1].toUpperCase()} ${match[2]}`;
}

export interface DataCache {
  getCourse(code: string): Course | undefined;
  getSchedule(code: string): CourseSchedule | undefined;
  getCoursesByDiscipline(discipline: string): Course[];
  getAllCourses(): Course[];
  getAllSchedules(): CourseSchedule[];
}

function isStageWorkTermCourse(course: Course): boolean {
  const component = course.component?.trim().toLowerCase() ?? '';
  return component.startsWith('stage / work term');
}

export function buildDataCache(catalogue: Catalogue, schedulesData: SchedulesData): DataCache {
  const courseMap = new Map<string, Course>();
  const scheduleMap = new Map<string, CourseSchedule>();
  const disciplineMap = new Map<string, Course[]>();
  const eligibleCourses: Course[] = [];

  for (const course of catalogue.courses) {
    const key = normalizeCourseCode(course.code);
    courseMap.set(key, course);

    if (isStageWorkTermCourse(course)) {
      continue;
    }

    eligibleCourses.push(course);

    const subject = course.code.split(/\s+/)[0]?.toUpperCase() ?? '';
    if (subject) {
      const list = disciplineMap.get(subject) ?? [];
      list.push(course);
      disciplineMap.set(subject, list);
    }
  }

  for (const schedule of schedulesData.schedules) {
    const key = normalizeCourseCode(schedule.courseCode);
    scheduleMap.set(key, schedule);
  }

  return {
    getCourse(code: string): Course | undefined {
      return courseMap.get(normalizeCourseCode(code));
    },
    getSchedule(code: string): CourseSchedule | undefined {
      return scheduleMap.get(normalizeCourseCode(code));
    },
    getCoursesByDiscipline(discipline: string): Course[] {
      const key = discipline.toUpperCase().trim();
      return disciplineMap.get(key) ?? [];
    },
    getAllCourses(): Course[] {
      return eligibleCourses;
    },
    getAllSchedules(): CourseSchedule[] {
      return schedulesData.schedules;
    },
  };
}
