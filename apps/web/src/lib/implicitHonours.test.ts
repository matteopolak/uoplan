import { describe, expect, it } from "vitest";
import type { Course, CourseSchedule } from "schemas";
import type { DataCache } from "schedule";
import type { RemainingRequirement } from "schedule";
import { normalizeCourseCode } from "schedule";
import { collectImplicitHonoursForSchedule } from "./implicitHonours";

function makeCache(schedules: Record<string, CourseSchedule | undefined>): DataCache {
  const courseByNorm = new Map<string, Course>();
  const addCourse = (code: string) => {
    const n = normalizeCourseCode(code);
    courseByNorm.set(n, { code: n, credits: 6 } as Course);
  };
  for (const k of Object.keys(schedules)) {
    addCourse(k);
  }
  addCourse("ABC 4900");
  addCourse("DEF 4900");
  addCourse("CSI 1111");

  return {
    getCourse: (code: string) => courseByNorm.get(normalizeCourseCode(code)),
    getSchedule: (code: string) => schedules[normalizeCourseCode(code)],
    getCoursesByDiscipline: () => [],
    getAllCourses: () => [...courseByNorm.values()],
    getAllSchedules: () =>
      Object.values(schedules).filter((s): s is CourseSchedule => s != null),
  };
}

function req(
  id: string,
  candidates: string[],
): RemainingRequirement {
  return {
    requirementId: id,
    type: "course",
    title: "Test",
    candidateCourses: candidates,
    creditsNeeded: 6,
    satisfiedBy: [],
  };
}

describe("collectImplicitHonoursForSchedule", () => {
  const eligible = new Set(["ABC 4900", "DEF 4900", "CSI 1111"]);
  const completed = new Set<string>();
  const seen = new Set<string>();

  it("infers a single honours candidate when no non-honours course has schedule data", () => {
    const cache = makeCache({
      // honours thesis: no schedule row (like catalogue-only)
    });
    const remaining: RemainingRequirement[] = [req("honours-req", ["ABC 4900"])];
    const picks = collectImplicitHonoursForSchedule(
      remaining,
      {},
      completed,
      eligible,
      cache,
      false,
      false,
      seen,
    );
    expect(picks).toEqual([{ code: "ABC 4900", requirementId: "honours-req" }]);
  });

  it("does not infer when two honours options exist", () => {
    const s = new Set<string>();
    const cache = makeCache({});
    const picks = collectImplicitHonoursForSchedule(
      [req("r", ["ABC 4900", "DEF 4900"])],
      {},
      completed,
      eligible,
      cache,
      false,
      false,
      s,
    );
    expect(picks).toEqual([]);
  });

  it("does not infer when a non-honours candidate has a schedule", () => {
    const s = new Set<string>();
    const sched: CourseSchedule = {
      courseCode: "CSI 1111",
      components: {},
    } as CourseSchedule;
    const cache = makeCache({
      "CSI 1111": sched,
    });
    const picks = collectImplicitHonoursForSchedule(
      [req("r", ["ABC 4900", "CSI 1111"])],
      {},
      completed,
      eligible,
      cache,
      false,
      false,
      s,
    );
    expect(picks).toEqual([]);
  });

  it("skips when the user cleared the requirement assignment", () => {
    const s = new Set<string>();
    const cache = makeCache({});
    const picks = collectImplicitHonoursForSchedule(
      [req("r", ["ABC 4900"])],
      { r: [] },
      completed,
      eligible,
      cache,
      false,
      false,
      s,
    );
    expect(picks).toEqual([]);
  });

  it("skips when the user assigned a non-honours course to the requirement", () => {
    const s = new Set<string>();
    const cache = makeCache({
      "CSI 1111": { courseCode: "CSI 1111", components: {} } as CourseSchedule,
    });
    const picks = collectImplicitHonoursForSchedule(
      [req("r", ["ABC 4900", "CSI 1111"])],
      { r: ["CSI 1111"] },
      completed,
      eligible,
      cache,
      false,
      false,
      s,
    );
    expect(picks).toEqual([]);
  });

  it("does not duplicate when normalized code is already in seenHonours", () => {
    const s = new Set<string>([normalizeCourseCode("ABC 4900")]);
    const cache = makeCache({});
    const picks = collectImplicitHonoursForSchedule(
      [req("r", ["ABC 4900"])],
      {},
      completed,
      eligible,
      cache,
      false,
      false,
      s,
    );
    expect(picks).toEqual([]);
  });
});
