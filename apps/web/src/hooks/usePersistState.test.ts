import { describe, expect, it } from "vitest";
import { useAppStore } from "../store/appStore";
import { hasPersistedStateChange } from "./usePersistState";

describe("hasPersistedStateChange", () => {
  it("ignores schedule display-only updates", () => {
    const prev = useAppStore.getState();
    const next = {
      ...prev,
      generatedSchedules: [{ enrollments: [] }],
      basicElectivesCount: prev.basicElectivesCount + 1,
    };

    expect(hasPersistedStateChange(next, prev)).toBe(false);
  });

  it("detects updates that are encoded into persisted state", () => {
    const prev = useAppStore.getState();
    const next = {
      ...prev,
      completedCourses: [...prev.completedCourses, "CSI 3105"],
    };

    expect(hasPersistedStateChange(next, prev)).toBe(true);
  });
});
