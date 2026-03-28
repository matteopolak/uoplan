import { describe, expect, it } from "vitest";
import {
  buildVisibleStepIndices,
  firstInteractiveStepAfter,
  furthestReachedDisplayIndex,
  getNextStep,
  getPrevStep,
  isWizardStepSkipped,
  normalizeActiveStep,
  skippedWizardStepIsPassed,
} from "./wizardSteps";

describe("buildVisibleStepIndices", () => {
  it("includes options and assign when both needed", () => {
    expect(buildVisibleStepIndices(true, true)).toEqual([
      0, 1, 2, 3, 4, 5, 6,
    ]);
  });

  it("skips options and assign when neither needed", () => {
    expect(buildVisibleStepIndices(false, false)).toEqual([0, 1, 2, 5, 6]);
  });

  it("includes only options when assign not needed", () => {
    expect(buildVisibleStepIndices(true, false)).toEqual([0, 1, 2, 3, 5, 6]);
  });

  it("includes only assign when options not needed", () => {
    expect(buildVisibleStepIndices(false, true)).toEqual([0, 1, 2, 4, 5, 6]);
  });
});

describe("getNextStep / getPrevStep", () => {
  it("jumps from completed to constrain when options and assign skipped", () => {
    expect(getNextStep(2, false, false)).toBe(5);
    expect(getPrevStep(5, false, false)).toBe(2);
  });

  it("goes through assign when only options skipped", () => {
    expect(getNextStep(2, false, true)).toBe(4);
    expect(getNextStep(4, false, true)).toBe(5);
    expect(getPrevStep(4, false, true)).toBe(2);
  });

  it("stays on last step", () => {
    expect(getNextStep(6, true, true)).toBe(6);
  });
});

describe("normalizeActiveStep", () => {
  it("maps skipped options step to constrain or assign", () => {
    expect(normalizeActiveStep(3, false, false)).toBe(5);
    expect(normalizeActiveStep(3, false, true)).toBe(4);
  });

  it("maps skipped assign step to constrain", () => {
    expect(normalizeActiveStep(4, true, false)).toBe(5);
  });

  it("leaves valid steps unchanged", () => {
    expect(normalizeActiveStep(5, false, false)).toBe(5);
  });
});

describe("furthestReachedDisplayIndex", () => {
  const skipBoth = [0, 1, 2, 5, 6];

  it("uses the visible index when furthest actual is on the list", () => {
    expect(furthestReachedDisplayIndex(skipBoth, 5)).toBe(3);
    expect(furthestReachedDisplayIndex(skipBoth, 2)).toBe(2);
  });

  it("maps past a dropped optional step to the next visible row", () => {
    expect(furthestReachedDisplayIndex(skipBoth, 4)).toBe(3);
    expect(furthestReachedDisplayIndex(skipBoth, 3)).toBe(3);
  });
});

describe("skipped optional steps", () => {
  it("detects skipped options and assign rows", () => {
    expect(isWizardStepSkipped(3, false, false)).toBe(true);
    expect(isWizardStepSkipped(4, false, false)).toBe(true);
    expect(isWizardStepSkipped(3, true, false)).toBe(false);
    expect(isWizardStepSkipped(4, false, true)).toBe(false);
  });

  it("firstInteractiveStepAfter finds the next interactive step", () => {
    expect(firstInteractiveStepAfter(2, false, false)).toBe(5);
    expect(firstInteractiveStepAfter(3, true, false)).toBe(5);
    expect(firstInteractiveStepAfter(3, false, true)).toBe(4);
  });

  it("skippedWizardStepIsPassed when furthest reaches the next step", () => {
    expect(skippedWizardStepIsPassed(3, 4, true, false)).toBe(false);
    expect(skippedWizardStepIsPassed(3, 5, true, false)).toBe(false);
    expect(skippedWizardStepIsPassed(3, 5, false, false)).toBe(true);
    expect(skippedWizardStepIsPassed(4, 4, false, false)).toBe(false);
    expect(skippedWizardStepIsPassed(4, 5, false, false)).toBe(true);
  });
});
