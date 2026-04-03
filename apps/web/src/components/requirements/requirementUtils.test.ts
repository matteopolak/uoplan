import { describe, expect, it } from "vitest";
import type { DataCache } from "schedule";
import type { RequirementWithStatus } from "schedule";
import {
  applyOptionSelections,
  countRequirementIdSlots,
  countSatisfiedTopLevelRoots,
  getConstrainMultiSelectOptions,
  getOptionSecondarySummaryLine,
  partitionIncompleteConstrainRoots,
  pruneOptionSelectionsForClear,
} from "./requirementUtils";

function emptyScheduleCache(): DataCache {
  return {
    getCourse: (code) =>
      ({ code, title: "Test", credits: 3 }) as NonNullable<
        ReturnType<DataCache["getCourse"]>
      >,
    getSchedule: () => undefined,
    getCoursesByDiscipline: () => [],
    getAllCourses: () => [],
    getAllSchedules: () => [],
  };
}

const defaultConstrainCtx = {
  cache: emptyScheduleCache(),
  completedCourses: new Set<string>(),
  prereqEligible: new Set(["SEG 3100"]),
  levelBuckets: ["undergrad", "grad"] as ("undergrad" | "grad")[],
  languageBuckets: ["en", "fr", "other"] as ("en" | "fr" | "other")[],
  electiveLevelBuckets: [1000, 2000, 3000, 4000],
  unassignedCompletedSetNormalized: new Set<string>(),
  allAssignedCoursesNormalized: new Set<string>(),
  includeClosedComponents: false,
  virtualSectionsOnly: false,
  completedOnly: false,
};

describe("countRequirementIdSlots", () => {
  it("counts nested requirement ids once each (no flat-list + extra double count)", () => {
    const tree: RequirementWithStatus[] = [
      {
        type: "options_group",
        title: "Choose",
        complete: false,
        satisfiedBy: [],
        requirementId: "req-0",
        options: [
          {
            type: "and",
            title: "A",
            complete: false,
            satisfiedBy: [],
            options: [
              {
                type: "discipline_elective",
                title: "Narrow",
                complete: false,
                satisfiedBy: [],
                requirementId: "req-0-0-0",
                candidateCourses: ["SEG 3100"],
                creditsNeeded: 3,
              },
            ],
          },
        ],
      },
      {
        type: "free_elective",
        title: "Free",
        complete: false,
        satisfiedBy: [],
        requirementId: "req-1",
        candidateCourses: ["SEG 3100"],
        creditsNeeded: 3,
      },
    ];

    expect(countRequirementIdSlots(tree)).toBe(3);

    const flattened = applyOptionSelections(tree, { "req-0": 0 });
    expect(countRequirementIdSlots(flattened)).toBe(2);
  });
});

describe("pruneOptionSelectionsForClear", () => {
  it("removes the requirement id and descendant req-path keys only", () => {
    const selected = {
      "req-0": 1,
      "req-0-0": 0,
      "req-0-0-1": 2,
      "req-1": 0,
      "req-10": 1,
    };
    expect(pruneOptionSelectionsForClear(selected, "req-0")).toEqual({
      "req-1": 0,
      "req-10": 1,
    });
  });

  it("does not strip req-10 when clearing req-1", () => {
    expect(
      pruneOptionSelectionsForClear(
        { "req-1": 0, "req-10": 1, "req-1-0": 0 },
        "req-1",
      ),
    ).toEqual({ "req-10": 1 });
  });
});

describe("getOptionSecondarySummaryLine", () => {
  it("returns null when there is nothing to show", () => {
    const node: RequirementWithStatus = {
      type: "course",
      title: "X",
      complete: false,
      satisfiedBy: [],
      creditsNeeded: 0,
    };
    expect(getOptionSecondarySummaryLine(node)).toBeNull();
  });

  it("combines credits, pool size, and nested hint", () => {
    const nested: RequirementWithStatus = {
      type: "options_group",
      title: "Nested",
      complete: false,
      satisfiedBy: [],
      requirementId: "n",
      options: [],
    };
    const node: RequirementWithStatus = {
      type: "discipline_elective",
      title: "Elective",
      complete: false,
      satisfiedBy: [],
      creditsNeeded: 6,
      candidateCourses: ["CSI 2101", "CSI 2110", "CSI 2120"],
      options: [nested],
    };
    expect(getOptionSecondarySummaryLine(node)).toBe(
      "6 credits required · 3 possible courses · Further choices below",
    );
  });
});

describe("applyOptionSelections", () => {
  it("flattens when the option group is already complete (engine-resolved branch)", () => {
    const tree: RequirementWithStatus[] = [
      {
        type: "options_group",
        title: "Choose",
        complete: true,
        satisfiedBy: [],
        requirementId: "g",
        satisfiedOptionIndex: 0,
        options: [
          {
            type: "course",
            title: "Leaf",
            complete: false,
            satisfiedBy: [],
            requirementId: "leaf",
            candidateCourses: ["SEG 3100"],
            creditsNeeded: 3,
          },
        ],
      },
    ];
    const out = applyOptionSelections(tree, {});
    expect(out).toHaveLength(1);
    expect(out[0].requirementId).toBe("leaf");
  });

  it("flattens nested option groups when each branch is selected", () => {
    const inner: RequirementWithStatus = {
      type: "options_group",
      requirementId: "inner",
      complete: false,
      satisfiedBy: [],
      options: [
        {
          type: "course",
          title: "Leaf",
          complete: false,
          satisfiedBy: [],
          requirementId: "leaf",
          candidateCourses: ["SEG 3100"],
          creditsNeeded: 3,
        },
      ],
    };
    const outer: RequirementWithStatus = {
      type: "options_group",
      requirementId: "outer",
      complete: false,
      satisfiedBy: [],
      options: [inner],
    };
    const out = applyOptionSelections([outer], { outer: 0, inner: 0 });
    expect(out).toHaveLength(1);
    expect(out[0].requirementId).toBe("leaf");
  });

  it("hoists structural and children so they sit beside siblings in the parent", () => {
    const tree: RequirementWithStatus[] = [
      {
        type: "and",
        complete: false,
        satisfiedBy: [],
        options: [
          {
            type: "free_elective",
            title: "Free",
            complete: false,
            satisfiedBy: [],
            requirementId: "free",
            candidateCourses: ["SEG 3100"],
            creditsNeeded: 3,
          },
          {
            type: "options_group",
            requirementId: "pick",
            complete: false,
            satisfiedBy: [],
            options: [
              {
                type: "and",
                complete: false,
                satisfiedBy: [],
                options: [
                  {
                    type: "course",
                    title: "A",
                    complete: false,
                    satisfiedBy: [],
                    requirementId: "req-a",
                    candidateCourses: ["CSI 1000"],
                    creditsNeeded: 3,
                  },
                  {
                    type: "course",
                    title: "B",
                    complete: false,
                    satisfiedBy: [],
                    requirementId: "req-b",
                    candidateCourses: ["CSI 2000"],
                    creditsNeeded: 3,
                  },
                ],
              },
            ],
          },
        ],
      },
    ];
    const out = applyOptionSelections(tree, { pick: 0 });
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe("and");
    expect(out[0].options ?? []).toHaveLength(3);
    expect(out[0].options!.map((x) => x.requirementId)).toEqual([
      "free",
      "req-a",
      "req-b",
    ]);
  });
});

describe("getConstrainMultiSelectOptions", () => {
  it("returns no options when the term has no schedule for candidates", () => {
    const node: RequirementWithStatus = {
      type: "free_elective",
      title: "Free",
      complete: false,
      satisfiedBy: [],
      requirementId: "req-1",
      candidateCourses: ["SEG 3100"],
      creditsNeeded: 3,
    };
    const { options } = getConstrainMultiSelectOptions(node, {}, defaultConstrainCtx);
    expect(options).toHaveLength(0);
  });

  it("excludes 5000+ courses from elective dropdown options", () => {
    const cacheWithSchedules: DataCache = {
      getCourse: (code) =>
        ({ code, title: "Test", credits: 3 }) as NonNullable<
          ReturnType<DataCache["getCourse"]>
        >,
      getSchedule: (code) =>
        ({
          courseCode: code,
          components: {},
        }) as NonNullable<ReturnType<DataCache["getSchedule"]>>,
      getCoursesByDiscipline: () => [],
      getAllCourses: () => [],
      getAllSchedules: () => [],
    };
    const node: RequirementWithStatus = {
      type: "free_elective",
      title: "Free",
      complete: false,
      satisfiedBy: [],
      requirementId: "req-free",
      candidateCourses: ["SEG 4100", "SEG 5100"],
      creditsNeeded: 3,
    };
    const ctx = {
      ...defaultConstrainCtx,
      cache: cacheWithSchedules,
      prereqEligible: new Set(["SEG 4100", "SEG 5100"]),
    };

    const { options } = getConstrainMultiSelectOptions(node, {}, ctx);
    expect(options.map((o) => o.value)).toEqual(["SEG 4100"]);
  });

  it("exempts explicitly picked electives from virtual-only filtering", () => {
    const schedNonVirtualOnly = {
      subject: "SEG",
      catalogNumber: "3100",
      title: "Test",
      courseCode: "SEG 3100",
      timeZone: "America/Toronto",
      components: {
        LEC: [
          {
            section: "A00",
            sectionCode: "A00",
            component: "LEC",
            session: null,
            times: [
              { day: "Mo", startMinutes: 540, endMinutes: 630, virtual: false },
            ],
            instructors: [],
            meetingDates: null,
            status: "Open",
          },
        ],
      },
    } as NonNullable<ReturnType<DataCache["getSchedule"]>>;

    const cacheWithNonVirtual: DataCache = {
      getCourse: (code) =>
        ({ code, title: "Test", credits: 3 }) as NonNullable<
          ReturnType<DataCache["getCourse"]>
        >,
      getSchedule: (code) => (code === "SEG 3100" ? schedNonVirtualOnly : undefined),
      getCoursesByDiscipline: () => [],
      getAllCourses: () => [],
      getAllSchedules: () => [],
    };

    const node: RequirementWithStatus = {
      type: "free_elective",
      title: "Free",
      complete: false,
      satisfiedBy: [],
      requirementId: "req-1",
      candidateCourses: ["SEG 3100"],
      creditsNeeded: 3,
    };

    const withoutExemptionCtx = {
      ...defaultConstrainCtx,
      cache: cacheWithNonVirtual,
      prereqEligible: new Set(["SEG 3100"]),
      virtualSectionsOnly: true,
      constrainedPerRequirement: {},
    };
    const { options: optionsWithout } = getConstrainMultiSelectOptions(
      node,
      {},
      withoutExemptionCtx,
    );
    expect(optionsWithout.map((o) => o.value)).toHaveLength(0);

    const withExemptionCtx = {
      ...withoutExemptionCtx,
      constrainedPerRequirement: { "req-1": ["SEG 3100"] },
    };
    const { options: optionsWith } = getConstrainMultiSelectOptions(
      node,
      {},
      withExemptionCtx,
    );
    expect(optionsWith.map((o) => o.value)).toEqual(["SEG 3100"]);
  });

  it("does not apply virtual-only filtering to discipline_elective (structured pool)", () => {
    const schedNonVirtualOnly = {
      subject: "SEG",
      catalogNumber: "3100",
      title: "Test",
      courseCode: "SEG 3100",
      timeZone: "America/Toronto",
      components: {
        LEC: [
          {
            section: "A00",
            sectionCode: "A00",
            component: "LEC",
            session: null,
            times: [
              { day: "Mo", startMinutes: 540, endMinutes: 630, virtual: false },
            ],
            instructors: [],
            meetingDates: null,
            status: "Open",
          },
        ],
      },
    } as NonNullable<ReturnType<DataCache["getSchedule"]>>;

    const cacheWithNonVirtual: DataCache = {
      getCourse: (code) =>
        ({ code, title: "Test", credits: 3 }) as NonNullable<
          ReturnType<DataCache["getCourse"]>
        >,
      getSchedule: (code) => (code === "SEG 3100" ? schedNonVirtualOnly : undefined),
      getCoursesByDiscipline: () => [],
      getAllCourses: () => [],
      getAllSchedules: () => [],
    };

    const node: RequirementWithStatus = {
      type: "discipline_elective",
      title: "Discipline elective",
      complete: false,
      satisfiedBy: [],
      requirementId: "req-de",
      candidateCourses: ["SEG 3100"],
      creditsNeeded: 3,
    };

    const ctx = {
      ...defaultConstrainCtx,
      cache: cacheWithNonVirtual,
      prereqEligible: new Set(["SEG 3100"]),
      virtualSectionsOnly: true,
      constrainedPerRequirement: {},
    };
    const { options } = getConstrainMultiSelectOptions(node, {}, ctx);
    expect(options.map((o) => o.value)).toEqual(["SEG 3100"]);
  });
});

describe("partitionIncompleteConstrainRoots", () => {
  it("keeps or_group without a branch selection in primary", () => {
    const tree: RequirementWithStatus[] = [
      {
        type: "or_group",
        title: "Pick branch",
        complete: false,
        satisfiedBy: [],
        requirementId: "req-or",
        options: [
          {
            type: "free_elective",
            title: "A",
            complete: false,
            satisfiedBy: [],
            requirementId: "req-a",
            candidateCourses: ["SEG 3100"],
            creditsNeeded: 3,
          },
        ],
      },
    ];
    const { primary, collapsed } = partitionIncompleteConstrainRoots(
      tree,
      {},
      {},
      defaultConstrainCtx,
    );
    expect(primary).toHaveLength(1);
    expect(collapsed).toHaveLength(0);
  });

  it("moves an and to collapsed when every constrain dropdown pool is empty", () => {
    const tree: RequirementWithStatus[] = [
      {
        type: "and",
        title: "Both",
        complete: false,
        satisfiedBy: [],
        options: [
          {
            type: "free_elective",
            title: "E1",
            complete: false,
            satisfiedBy: [],
            requirementId: "req-e1",
            candidateCourses: ["SEG 3100"],
            creditsNeeded: 3,
          },
          {
            type: "free_elective",
            title: "E2",
            complete: false,
            satisfiedBy: [],
            requirementId: "req-e2",
            candidateCourses: ["SEG 3101"],
            creditsNeeded: 3,
          },
        ],
      },
    ];
    const ctx = {
      ...defaultConstrainCtx,
      prereqEligible: new Set(["SEG 3100", "SEG 3101"]),
    };
    const { primary, collapsed } = partitionIncompleteConstrainRoots(
      tree,
      {},
      {},
      ctx,
    );
    expect(primary).toHaveLength(0);
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0].rootIndex).toBe(0);
  });

  it("collapses pick when every child has an empty pool (no parent requirementId)", () => {
    const tree: RequirementWithStatus[] = [
      {
        type: "pick",
        title: "Pick",
        complete: false,
        satisfiedBy: [],
        options: [
          {
            type: "free_elective",
            requirementId: "a",
            candidateCourses: ["SEG 3100"],
            creditsNeeded: 3,
            complete: false,
            satisfiedBy: [],
          },
          {
            type: "free_elective",
            requirementId: "b",
            candidateCourses: ["SEG 3101"],
            creditsNeeded: 3,
            complete: false,
            satisfiedBy: [],
          },
        ],
      },
    ];
    const ctx = {
      ...defaultConstrainCtx,
      prereqEligible: new Set<string>(),
    };
    const { primary, collapsed } = partitionIncompleteConstrainRoots(
      tree,
      {},
      {},
      ctx,
    );
    expect(primary).toHaveLength(0);
    expect(collapsed).toHaveLength(1);
  });

  it("collapses pick when the parent card has requirementId and an empty dropdown pool", () => {
    const tree: RequirementWithStatus[] = [
      {
        type: "pick",
        title: "Pool",
        complete: false,
        satisfiedBy: [],
        requirementId: "pick-root",
        candidateCourses: ["SEG 9999"],
        creditsNeeded: 3,
        options: [
          {
            type: "section",
            title: "Note",
            complete: false,
            satisfiedBy: [],
          },
        ],
      },
    ];
    const ctx = {
      ...defaultConstrainCtx,
      prereqEligible: new Set<string>(),
    };
    const { primary, collapsed } = partitionIncompleteConstrainRoots(
      tree,
      {},
      {},
      ctx,
    );
    expect(primary).toHaveLength(0);
    expect(collapsed).toHaveLength(1);
  });
});

describe("countSatisfiedTopLevelRoots", () => {
  it("uses top-level roots only (denominator = roots.length)", () => {
    const roots: RequirementWithStatus[] = [
      {
        type: "course",
        title: "A",
        complete: true,
        satisfiedBy: ["ESL 2100"],
        requirementId: "req-0",
        candidateCourses: [],
        creditsNeeded: 0,
        options: [],
      },
      {
        type: "free_elective",
        title: "Free",
        complete: false,
        satisfiedBy: [],
        requirementId: "req-1",
        candidateCourses: [],
        creditsNeeded: 3,
        options: [],
      },
    ];
    expect(countSatisfiedTopLevelRoots(roots, {}, null)).toBe(1);
  });

  it("counts assignment-satisfied electives without double-counting nested line items", () => {
    const roots: RequirementWithStatus[] = [
      {
        type: "free_elective",
        title: "Free",
        complete: false,
        satisfiedBy: [],
        requirementId: "req-1",
        candidateCourses: [],
        creditsNeeded: 3,
        options: [],
      },
    ];
    expect(
      countSatisfiedTopLevelRoots(roots, { "req-1": ["SEG 3100"] }, null),
    ).toBe(1);
  });
});
