import type { Course, Catalogue } from 'schemas';
import type { CourseSchedule, SchedulesData } from 'schemas';
import { normalizeCourseCode, isWorkTermCourse } from './utils/courseUtils';

// Re-export for backwards compatibility
export { normalizeCourseCode } from './utils/courseUtils';

export interface DataCache {
  getCourse(code: string): Course | undefined;
  getSchedule(code: string): CourseSchedule | undefined;
  getCoursesByDiscipline(discipline: string): Course[];
  getAllCourses(): Course[];
  getAllSchedules(): CourseSchedule[];
}

// Use the centralized utility
const isStageWorkTermCourse = isWorkTermCourse;

/**
 * Wrap an existing DataCache with additional courses (e.g. OPT transfer credit stubs).
 * Extra courses are included in getCourse, getCoursesByDiscipline, and getAllCourses.
 */
export function withExtraCourses(base: DataCache, courses: Course[]): DataCache {
  const extra = new Map<string, Course>();
  const byDiscipline = new Map<string, Course[]>();

  for (const course of courses) {
    const key = normalizeCourseCode(course.code);
    extra.set(key, course);
    const discipline = course.code.split(/\s+/)[0]?.toUpperCase() ?? '';
    if (discipline) {
      const list = byDiscipline.get(discipline) ?? [];
      list.push(course);
      byDiscipline.set(discipline, list);
    }
  }

  return {
    getCourse(code) {
      return base.getCourse(code) ?? extra.get(normalizeCourseCode(code));
    },
    getSchedule(code) {
      return base.getSchedule(code);
    },
    getCoursesByDiscipline(discipline) {
      const key = discipline.toUpperCase().trim();
      return [...base.getCoursesByDiscipline(discipline), ...(byDiscipline.get(key) ?? [])];
    },
    getAllCourses() {
      return [...base.getAllCourses(), ...extra.values()];
    },
    getAllSchedules() {
      return base.getAllSchedules();
    },
  };
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
