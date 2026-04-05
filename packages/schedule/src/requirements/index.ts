import type { Program } from 'schemas';
import type { DataCache } from '../dataCache';
import { RequirementContext } from './context';
import { processRequirement } from './evaluator';
import type { CompletedRequirementItem, RemainingRequirement, RequirementsState, RequirementWithStatus } from './types';

export * from './types';

export function runRequirementPass(
  program: Program,
  completedCourses: string[],
  cache: DataCache,
  selectedOptionsPerRequirement: Record<string, number> = {}
): { remaining: RemainingRequirement[]; tree: RequirementWithStatus[] } {
  const ctx = new RequirementContext(program, completedCourses, cache, selectedOptionsPerRequirement);
  const tree: RequirementWithStatus[] = [];

  for (let i = 0; i < program.requirements.length; i++) {
    const { node } = processRequirement(ctx, program.requirements[i], String(i));
    tree.push(node);
  }

  return { remaining: ctx.remaining, tree };
}

export function collectCompletedRequirements(
  tree: RequirementWithStatus[],
  parentComplete = false
): CompletedRequirementItem[] {
  const out: CompletedRequirementItem[] = [];
  for (const node of tree) {
    const title = node.title ?? node.code ?? `${node.type} requirement`;
    if (node.complete) {
      if (!parentComplete && node.satisfiedBy.length > 0) {
        out.push({ title, satisfiedBy: node.satisfiedBy });
      }
      if (node.options?.length) {
        out.push(...collectCompletedRequirements(node.options, true));
      }
    } else {
      if (node.options?.length) {
        out.push(...collectCompletedRequirements(node.options, false));
      }
    }
  }
  return out;
}

export function computeRequirementTreeWithStatus(
  program: Program,
  completedCourses: string[],
  cache: DataCache,
  selectedOptionsPerRequirement?: Record<string, number>
): RequirementWithStatus[] {
  return runRequirementPass(program, completedCourses, cache, selectedOptionsPerRequirement).tree;
}

export function computeRequirementsState(
  program: Program,
  completedCourses: string[],
  cache: DataCache,
  selectedOptionsPerRequirement?: Record<string, number>
): RequirementsState {
  const { remaining, tree } = runRequirementPass(program, completedCourses, cache, selectedOptionsPerRequirement);
  return {
    remaining,
    tree,
    completedList: collectCompletedRequirements(tree),
  };
}

export function computeRemainingRequirements(
  program: Program,
  completedCourses: string[],
  cache: DataCache,
  selectedOptionsPerRequirement?: Record<string, number>
): RemainingRequirement[] {
  return runRequirementPass(program, completedCourses, cache, selectedOptionsPerRequirement).remaining;
}
