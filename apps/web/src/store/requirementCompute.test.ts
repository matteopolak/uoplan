import { describe, expect, it } from "vitest";
import type { Catalogue, Program } from "schemas";
import type { SchedulesData } from "schemas";
import { buildDataCache } from "schedule";
import { recomputeStateForProgram } from "./requirementCompute";

const emptySchedules: SchedulesData = { termId: "2261", schedules: [] };

function mkCourse(
  code: string,
  overrides?: Partial<{ credits: number; component: string }>,
) {
  return {
    code,
    title: code,
    credits: overrides?.credits ?? 3,
    description: "",
    component: overrides?.component ?? "Cours magistral / Lecture",
  };
}

/** Honours CS–style overlap: narrow CSI 4000 bucket vs broader pick (CSI/SEG 3000–4000). */
const overlappingElectivesCatalogue: Catalogue = {
  courses: [
    mkCourse("CSI 3120"),
    mkCourse("CSI 4120"),
    mkCourse("SEG 3100"),
  ],
  programs: [],
};

const overlappingProgram: Program = {
  title: "Test overlap",
  url: "https://example.com",
  requirements: [
    {
      type: "discipline_elective",
      title: "12 optional course units in CSI at 4000 level",
      credits: 12,
      disciplineLevels: [{ discipline: "CSI", levels: [4000] }],
    },
    {
      type: "pick",
      title: "3 optional course units in CSI or SEG at 3000 or 4000 level",
      credits: 3,
      options: [
        {
          type: "discipline_elective",
          title: "Any CSI at 3000 or 4000 level",
          disciplineLevels: [{ discipline: "CSI", levels: [3000, 4000] }],
        },
        {
          type: "discipline_elective",
          title: "Any SEG at 3000 or 4000 level",
          disciplineLevels: [{ discipline: "SEG", levels: [3000, 4000] }],
        },
      ],
    },
  ],
};

describe("recomputeStateForProgram single-candidate schedule handling", () => {
  it("does not auto-assign the only schedulable candidate when no courses are completed", () => {
    const catalogue: Catalogue = {
      courses: [mkCourse("ENG 1100")],
      programs: [],
    };
    const schedulesData: SchedulesData = {
      termId: "2261",
      schedules: [
        {
          subject: "ENG",
          catalogNumber: "1100",
          courseCode: "ENG 1100",
          title: "Literature",
          timeZone: "America/Toronto",
          components: {
            LEC: [
              {
                section: "A00-LEC",
                sectionCode: "A00",
                component: "LEC",
                session: null,
                times: [{ day: "Mo", startMinutes: 480, endMinutes: 570, virtual: false }],
                instructors: ["TBA"],
                meetingDates: ["2026-01-12", "2026-04-15"],
                status: "Open",
              },
            ],
          },
        },
      ],
    };
    const cache = buildDataCache(catalogue, schedulesData);
    const program: Program = {
      title: "One fixed course",
      url: "https://example.com",
      requirements: [{ type: "course", code: "ENG 1100", credits: 3 }],
    };

    const state = recomputeStateForProgram(
      program,
      null,
      [],
      cache,
      {},
      {},
      ["undergrad"],
      ["en", "other"],
      false,
      ["ENG"],
      {},
    );

    expect(state.selectedPerRequirement).toEqual({});
  });
});

describe("recomputeStateForProgram completed-course auto-assignment", () => {
  it("prefers the narrower CSI-4000 elective over the broader pick for a CSI 4xxx course (MRV fills pick with 3xxx first)", () => {
    const cache = buildDataCache(overlappingElectivesCatalogue, emptySchedules);
    const state = recomputeStateForProgram(
      overlappingProgram,
      null,
      ["CSI 3120", "CSI 4120"],
      cache,
      {},
      {},
      ["undergrad"],
      ["en", "other"],
      false,
      ["CSI"],
      {},
    );

    expect(state.unassignedCompletedCourses).toEqual([]);

    const narrow = state.selectedPerRequirement["req-0"] ?? [];
    const pick = state.selectedPerRequirement["req-1"] ?? [];

    expect(narrow.map((c) => c.replace(/\s+/g, " ").trim())).toContain(
      "CSI 4120",
    );
    expect(pick.map((c) => c.replace(/\s+/g, " ").trim())).toContain(
      "CSI 3120",
    );
  });

  it("assigns SEG 3000 to a narrow elective inside a selected options_group branch, not only a top-level free elective", () => {
    const catalogue: Catalogue = {
      courses: [
        mkCourse("SEG 3100"),
        mkCourse("ENG 1100"),
      ],
      programs: [],
    };
    const cache = buildDataCache(catalogue, emptySchedules);

    const program: Program = {
      title: "Options + free",
      url: "https://example.com",
      requirements: [
        {
          type: "options_group",
          title: "Choose track",
          options: [
            {
              type: "and",
              options: [
                {
                  type: "discipline_elective",
                  title: "SEG 3000",
                  credits: 3,
                  disciplineLevels: [{ discipline: "SEG", levels: [3000] }],
                },
              ],
            },
            {
              type: "and",
              options: [
                {
                  type: "course",
                  code: "ENG 1100",
                  credits: 3,
                },
              ],
            },
          ],
        },
        {
          type: "free_elective",
          title: "Free",
          credits: 3,
        },
      ],
    };

    const state = recomputeStateForProgram(
      program,
      null,
      ["SEG 3100"],
      cache,
      {},
      { "req-0": 0 },
      ["undergrad"],
      ["en", "other"],
      false,
      ["SEG"],
      {},
    );

    expect(state.unassignedCompletedCourses).toEqual([]);
    expect(
      (state.selectedPerRequirement["req-0-0-0"] ?? []).some((c) =>
        c.replace(/\s+/g, " ").trim().includes("SEG 3100"),
      ),
    ).toBe(true);
    expect(state.selectedPerRequirement["req-1"] ?? []).toEqual([]);
  });

  it("moves a course off a broad free elective after an options_group branch becomes selected (no user-touched slots)", () => {
    const catalogue: Catalogue = {
      courses: [mkCourse("SEG 3100"), mkCourse("ENG 1100")],
      programs: [],
    };
    const cache = buildDataCache(catalogue, emptySchedules);

    const program: Program = {
      title: "Options + free",
      url: "https://example.com",
      requirements: [
        {
          type: "options_group",
          title: "Choose track",
          options: [
            {
              type: "and",
              options: [
                {
                  type: "discipline_elective",
                  title: "SEG 3000",
                  credits: 3,
                  disciplineLevels: [{ discipline: "SEG", levels: [3000] }],
                },
              ],
            },
            {
              type: "and",
              options: [
                { type: "course", code: "ENG 1100", credits: 3 },
              ],
            },
          ],
        },
        {
          type: "free_elective",
          title: "Free",
          credits: 3,
        },
      ],
    };

    const beforeOption = recomputeStateForProgram(
      program,
      null,
      ["SEG 3100"],
      cache,
      {},
      {},
      ["undergrad"],
      ["en", "other"],
      false,
      ["SEG"],
      {},
    );

    expect(
      (beforeOption.selectedPerRequirement["req-1"] ?? []).some((c) =>
        c.replace(/\s+/g, " ").trim().includes("SEG 3100"),
      ),
    ).toBe(true);

    const afterOption = recomputeStateForProgram(
      program,
      null,
      ["SEG 3100"],
      cache,
      beforeOption.selectedPerRequirement,
      { "req-0": 0 },
      ["undergrad"],
      ["en", "other"],
      false,
      ["SEG"],
      {},
    );

    expect(
      (afterOption.selectedPerRequirement["req-0-0-0"] ?? []).some((c) =>
        c.replace(/\s+/g, " ").trim().includes("SEG 3100"),
      ),
    ).toBe(true);
    expect(afterOption.selectedPerRequirement["req-1"] ?? []).toEqual([]);
  });
});
