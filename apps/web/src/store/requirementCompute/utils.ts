import { normalizeCourseCode, type DataCache, getCourseCredits } from "schedule";
import type { RequirementWithStatus } from "schedule";
import type { Program, ProgramRequirement } from "schemas";

export function collectAssignedFromExactRequirements(
  tree: RequirementWithStatus[],
): Set<string> {
  const assigned = new Set<string>();
  function walk(nodes: RequirementWithStatus[]) {
    for (const node of nodes) {
      if (
        (node.type === "course" || node.type === "or_course") &&
        node.satisfiedBy?.length
      ) {
        for (const code of node.satisfiedBy) {
          assigned.add(normalizeCourseCode(code));
        }
      }
      if (node.options?.length) walk(node.options);
    }
  }
  walk(tree);
  return assigned;
}

export function sumCreditsForCodes(
  cache: DataCache,
  codes: string[],
): number {
  let s = 0;
  for (const code of codes) {
    s += getCourseCredits(normalizeCourseCode(code), cache);
  }
  return s;
}

export function isStrictSubset<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size >= b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}

export function getDisciplineCodesForProgram(
  program: Program | null,
): string[] {
  const s = new Set<string>();
  if (!program) return [];

  function walk(node: ProgramRequirement) {
    if (!node) return;
    if (node.type === "course" && node.code) {
      const match = node.code.match(/^([a-zA-Z]+)\s/);
      if (match) s.add(match[1].toUpperCase());
    }
    if (node.options) {
      for (const o of node.options) walk(o);
    }
  }

  for (const req of program.requirements) {
    walk(req);
  }
  return [...s];
}
