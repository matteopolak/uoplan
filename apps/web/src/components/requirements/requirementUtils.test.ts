import { describe, expect, it } from "vitest";
import type { RequirementWithStatus } from "schedule";
import {
  applyOptionSelections,
  countRequirementIdSlots,
  countSatisfiedTopLevelRoots,
  getOptionSecondarySummaryLine,
  pruneOptionSelectionsForClear,
} from "./requirementUtils";

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
