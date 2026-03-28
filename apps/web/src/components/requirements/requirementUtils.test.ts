import { describe, expect, it } from "vitest";
import type { RequirementWithStatus } from "schedule";
import {
  applyOptionSelections,
  countRequirementIdSlots,
  countSatisfiedTopLevelRoots,
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
