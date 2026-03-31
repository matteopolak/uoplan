import { describe, expect, it } from "vitest";
import { useAppStore } from "../appStore";

describe("clearGeneratedSchedules", () => {
  it("does not notify subscribers when schedules are already cleared", () => {
    const store = useAppStore;
    store.setState({
      ...store.getState(),
      generatedSchedules: [],
      scheduleColorMaps: [],
      schedulePoolMaps: [],
      selectedScheduleIndex: 0,
      generationError: null,
    });

    let updates = 0;
    const unsub = store.subscribe(() => {
      updates += 1;
    });

    store.getState().clearGeneratedSchedules();
    unsub();

    expect(updates).toBe(0);
  });

  it("clears schedule state when populated", () => {
    const store = useAppStore;
    store.setState({
      ...store.getState(),
      generatedSchedules: [{ enrollments: [] }],
      scheduleColorMaps: [{ "CSI 3105": 0 }],
      schedulePoolMaps: [{ "CSI 3105": "pool-1" }],
      selectedScheduleIndex: 2,
      generationError: { message: "x", details: null },
    });

    store.getState().clearGeneratedSchedules();
    const state = store.getState();

    expect(state.generatedSchedules).toHaveLength(0);
    expect(state.scheduleColorMaps).toHaveLength(0);
    expect(state.schedulePoolMaps).toHaveLength(0);
    expect(state.selectedScheduleIndex).toBe(0);
    expect(state.generationError).toBeNull();
  });
});
