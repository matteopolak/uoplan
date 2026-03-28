import type { RequirementWithStatus } from "schedule";

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
 * Recursively replaces `or_group` / `options_group` nodes that have a user
 * selection with just the selected child branch. Already-complete option
 * groups are passed through unchanged (the engine has already resolved them).
 *
 * Used by AssignStep and ConstrainStep so those steps never show the parent
 * radio-button block — only the selected child appears directly.
 */
export function applyOptionSelections(
  tree: RequirementWithStatus[],
  selectedOptions: Record<string, number>,
): RequirementWithStatus[] {
  const out: RequirementWithStatus[] = [];
  for (const node of tree) {
    const isOptionType =
      node.type === "or_group" || node.type === "options_group";

    if (
      isOptionType &&
      !node.complete &&
      node.requirementId != null &&
      selectedOptions[node.requirementId] != null
    ) {
      const idx = selectedOptions[node.requirementId];
      const child = node.options?.[idx];
      if (child) {
        // Recurse so nested option groups within the chosen branch also get flattened.
        out.push(...applyOptionSelections([child], selectedOptions));
        continue;
      }
    }

    // For non-option-group nodes with children, recurse into children.
    if (node.options?.length) {
      out.push({
        ...node,
        options: applyOptionSelections(node.options, selectedOptions),
      });
    } else {
      out.push(node);
    }
  }
  return out;
}
