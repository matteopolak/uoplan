import { describe, expect, it } from "vitest";
import {
  buildPoolCaps,
  computeCoursesPerPool,
  enumerateSingleRedistributions,
  poolCourseCap,
  reorderGeneralPoolForDisciplineDiversity,
  weightedRandomPick,
  type RequirementPool,
} from "./scheduleHelpers";

const cache = {} as import("schedule").DataCache;

function pool(
  id: string,
  creditsNeeded: number,
  overrides?: Partial<RequirementPool>,
): RequirementPool {
  return {
    requirementId: id,
    type: "elective",
    label: id,
    candidateCourses: [],
    creditsNeeded,
    minCourses: 0,
    ...overrides,
  };
}

describe("computeCoursesPerPool", () => {
  it("allocates exactly remainingCourseSlots when caps sum higher than slots", () => {
    const pools = [pool("a", 3), pool("b", 3), pool("c", 12)];
    const m = computeCoursesPerPool(pools, 5, cache);
    const sum = [...m.values()].reduce((s, n) => s + n, 0);
    expect(sum).toBe(5);
  });

  it("never exceeds sum of per-pool caps when semester slots ask for more", () => {
    const pools = [pool("a", 3), pool("b", 3), pool("c", 6)];
    const m = computeCoursesPerPool(pools, 5, cache);
    const sum = [...m.values()].reduce((s, n) => s + n, 0);
    expect(sum).toBe(4);
    expect(m.get("c")).toBe(2);
  });

  it("matches strict caps when semester count equals sum of caps", () => {
    const pools = [pool("a", 3), pool("b", 3), pool("c", 6)];
    const m = computeCoursesPerPool(pools, 4, cache);
    expect(m.get("a")).toBe(1);
    expect(m.get("b")).toBe(1);
    expect(m.get("c")).toBe(2);
  });

  it("fills structured pools before broad electives when caps allow", () => {
    const pools = [
      pool("a", 3, { type: "course" }),
      pool("b", 3, { type: "course" }),
      pool("c", 12, { type: "free_elective" }),
    ];
    const m = computeCoursesPerPool(pools, 5, cache);
    expect(m.get("a")).toBe(1);
    expect(m.get("b")).toBe(1);
    expect(m.get("c")).toBe(3);
  });

  it("uses only structured pools when they cover the semester", () => {
    const pools = [
      pool("a", 3, { type: "course" }),
      pool("b", 3, { type: "course" }),
      pool("c", 3, { type: "course" }),
      pool("d", 12, { type: "elective" }),
    ];
    const m = computeCoursesPerPool(pools, 3, cache);
    expect(m.get("a")).toBe(1);
    expect(m.get("b")).toBe(1);
    expect(m.get("c")).toBe(1);
    expect(m.get("d")).toBe(0);
  });
});

describe("poolCourseCap and buildPoolCaps", () => {
  it("caps by ceil(credits/3) and minCourses", () => {
    const p = pool("x", 6, { type: "course", minCourses: 0 });
    expect(poolCourseCap(p)).toBe(2);
    const p2 = pool("y", 3, { type: "or_course", minCourses: 1 });
    expect(poolCourseCap(p2)).toBe(1);
  });

  it("caps discipline_elective at one course per generated term", () => {
    const p = pool("z", 12, { type: "discipline_elective" });
    expect(poolCourseCap(p)).toBe(1);
  });

  it("buildPoolCaps maps requirement ids", () => {
    const pools = [pool("a", 3), pool("b", 9)];
    const caps = buildPoolCaps(pools);
    expect(caps.get("a")).toBe(1);
    expect(caps.get("b")).toBe(3);
  });
});

describe("enumerateSingleRedistributions", () => {
  it("returns single-slot moves from structured pools to broad electives with spare cap", () => {
    const structuredA = pool("a", 3, { type: "course" });
    const structuredB = pool("b", 3, { type: "course" });
    const broad = pool("c", 12, { type: "free_elective" });
    const pools = [structuredA, structuredB, broad];
    const cap = buildPoolCaps(pools);
    const coursesPerPool = new Map<string, number>([
      ["a", 1],
      ["b", 1],
      ["c", 0],
    ]);
    const alts = enumerateSingleRedistributions(coursesPerPool, pools, cap);
    expect(alts).toHaveLength(2);
    const sums = alts.map((m) => [...m.values()].reduce((s, n) => s + n, 0));
    expect(sums.every((s) => s === 2)).toBe(true);
    expect(alts.some((m) => m.get("a") === 0 && m.get("c") === 1)).toBe(true);
    expect(alts.some((m) => m.get("b") === 0 && m.get("c") === 1)).toBe(true);
  });

  it("returns empty when no broad pool can accept another slot", () => {
    const structured = pool("a", 3, { type: "course" });
    const broad = pool("b", 3, { type: "elective" });
    const pools = [structured, broad];
    const cap = buildPoolCaps(pools);
    const coursesPerPool = new Map<string, number>([
      ["a", 1],
      ["b", 1],
    ]);
    expect(enumerateSingleRedistributions(coursesPerPool, pools, cap)).toEqual(
      [],
    );
  });

  it("dedupes identical redistribution maps", () => {
    const s1 = pool("a", 3, { type: "course" });
    const s2 = pool("b", 3, { type: "course" });
    const broad = pool("c", 12, { type: "elective" });
    const pools = [s1, s2, broad];
    const cap = buildPoolCaps(pools);
    const coursesPerPool = new Map<string, number>([
      ["a", 1],
      ["b", 0],
      ["c", 0],
    ]);
    const alts = enumerateSingleRedistributions(coursesPerPool, pools, cap);
    expect(alts).toHaveLength(1);
    expect(alts[0].get("a")).toBe(0);
    expect(alts[0].get("c")).toBe(1);
  });
});

describe("weightedRandomPick", () => {
  it("is deterministic with a fixed rng", () => {
    let i = 0;
    const vals = [0.1, 0.7, 0.3];
    const rng = () => vals[i++ % vals.length];
    const items = ["a", "b", "c"];
    const weights = [1, 1, 1];
    const r1 = weightedRandomPick(items, weights, rng);
    i = 0;
    const r2 = weightedRandomPick(items, weights, rng);
    expect(r1).toBe(r2);
  });

  it("respects weights — higher weight items are picked more often", () => {
    let seed = 0;
    const rng = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const items = ["low", "high"];
    const weights = [1, 10];
    const counts: Record<string, number> = { low: 0, high: 0 };
    for (let i = 0; i < 1000; i++) {
      counts[weightedRandomPick(items, weights, rng)] += 1;
    }
    expect(counts.high).toBeGreaterThan(counts.low * 3);
  });

  it("always picks the only positive-weight item", () => {
    const rng = () => 0.99;
    expect(weightedRandomPick(["a", "b"], [0, 5], rng)).toBe("b");
  });
});

describe("reorderGeneralPoolForDisciplineDiversity", () => {
  it("orders unseen disciplines before disciplines already in the schedule", () => {
    const codes = ["MAT 1000", "PHY 1000", "MAT 2000"];
    const chosen = new Set<string>(["MAT 1100"]);
    reorderGeneralPoolForDisciplineDiversity(codes, chosen);
    expect(codes[0]).toBe("PHY 1000");
  });
});
