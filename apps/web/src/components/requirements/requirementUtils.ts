import type { DataCache, RequirementWithStatus } from "schedule";
import {
  normalizeCourseCode,
  courseMatchesFilters,
  getEffectiveSchedule,
  isHonoursProject,
} from "schedule";
import {
  isElectiveRequirementType,
  isWithinElectiveLevelCap,
  virtualScheduleFilterApplies,
} from "../../lib/electiveEligibility";

function normalizeTitleForCompare(title: string | undefined): string {
  return (title ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * UX helper: reduce "dropdown inside dropdown" when a node is just a wrapper
 * around a single child. Matches {@link RequirementNode} behavior.
 */
export function simplifySingleChildChain(node: RequirementWithStatus): {
  node: RequirementWithStatus;
  autoExpanded: boolean;
} {
  let current = node;
  let changed = false;

  while (
    current.requirementId == null &&
    current.options &&
    current.options.length === 1 &&
    current.options[0] &&
    (current.options[0].options?.length ?? 0) > 0 &&
    (() => {
      const parentT = normalizeTitleForCompare(current.title);
      const childT = normalizeTitleForCompare(current.options[0].title);
      const parentGeneric = parentT === "" || parentT === "or";
      const childGeneric = childT === "" || childT === "or";
      return parentGeneric || childGeneric || parentT === childT;
    })()
  ) {
    const child = current.options[0];
    current = {
      ...child,
      title: (current.title ?? "").trim() ? current.title : child.title,
      code: current.code ?? child.code,
    };
    changed = true;
  }

  return { node: current, autoExpanded: changed };
}

/**
 * Removes `requirementId` and descendant option keys (req-0-0 under req-0)
 * from a selection map. Used when backing out of a branch.
 */
export function pruneOptionSelectionsForClear(
  selected: Record<string, number>,
  requirementId: string,
): Record<string, number> {
  const prefix = `${requirementId}-`;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(selected)) {
    if (k === requirementId) continue;
    if (k.startsWith(prefix)) continue;
    out[k] = v;
  }
  return out;
}

/**
 * Returns true if the node (or any non-complete descendant) is an
 * or_group/options_group with a requirementId, i.e. it needs user selection.
 */
export function nodeHasOptionGroups(node: RequirementWithStatus): boolean {
  if (node.complete) return false;
  if (
    (node.type === "or_group" || node.type === "options_group") &&
    node.requirementId != null
  ) {
    return true;
  }
  return node.options?.some(nodeHasOptionGroups) ?? false;
}

/** One-line hint under an option in the Options step (credits, pool size, nested groups). */
export function getOptionSecondarySummaryLine(
  opt: RequirementWithStatus,
): string | null {
  const parts: string[] = [];
  const credits = opt.creditsNeeded ?? 0;
  if (credits > 0) {
    parts.push(`${credits} credit${credits !== 1 ? "s" : ""} required`);
  }
  const n = opt.candidateCourses?.length ?? 0;
  if (n > 0) {
    parts.push(`${n} possible course${n !== 1 ? "s" : ""}`);
  }
  if (nodeHasOptionGroups(opt)) {
    parts.push("Further choices below");
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * Returns true if any or_group / options_group in the tree still needs a
 * selection from the user. Follows selected branches for nested groups so
 * that only currently-relevant unresolved groups are counted.
 */
export function hasMissingOptionSelections(
  nodes: RequirementWithStatus[],
  selectedOptions: Record<string, number>,
): boolean {
  for (const node of nodes) {
    if (node.complete) continue;
    const isOptionType =
      node.type === "or_group" || node.type === "options_group";
    if (isOptionType && node.requirementId != null) {
      const idx = selectedOptions[node.requirementId];
      if (idx == null) return true;
      const child = node.options?.[idx];
      if (child && hasMissingOptionSelections([child], selectedOptions))
        return true;
    } else if (node.options?.length) {
      if (hasMissingOptionSelections(node.options, selectedOptions)) return true;
    }
  }
  return false;
}

/**
 * Recursively collects all `or_group` / `options_group` nodes that need user
 * selection (have a requirementId and are not already complete).
 *
 * Does NOT recurse into matched nodes — nested options within branches are
 * surfaced only after the user has selected the parent branch.
 */
export function collectOptionGroups(
  nodes: RequirementWithStatus[],
  breadcrumb = "",
): Array<{ node: RequirementWithStatus; breadcrumb: string }> {
  const result: Array<{ node: RequirementWithStatus; breadcrumb: string }> = [];
  for (const node of nodes) {
    const isOptionType =
      node.type === "or_group" || node.type === "options_group";
    if (isOptionType && node.requirementId != null && !node.complete) {
      result.push({ node, breadcrumb });
    } else if (node.options?.length) {
      const childBreadcrumb = node.title
        ? breadcrumb
          ? `${breadcrumb} › ${node.title}`
          : node.title
        : breadcrumb;
      result.push(...collectOptionGroups(node.options, childBreadcrumb));
    }
  }
  return result;
}

/**
 * Resolves which branch index applies for an `or_group` / `options_group`
 * (user pick in the Options step, else {@link RequirementWithStatus.satisfiedOptionIndex}).
 */
export function selectedBranchIndexForOptionGroup(
  node: RequirementWithStatus,
  selectedOptions: Record<string, number>,
): number | undefined {
  if (node.requirementId == null) return undefined;
  const fromUser = selectedOptions[node.requirementId];
  if (fromUser != null) return fromUser;
  if (node.satisfiedOptionIndex != null) return node.satisfiedOptionIndex;
  return undefined;
}

/**
 * True when this node is a pure structural wrapper (conjunction / pick shell)
 * with no own requirement slot — its children can be spliced into the parent
 * after an option branch is chosen.
 */
function canHoistStructuralWrapper(node: RequirementWithStatus): boolean {
  if (
    node.type !== "and" &&
    node.type !== "pick" &&
    node.type !== "group"
  ) {
    return false;
  }
  if (node.requirementId != null) return false;
  if ((node.candidateCourses?.length ?? 0) > 0) return false;
  if ((node.creditsNeeded ?? 0) > 0) return false;
  return (node.options?.length ?? 0) > 0;
}

/**
 * Fully processes one node (option flattening + child recursion), then unwraps
 * structural `and` / `pick` / `group` shells so their children sit alongside
 * siblings from the parent list (Assign / Constrain UX).
 */
function expandSelectedOptionBranch(
  branch: RequirementWithStatus,
  selectedOptions: Record<string, number>,
): RequirementWithStatus[] {
  let nodes = mapOptionSelectionList([branch], selectedOptions);
  for (;;) {
    if (nodes.length !== 1) return nodes;
    const only = nodes[0];
    if (!canHoistStructuralWrapper(only)) return nodes;
    nodes = mapOptionSelectionList(only.options ?? [], selectedOptions);
  }
}

function mapOptionSelectionList(
  nodes: RequirementWithStatus[],
  selectedOptions: Record<string, number>,
): RequirementWithStatus[] {
  const out: RequirementWithStatus[] = [];
  for (const node of nodes) {
    const isOptionType =
      node.type === "or_group" || node.type === "options_group";

    if (isOptionType && node.requirementId != null) {
      const idx = selectedBranchIndexForOptionGroup(node, selectedOptions);
      const nOpts = node.options?.length ?? 0;
      if (idx != null && nOpts > 0 && idx >= 0 && idx < nOpts) {
        const child = node.options![idx];
        out.push(...expandSelectedOptionBranch(child, selectedOptions));
        continue;
      }
    }

    if (node.options?.length) {
      out.push({
        ...node,
        options: mapOptionSelectionList(node.options, selectedOptions),
      });
    } else {
      out.push(node);
    }
  }
  return out;
}

/**
 * Recursively replaces `or_group` / `options_group` nodes that have a resolved
 * branch with just the selected child, at every depth. Nested groups are
 * flattened in the same pass. Selected branches that are pure `and` / `pick` /
 * `group` wrappers (no requirement id) are unwrapped so their children appear as
 * siblings of other requirements in the parent — easier to use in Assign /
 * Constrain.
 *
 * Used by AssignStep, ConstrainStep, and RequirementsStep. The Options step
 * uses the raw tree and OptionsDrilldown instead — do not pre-flatten there.
 */
export function applyOptionSelections(
  tree: RequirementWithStatus[],
  selectedOptions: Record<string, number>,
): RequirementWithStatus[] {
  return mapOptionSelectionList(tree, selectedOptions);
}

/**
 * Counts every node that carries a `requirementId` in the given tree (for
 * diagnostics or slot totals). Not used for the completed-requirements badge;
 * that uses {@link countSatisfiedTopLevelRoots} / root count instead.
 */
export function countRequirementIdSlots(
  nodes: RequirementWithStatus[],
): number {
  let n = 0;
  for (const node of nodes) {
    if (node.requirementId != null) n++;
    if (node.options?.length) n += countRequirementIdSlots(node.options);
  }
  return n;
}

/**
 * Adjust a requirement tree node to reflect manual course assignments from the
 * Assign step (`selectedPerRequirement`). For each node with a requirementId:
 * - If assigned credits >= creditsNeeded → mark complete, zero out creditsNeeded
 * - If partially assigned → reduce creditsNeeded by assigned credits
 * Children are adjusted recursively; an and_group is marked complete when all
 * its children become complete.
 */
export function adjustNodeForAssignments(
  node: RequirementWithStatus,
  selectedPerRequirement: Record<string, string[]>,
  cache: DataCache | null,
): RequirementWithStatus {
  const assigned = node.requirementId
    ? (selectedPerRequirement[node.requirementId] ?? [])
    : [];
  const assignedCredits = assigned.reduce(
    (sum, code) =>
      sum + (cache?.getCourse(normalizeCourseCode(code))?.credits ?? 3),
    0,
  );
  const origCredits = node.creditsNeeded ?? 0;

  if (origCredits > 0 && assignedCredits >= origCredits) {
    return { ...node, complete: true, creditsNeeded: 0, satisfiedBy: assigned };
  }

  const newCredits =
    origCredits > 0 && assignedCredits > 0
      ? origCredits - assignedCredits
      : origCredits;

  const adjustedOptions = node.options?.map((child) =>
    adjustNodeForAssignments(child, selectedPerRequirement, cache),
  );

  const isOrLike = node.type === "or_group" || node.type === "options_group";
  const anyChildComplete =
    isOrLike &&
    adjustedOptions != null &&
    adjustedOptions.some((c) => c.complete);
  const allChildrenComplete =
    !isOrLike &&
    adjustedOptions != null &&
    adjustedOptions.length > 0 &&
    adjustedOptions.every((c) => c.complete);

  return {
    ...node,
    creditsNeeded: newCredits,
    ...(anyChildComplete || allChildrenComplete ? { complete: true } : {}),
    ...(adjustedOptions ? { options: adjustedOptions } : {}),
  };
}

/**
 * Number of top-level program requirements (roots of `requirementTreeWithStatus`)
 * that are satisfied: engine completion and/or enough assigned credits per
 * {@link adjustNodeForAssignments}. Matches the badge denominator
 * (`roots.length`).
 */
export function countSatisfiedTopLevelRoots(
  roots: RequirementWithStatus[],
  selectedPerRequirement: Record<string, string[]>,
  cache: DataCache | null,
): number {
  let n = 0;
  for (const root of roots) {
    if (adjustNodeForAssignments(root, selectedPerRequirement, cache).complete) {
      n++;
    }
  }
  return n;
}

/** Matches {@link RequirementNode} MultiSelect filtering (Assign / Constrain steps). */
export interface ConstrainMultiSelectContext {
  cache: DataCache | null;
  completedCourses: Set<string>;
  prereqEligible: Set<string>;
  levelBuckets: ("undergrad" | "grad")[];
  languageBuckets: ("en" | "fr" | "other")[];
  electiveLevelBuckets: number[];
  unassignedCompletedSetNormalized: Set<string>;
  allAssignedCoursesNormalized: Set<string>;
  includeClosedComponents: boolean;
  virtualSectionsOnly: boolean;
  /** Constrain-step selections, used for virtual-only exemption in AssignStep UI. */
  constrainedPerRequirement?: Record<string, string[]>;
  completedOnly: boolean;
}

export interface ConstrainMultiSelectOption {
  value: string;
  label: string;
  disabled: boolean;
}

/**
 * Builds MultiSelect `data` and selected values for a requirement node — same
 * rules as {@link RequirementNode}'s course picker.
 */
export function getConstrainMultiSelectOptions(
  node: RequirementWithStatus,
  selectedPerRequirement: Record<string, string[]>,
  ctx: ConstrainMultiSelectContext,
): { selectedForDisplay: string[]; options: ConstrainMultiSelectOption[] } {
  const selected = node.requirementId
    ? (selectedPerRequirement[node.requirementId] ?? [])
    : [];

  const explicitExemptNormalized = new Set<string>([
    ...(node.requirementId ? ctx.constrainedPerRequirement?.[node.requirementId] ?? [] : []),
    ...selected,
  ].map((c) => normalizeCourseCode(c)));

  const isElectiveType = isElectiveRequirementType(node.type);
  const isElectiveWithExclusions =
    isElectiveType && (node.excluded_disciplines?.length ?? 0) > 0;

  const isCompletedCourse = (code: string): boolean => {
    const norm = normalizeCourseCode(code);
    const canonical = ctx.cache?.getCourse(norm)?.code ?? code;
    return ctx.completedCourses.has(canonical) || ctx.completedCourses.has(norm);
  };

  const filtered =
    node.candidateCourses
      ?.filter((c) => ctx.prereqEligible.has(c))
      .filter((c) => {
        const isCompleted =
          isCompletedCourse(c) ||
          ctx.unassignedCompletedSetNormalized.has(normalizeCourseCode(c));
        if (ctx.completedOnly) return isCompleted;
        if (isCompleted) return false;
        if (
          !courseMatchesFilters(c, {
            levels: ctx.levelBuckets,
            languageBuckets: ctx.languageBuckets,
          })
        ) {
          return false;
        }
        if (
          ctx.cache &&
          !getEffectiveSchedule(
            ctx.cache,
            c,
            ctx.includeClosedComponents,
            virtualScheduleFilterApplies(
              ctx.virtualSectionsOnly,
              node.type,
              c,
              explicitExemptNormalized,
            ),
          )
        ) {
          const isSpecificCourseReq =
            node.type === "course" || node.type === "or_course";
          if (isSpecificCourseReq && isHonoursProject(c, ctx.cache))
            return true;
          return false;
        }
        if (isElectiveType && !isWithinElectiveLevelCap(c)) {
          return false;
        }
        if (isElectiveWithExclusions && ctx.electiveLevelBuckets.length > 0) {
          const match = c.match(/\d{4}/);
          if (match) {
            const num = parseInt(match[0], 10);
            if (!Number.isNaN(num)) {
              const bucket = Math.floor(num / 1000) * 1000;
              if (!ctx.electiveLevelBuckets.includes(bucket)) return false;
            }
          }
        }
        return true;
      }) ?? [];

  const selectedForDisplay = selected.map(
    (c) => ctx.cache?.getCourse(normalizeCourseCode(c))?.code ?? c,
  );

  const normalizedSeen = new Set<string>();
  const available: string[] = [];
  for (const c of selectedForDisplay) {
    const norm = normalizeCourseCode(c);
    if (normalizedSeen.has(norm)) continue;
    normalizedSeen.add(norm);
    available.push(ctx.cache?.getCourse(norm)?.code ?? c);
  }
  for (const c of filtered) {
    const norm = normalizeCourseCode(c);
    if (normalizedSeen.has(norm)) continue;
    normalizedSeen.add(norm);
    available.push(ctx.cache?.getCourse(norm)?.code ?? c);
  }

  const availableSorted = [...available].sort((a, b) => {
    const aUn = ctx.unassignedCompletedSetNormalized.has(normalizeCourseCode(a));
    const bUn = ctx.unassignedCompletedSetNormalized.has(normalizeCourseCode(b));
    if (aUn && !bUn) return -1;
    if (!aUn && bUn) return 1;
    return 0;
  });

  const options = availableSorted.map((code) => {
    const norm = normalizeCourseCode(code);
    const usedElsewhere =
      ctx.allAssignedCoursesNormalized.has(norm) &&
      !selectedForDisplay.includes(code);
    return { value: code, label: code, disabled: usedElsewhere };
  });

  return { selectedForDisplay, options };
}

/**
 * True when this subtree has no “main flow” Constrain UI: no unresolved option
 * group, and every course MultiSelect’s {@link getConstrainMultiSelectOptions}
 * `options` array is empty (same pool as the dropdown: prereqs, term offering,
 * filters, etc.).
 *
 * Nodes without a `requirementId` do not render a MultiSelect — they count as
 * vacuously “empty” so e.g. a `pick` hides when **all** descendants with
 * pickers have empty pools.
 */
export function subtreeHasOnlyEmptyConstrainDropdowns(
  node: RequirementWithStatus,
  selectedOptionsPerRequirement: Record<string, number>,
  constrainedPerRequirement: Record<string, string[]>,
  ctx: ConstrainMultiSelectContext,
): boolean {
  if (node.complete) return true;
  if (node.type === "section") return true;

  const isOptionType =
    node.type === "or_group" || node.type === "options_group";
  if (isOptionType && node.requirementId != null) {
    const idx = selectedBranchIndexForOptionGroup(
      node,
      selectedOptionsPerRequirement,
    );
    const nOpts = node.options?.length ?? 0;
    if (idx == null || nOpts === 0 || idx < 0 || idx >= nOpts) return false;
    const child = node.options![idx];
    return subtreeHasOnlyEmptyConstrainDropdowns(
      child,
      selectedOptionsPerRequirement,
      constrainedPerRequirement,
      ctx,
    );
  }

  if (node.options?.length) {
    const structural =
      node.type === "and" ||
      node.type === "pick" ||
      node.type === "group" ||
      (isOptionType && node.requirementId == null);
    if (structural) {
      const childrenAllEmpty = node.options.every((child) =>
        subtreeHasOnlyEmptyConstrainDropdowns(
          child,
          selectedOptionsPerRequirement,
          constrainedPerRequirement,
          ctx,
        ),
      );
      if (!childrenAllEmpty) return false;
      // pick/group: hide the whole block only when every child is empty **and**
      // any parent-card MultiSelect (requirementId on this node) is empty too.
      if (
        (node.type === "pick" || node.type === "group") &&
        node.requirementId != null
      ) {
        const { options } = getConstrainMultiSelectOptions(
          node,
          constrainedPerRequirement,
          ctx,
        );
        return options.length === 0;
      }
      return true;
    }
  }

  if (node.requirementId != null) {
    const { options } = getConstrainMultiSelectOptions(
      node,
      constrainedPerRequirement,
      ctx,
    );
    return options.length === 0;
  }

  // No Constrain MultiSelect on this node — does not block “all children empty”.
  return true;
}

export interface PartitionedConstrainRoot {
  node: RequirementWithStatus;
  /** Index of this root in the original `incompleteRoots` array (stable keys). */
  rootIndex: number;
}

/** Splits roots by whether every constrain MultiSelect would show an empty dropdown. */
export function partitionIncompleteConstrainRoots(
  incompleteRoots: RequirementWithStatus[],
  selectedOptionsPerRequirement: Record<string, number>,
  constrainedPerRequirement: Record<string, string[]>,
  ctx: ConstrainMultiSelectContext,
): { primary: PartitionedConstrainRoot[]; collapsed: PartitionedConstrainRoot[] } {
  const primary: PartitionedConstrainRoot[] = [];
  const collapsed: PartitionedConstrainRoot[] = [];
  for (let i = 0; i < incompleteRoots.length; i++) {
    const root = incompleteRoots[i];
    const entry: PartitionedConstrainRoot = { node: root, rootIndex: i };
    if (
      subtreeHasOnlyEmptyConstrainDropdowns(
        root,
        selectedOptionsPerRequirement,
        constrainedPerRequirement,
        ctx,
      )
    ) {
      collapsed.push(entry);
    } else {
      primary.push(entry);
    }
  }
  return { primary, collapsed };
}

export function findMissingSelections(
  nodes: RequirementWithStatus[],
  selectedOptionsPerRequirement: Record<string, number>,
  activeBranch: boolean = true,
): RequirementWithStatus[] {
  const result: RequirementWithStatus[] = [];
  for (const node of nodes) {
    if (!activeBranch || node.complete) continue;
    const isOrGroup = node.type === "or_group";
    const isOptionsGroup = node.type === "options_group";
    if (
      (isOrGroup || isOptionsGroup) &&
      node.options &&
      node.requirementId != null
    ) {
      const selectedIdx = selectedOptionsPerRequirement[node.requirementId];
      if (selectedIdx == null) {
        result.push(node);
      } else {
        const selectedChild = node.options[selectedIdx];
        if (selectedChild) {
          result.push(
            ...findMissingSelections(
              [selectedChild],
              selectedOptionsPerRequirement,
              true,
            ),
          );
        }
      }
    } else if (node.options) {
      result.push(
        ...findMissingSelections(
          node.options,
          selectedOptionsPerRequirement,
          activeBranch,
        ),
      );
    }
  }
  return result;
}

export function findFirstMissingPath(
  nodes: RequirementWithStatus[],
  selectedOptionsPerRequirement: Record<string, number>,
  makeNodeKey: (node: RequirementWithStatus, idx: number) => string,
  getStableNodeKey: (node: RequirementWithStatus, fallback: string) => string,
  ancestorKeys: string[] = [],
): string[] | null {
  for (let idx = 0; idx < nodes.length; idx++) {
    const node = nodes[idx];
    if (node.complete || !node.options?.length) continue;
    const nodeKey = makeNodeKey(node, idx);
    const pathSoFar = [...ancestorKeys, nodeKey];
    const isOrGroup = node.type === "or_group";
    const isOptionsGroup = node.type === "options_group";
    if ((isOrGroup || isOptionsGroup) && node.requirementId != null) {
      const selectedIdx = selectedOptionsPerRequirement[node.requirementId];
      if (selectedIdx == null) return pathSoFar;
      const selectedChild = node.options[selectedIdx];
      if (selectedChild) {
        const parentKey = getStableNodeKey(node, "parent");
        const childKey = getStableNodeKey(
          selectedChild,
          `${parentKey}:opt:${selectedIdx}`,
        );
        const result = findFirstMissingPath(
          [selectedChild],
          selectedOptionsPerRequirement,
          (_c, _i) => childKey,
          getStableNodeKey,
          pathSoFar,
        );
        if (result) return result;
      }
    } else {
      const parentKey = getStableNodeKey(node, "parent");
      const result = findFirstMissingPath(
        node.options,
        selectedOptionsPerRequirement,
        (child, i) => getStableNodeKey(child, `${parentKey}:child:${i}`),
        getStableNodeKey,
        pathSoFar,
      );
      if (result) return result;
    }
  }
  return null;
}
