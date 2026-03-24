import {
  useState,
  useContext,
  useEffect,
  useMemo,
  memo,
  createContext,
  type MouseEvent,
} from "react";
import {
  Stack,
  MultiSelect,
  Text,
  Paper,
  Badge,
  Group,
  Box,
  Collapse,
  Radio,
} from "@mantine/core";
import { IconCheck, IconChevronDown, IconX } from "@tabler/icons-react";
import { createCourseOptions } from "./CourseSelect";
import type { ComboboxItem } from "@mantine/core";
import type { DataCache } from "../lib/dataCache";
import { normalizeCourseCode } from "../lib/dataCache";
import { courseMatchesFilters } from "../lib/courseFilters";
import { getEffectiveSchedule } from "../lib/scheduleFilters";
import type { RequirementWithStatus } from "../lib/requirements";

export const REQUIREMENT_INDENT_PX = 12;
export const REQUIREMENT_BASE_PADDING_PX = 10;

export function getStableNodeKey(
  node: RequirementWithStatus,
  fallback: string,
): string {
  if (node.requirementId) return `req:${node.requirementId}`;
  const title = (node.title ?? "").trim();
  const code = (node.code ?? "").trim();
  return `node:${node.type}:${code}:${title}:${fallback}`;
}

function getSelectedCredits(
  cache: DataCache | null,
  courseCodes: string[],
): number {
  if (!cache) return 0;
  return courseCodes.reduce(
    (sum, code) => sum + (cache.getCourse(code)?.credits ?? 3),
    0,
  );
}

function normalizeTitleForCompare(title: string | undefined): string {
  return (title ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function getNodeDisplayTitle(node: RequirementWithStatus): string {
  const rawTitle = (node.title ?? "").trim();
  const fallback = rawTitle || node.code || `${node.type} requirement`;
  if (node.type === "or_group") {
    const useGenericLabel = rawTitle === "" || rawTitle.toLowerCase() === "or";
    return useGenericLabel
      ? "One of the following must be completed"
      : fallback;
  }
  return fallback;
}

/**
 * UX helper: reduce "dropdown inside dropdown" when a node is just a wrapper
 * around a single child. This keeps the top label, but uses the child's body.
 */
function simplifySingleChildChain(node: RequirementWithStatus): {
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
      const childT = normalizeTitleForCompare(current.options![0].title);
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

export interface ExpandRegistry {
  register(key: string, open: () => void): void;
  unregister(key: string): void;
}
export const ExpandRegistryContext = createContext<ExpandRegistry | null>(null);

/** Path of (requirementId, optionIndex) from root to this node so selecting a nested option can auto-select parents. */
export type AncestorSelection = { requirementId: string; optionIndex: number };

export interface RequirementNodeProps {
  nodeKey: string;
  node: RequirementWithStatus;
  cache: DataCache | null;
  completedCourses: Set<string>;
  selectedPerRequirement: Record<string, string[]>;
  onSelect: (requirementId: string, courses: string[]) => void;
  selectedOptionsPerRequirement: Record<string, number>;
  onSelectOption: (requirementId: string, optionIndex: number) => void;
  /** When selecting this node's option, also set these parent options so the full path is selected. */
  ancestorSelections?: AncestorSelection[];
  activeBranch: boolean;
  depth?: number;
  radio?: {
    checked: boolean;
    onChange: () => void;
    name: string;
    value: string;
    disabled?: boolean;
  };
  prereqEligible: Set<string>;
  levelBuckets: ("undergrad" | "grad")[];
  languageBuckets: ("en" | "fr" | "other")[];
  electiveLevelBuckets: number[];
  /** Course codes that are completed but not yet assigned to any requirement; show first in dropdown with checkmark. */
  unassignedCompletedSet: Set<string>;
  /** Normalized form of unassigned completed (for dedupe/checkmark when option value is canonical). */
  unassignedCompletedSetNormalized: Set<string>;
  /** Normalized course codes already assigned to any requirement (auto-matched or user-selected). */
  allAssignedCoursesNormalized: Set<string>;
  includeClosedComponents: boolean;
}

export const RequirementNode = memo(function RequirementNode({
  nodeKey,
  node: rawNode,
  cache,
  completedCourses,
  selectedPerRequirement,
  onSelect,
  selectedOptionsPerRequirement,
  onSelectOption,
  ancestorSelections,
  activeBranch,
  depth = 0,
  radio,
  prereqEligible,
  levelBuckets,
  languageBuckets,
  electiveLevelBuckets,
  unassignedCompletedSet,
  unassignedCompletedSetNormalized,
  allAssignedCoursesNormalized,
  includeClosedComponents,
}: RequirementNodeProps) {
  // If a parent (like an option) is responsible for selection UX, don't remove it,
  // but we still want to reduce *nested* single-child wrappers inside it.
  const radioSafeMerge = (() => {
    if (!radio) return null;
    if (!rawNode.options || rawNode.options.length !== 1) return null;
    const onlyChild = rawNode.options[0];
    if (!onlyChild?.options || onlyChild.options.length === 0) return null;

    const parentTitle = (rawNode.title ?? "").trim();
    const childTitle = getNodeDisplayTitle(onlyChild);
    const mergedTitle =
      parentTitle && childTitle
        ? `${parentTitle}${parentTitle.endsWith(":") ? " " : ": "}${childTitle}`
        : parentTitle ||
          childTitle ||
          rawNode.code ||
          `${rawNode.type} requirement`;

    const merged: RequirementWithStatus = {
      ...onlyChild,
      title: mergedTitle,
      complete: rawNode.complete && onlyChild.complete,
      satisfiedBy: rawNode.satisfiedBy.length
        ? rawNode.satisfiedBy
        : onlyChild.satisfiedBy,
    };
    return { node: merged, autoExpanded: true };
  })();

  const { node, autoExpanded } = radioSafeMerge
    ? radioSafeMerge
    : radio
      ? { node: rawNode, autoExpanded: false }
      : simplifySingleChildChain(rawNode);

  const hasOptions = node.options && node.options.length > 0;
  const rawTitle = (node.title ?? "").trim();
  const title = rawTitle || node.code || `${node.type} requirement`;
  const isOrGroup = node.type === "or_group";
  const isOptionsGroup = node.type === "options_group";
  const isAnd = node.type === "and";
  const isSection = node.type === "section";

  const creditsNeeded = node.creditsNeeded ?? 0;
  const hasNiceTitle = rawTitle.length > 0;
  const hasCode = !!node.code;
  const hasCreditsInfo = creditsNeeded > 0;
  const hasSatisfiedInfo = node.complete && node.satisfiedBy.length > 0;
  const hasSummary =
    hasNiceTitle || hasCode || hasCreditsInfo || hasSatisfiedInfo;

  const [opened, setOpened] = useState(
    () => depth === 0 && (autoExpanded || !hasSummary),
  );

  const toggleLocal = (e: MouseEvent) => {
    e.stopPropagation();
    if (!hasOptions) return;
    setOpened((o) => !o);
  };

  const registry = useContext(ExpandRegistryContext);
  useEffect(() => {
    if (!hasOptions || !registry) return;
    registry.register(nodeKey, () => setOpened(true));
    return () => registry.unregister(nodeKey);
    // nodeKey and registry are stable for the lifetime of the component
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isSection) {
    return (
      <Text fw={600} size="sm" c="dimmed" mt={depth > 0 ? "md" : 0} mb="xs">
        {title}
      </Text>
    );
  }

  const selected = node.requirementId
    ? (selectedPerRequirement[node.requirementId] ?? [])
    : [];
  const selectedCreditsForComplete = getSelectedCredits(cache, selected);
  const satisfiedBySelection =
    node.requirementId != null &&
    creditsNeeded > 0 &&
    selectedCreditsForComplete >= creditsNeeded;
  const allSelectedTaken =
    selected.length > 0 && selected.every((c) => completedCourses.has(c));
  const showAsComplete =
    (node.complete && node.satisfiedBy.length > 0) || satisfiedBySelection;
  const hasRequirementId = node.requirementId != null;
  const isElectiveWithExclusions =
    (node.type === "discipline_elective" ||
      node.type === "elective" ||
      node.type === "faculty_elective" ||
      node.type === "free_elective" ||
      node.type === "non_discipline_elective") &&
    (node.excluded_disciplines?.length ?? 0) > 0;

  const { filtered, selectedForDisplay, options } = useMemo(() => {
    const isCompletedCourse = (code: string): boolean => {
      const norm = normalizeCourseCode(code);
      const canonical = cache?.getCourse(norm)?.code ?? code;
      return completedCourses.has(canonical) || completedCourses.has(norm);
    };

    const filtered =
      node.candidateCourses
        ?.filter((c) => prereqEligible.has(c))
        .filter((c) => {
          if (
            isCompletedCourse(c) ||
            unassignedCompletedSetNormalized.has(normalizeCourseCode(c))
          ) {
            return true;
          }
          if (!courseMatchesFilters(c, { levels: levelBuckets, languageBuckets }))
            return false;
          if (cache && !getEffectiveSchedule(cache, c, includeClosedComponents)) {
            const isSpecificCourseReq =
              node.type === "course" || node.type === "or_course";
            if (isSpecificCourseReq && /\b4900\b/.test(c)) return true;
            return false;
          }
          if (isElectiveWithExclusions && electiveLevelBuckets.length > 0) {
            const match = c.match(/\d{4}/);
            if (match) {
              const num = parseInt(match[0], 10);
              if (!Number.isNaN(num)) {
                const bucket = Math.floor(num / 1000) * 1000;
                if (!electiveLevelBuckets.includes(bucket)) return false;
              }
            }
          }
          return true;
        }) ?? [];

    const selectedForDisplay = selected.map(
      (c) => cache?.getCourse(normalizeCourseCode(c))?.code ?? c,
    );

    const normalizedSeen = new Set<string>();
    const available: string[] = [];
    for (const c of selectedForDisplay) {
      const norm = normalizeCourseCode(c);
      if (normalizedSeen.has(norm)) continue;
      normalizedSeen.add(norm);
      available.push(cache?.getCourse(norm)?.code ?? c);
    }
    for (const c of filtered) {
      const norm = normalizeCourseCode(c);
      if (normalizedSeen.has(norm)) continue;
      normalizedSeen.add(norm);
      available.push(cache?.getCourse(norm)?.code ?? c);
    }

    const availableSorted = [...available].sort((a, b) => {
      const aUn = unassignedCompletedSetNormalized.has(normalizeCourseCode(a));
      const bUn = unassignedCompletedSetNormalized.has(normalizeCourseCode(b));
      if (aUn && !bUn) return -1;
      if (!aUn && bUn) return 1;
      return 0;
    });

    const options = availableSorted.map((code) => {
      const norm = normalizeCourseCode(code);
      const usedElsewhere =
        allAssignedCoursesNormalized.has(norm) &&
        !selectedForDisplay.includes(code);
      return { value: code, label: code, disabled: usedElsewhere };
    });

    return { filtered, selectedForDisplay, options };
  }, [
    node.candidateCourses,
    node.type,
    prereqEligible,
    levelBuckets,
    languageBuckets,
    electiveLevelBuckets,
    isElectiveWithExclusions,
    cache,
    completedCourses,
    unassignedCompletedSetNormalized,
    allAssignedCoursesNormalized,
    includeClosedComponents,
    selected,
  ]);

  const selectedCredits = getSelectedCredits(cache, selectedForDisplay);
  const satisfiedByDisplay = [
    ...(node.satisfiedBy ?? []),
    ...selectedForDisplay,
  ].filter(Boolean);
  const satisfiedByDisplayUnique = [...new Set(satisfiedByDisplay)];
  const creditsRemaining = Math.max(0, creditsNeeded - selectedCredits);
  const isOverSelected = creditsNeeded > 0 && selectedCredits > creditsNeeded;

  const multiSelectBlock = hasRequirementId ? (
    <Stack gap="xs" mt="xs">
      {satisfiedByDisplayUnique.length > 0 && (
        <Text size="xs" c="dimmed">
          Satisfied by: {satisfiedByDisplayUnique.sort().join(", ")}
        </Text>
      )}
      {creditsNeeded > 0 && (
        <Text size="xs" c={isOverSelected ? "yellow" : "dimmed"}>
          {isOverSelected
            ? `You have selected ${selectedCredits} credits, which is more than the ${creditsNeeded} credit${creditsNeeded !== 1 ? "s" : ""} required. Extra courses may not count toward this requirement.`
            : selectedCredits > 0
              ? `${selectedCredits} of ${creditsNeeded} credits selected — ${creditsRemaining > 0 ? `pick ${Math.ceil(creditsRemaining / 3)} more course${Math.ceil(creditsRemaining / 3) !== 1 ? "s" : ""}` : "requirement satisfied"}`
              : `Select course(s) to fulfill this requirement (${creditsRemaining} credit${creditsRemaining !== 1 ? "s" : ""} needed).`}
        </Text>
      )}
      <MultiSelect
        label="Courses for this requirement"
        placeholder="Search by course code or title..."
        data={options}
        value={selectedForDisplay}
        onChange={(courses) => onSelect(node.requirementId!, courses)}
        onClick={(e) => e.stopPropagation()}
        searchable
        clearable
        renderOption={({ option }) => {
          const label = cache?.getCourse(option.value)?.title
            ? `${option.value} – ${cache.getCourse(option.value)?.title}`
            : option.value;
          const isSelected = selectedForDisplay.includes(option.value);
          const isCompleted = unassignedCompletedSetNormalized.has(
            normalizeCourseCode(option.value),
          );
          const isUsedElsewhere = (option as { disabled?: boolean }).disabled === true;
          if (isUsedElsewhere) {
            return (
              <Group gap="xs" wrap="nowrap">
                <Badge size="xs" color="gray" variant="light" style={{ flexShrink: 0 }}>
                  USED
                </Badge>
                <Text span size="sm" c="dimmed">
                  {label}
                </Text>
              </Group>
            );
          }
          if (isSelected) {
            return (
              <Group gap="xs" wrap="nowrap">
                <IconX size={14} color="var(--mantine-color-red-6)" />
                <Text span size="sm">
                  {label}
                </Text>
              </Group>
            );
          }
          if (isCompleted) {
            return (
              <Group gap="xs" wrap="nowrap">
                <IconCheck size={14} color="var(--mantine-color-green-6)" />
                <Text span size="sm">
                  {label}
                </Text>
              </Group>
            );
          }
          return label;
        }}
        filter={({ options: opts, search }) => {
          const q = search.toLowerCase().trim();
          if (!q) return opts;
          return (opts as ComboboxItem[]).filter(
            (o) =>
              o.value.toLowerCase().includes(q) ||
              o.label.toLowerCase().includes(q),
          );
        }}
        nothingFoundMessage="No courses found"
      />
    </Stack>
  ) : null;

  // Only show compact read-only "Complete" card for tree-matched leaves (no requirementId, no dropdown).
  if (node.complete && node.satisfiedBy.length > 0 && !hasOptions) {
    return (
      <Paper
        p="sm"
        withBorder
        radius={0}
        mt="xs"
        style={{
          paddingLeft:
            depth * REQUIREMENT_INDENT_PX + REQUIREMENT_BASE_PADDING_PX,
          backgroundColor: "var(--mantine-color-dark-7)",
        }}
      >
        <Group gap="xs" wrap="nowrap" align="center">
          <Text size="sm" c="dimmed" lineClamp={1} style={{ flex: 1 }}>
            {title}
          </Text>
          <Text size="xs" c="dimmed">
            {satisfiedByDisplayUnique.sort().join(", ")}
          </Text>
          <Badge color="green" variant="light" size="sm">
            Complete
          </Badge>
        </Group>
      </Paper>
    );
  }

  if (isOrGroup && hasOptions) {
    const selectedOptionIndex =
      node.requirementId != null
        ? selectedOptionsPerRequirement[node.requirementId]
        : undefined;
    const showError =
      activeBranch &&
      node.requirementId != null &&
      selectedOptionIndex == null &&
      !node.complete;

    const useGenericLabel = rawTitle === "" || rawTitle.toLowerCase() === "or";
    const groupLabel = useGenericLabel
      ? "One of the following must be completed"
      : title;

    return (
      <Paper
        p="sm"
        withBorder
        radius={0}
        mt="xs"
        data-missing-selection={showError ? "true" : undefined}
        style={{
          paddingLeft:
            depth * REQUIREMENT_INDENT_PX + REQUIREMENT_BASE_PADDING_PX,
          backgroundColor: opened
            ? "var(--mantine-color-dark-6)"
            : "var(--mantine-color-dark-8)",
        }}
      >
        <Group
          justify="space-between"
          align="center"
          mb={0}
          onClick={toggleLocal}
          style={{ cursor: "pointer" }}
        >
          <Group gap="xs" align="center">
            {radio && (
              <Radio
                checked={radio.checked}
                onChange={radio.onChange}
                name={radio.name}
                value={radio.value}
                disabled={radio.disabled}
                onClick={(e) => e.stopPropagation()}
              />
            )}
            <IconChevronDown
              size={14}
              style={{
                transform: opened ? "rotate(0deg)" : "rotate(-90deg)",
                transition: "transform 150ms ease",
              }}
            />
            <Text fw={500} size="sm" lh={1.25}>
              {groupLabel}
            </Text>
          </Group>
          {node.complete && node.satisfiedOptionIndex != null && (
            <Badge color="green" variant="light" size="sm">
              Complete
            </Badge>
          )}
        </Group>
        {showError && (
          <Text size="xs" c="red" mt={4}>
            Select exactly one option in this group.
          </Text>
        )}
        {node.complete && node.satisfiedOptionIndex != null && (
          <Text size="xs" c="dimmed" mb="xs">
            Satisfied by: {node.satisfiedBy.join(", ")}
          </Text>
        )}
        <Collapse in={opened}>
          <Stack gap="xs">
            {node.options!.map((opt, idx) => {
              const isSatisfiedOption =
                node.satisfiedOptionIndex === idx && opt.complete;
              const isSelected = selectedOptionIndex === idx;
              const childActiveBranch =
                activeBranch &&
                (!node.requirementId ||
                  selectedOptionIndex == null ||
                  selectedOptionIndex === idx);
              const childAncestors: AncestorSelection[] = [
                ...(ancestorSelections ?? []),
                ...(node.requirementId != null
                  ? [{ requirementId: node.requirementId, optionIndex: idx }]
                  : []),
              ];
              const childKey = getStableNodeKey(
                opt,
                `${getStableNodeKey(node, "parent")}:opt:${idx}`,
              );
              return (
                <Box key={childKey}>
                  <RequirementNode
                    nodeKey={childKey}
                    node={opt}
                    cache={cache}
                    completedCourses={completedCourses}
                    selectedPerRequirement={selectedPerRequirement}
                    onSelect={onSelect}
                    selectedOptionsPerRequirement={
                      selectedOptionsPerRequirement
                    }
                    onSelectOption={onSelectOption}
                    ancestorSelections={childAncestors}
                    activeBranch={childActiveBranch}
                    depth={depth + 1}
                    prereqEligible={prereqEligible}
                    levelBuckets={levelBuckets}
                    languageBuckets={languageBuckets}
                    electiveLevelBuckets={electiveLevelBuckets}
                    unassignedCompletedSet={unassignedCompletedSet}
                    unassignedCompletedSetNormalized={
                      unassignedCompletedSetNormalized
                    }
                    allAssignedCoursesNormalized={allAssignedCoursesNormalized}
                    includeClosedComponents={includeClosedComponents}
                    radio={
                      node.requirementId != null && !node.complete
                        ? {
                            checked: isSelected,
                            onChange: () => {
                              ancestorSelections?.forEach(
                                ({ requirementId, optionIndex }) =>
                                  onSelectOption(requirementId, optionIndex),
                              );
                              onSelectOption(node.requirementId!, idx);
                            },
                            name: node.requirementId,
                            value: String(idx),
                          }
                        : undefined
                    }
                  />
                  {isSatisfiedOption && opt.satisfiedBy.length > 0 && (
                    <Box pl="sm" mt={4}>
                      <Badge color="green" variant="light" size="sm">
                        Satisfied by: {opt.satisfiedBy.join(", ")}
                      </Badge>
                    </Box>
                  )}
                </Box>
              );
            })}
          </Stack>
        </Collapse>
      </Paper>
    );
  }

  if (isOptionsGroup && hasOptions) {
    const selectedOptionIndex =
      node.requirementId != null
        ? selectedOptionsPerRequirement[node.requirementId]
        : undefined;
    const showError =
      activeBranch &&
      node.requirementId != null &&
      selectedOptionIndex == null &&
      !node.complete;

    return (
      <Paper
        p="sm"
        withBorder
        radius={0}
        mt="xs"
        data-missing-selection={showError ? "true" : undefined}
        style={{
          paddingLeft:
            depth * REQUIREMENT_INDENT_PX + REQUIREMENT_BASE_PADDING_PX,
          backgroundColor: opened
            ? "var(--mantine-color-dark-6)"
            : "var(--mantine-color-dark-8)",
        }}
      >
        <Group
          justify="space-between"
          align="center"
          mb={0}
          onClick={toggleLocal}
          style={{ cursor: "pointer" }}
        >
          <Group gap="xs" align="center">
            {radio && (
              <Radio
                checked={radio.checked}
                onChange={radio.onChange}
                name={radio.name}
                value={radio.value}
                disabled={radio.disabled}
                onClick={(e) => e.stopPropagation()}
              />
            )}
            <IconChevronDown
              size={14}
              style={{
                transform: opened ? "rotate(0deg)" : "rotate(-90deg)",
                transition: "transform 150ms ease",
              }}
            />
            <Text fw={500} size="sm" lh={1.25}>
              {title}
            </Text>
          </Group>
          {node.complete && (
            <Badge color="green" variant="light" size="sm">
              Complete
            </Badge>
          )}
        </Group>
        {showError && (
          <Text size="xs" c="red" mt={4}>
            Select exactly one option in this group.
          </Text>
        )}
        {node.complete && node.satisfiedOptionIndex != null && (
          <Text size="xs" c="dimmed" mb="xs">
            Satisfied by option: {node.satisfiedBy.join(", ")}
          </Text>
        )}
        <Collapse in={opened}>
          <Stack gap="xs">
            {node.options!.map((opt, idx) => {
              const isSelected =
                node.requirementId != null &&
                selectedOptionsPerRequirement[node.requirementId] === idx;
              const childActiveBranch =
                activeBranch &&
                (!node.requirementId ||
                  selectedOptionIndex == null ||
                  selectedOptionIndex === idx);
              const childAncestors: AncestorSelection[] = [
                ...(ancestorSelections ?? []),
                ...(node.requirementId != null
                  ? [{ requirementId: node.requirementId, optionIndex: idx }]
                  : []),
              ];
              const childKey = getStableNodeKey(
                opt,
                `${getStableNodeKey(node, "parent")}:opt:${idx}`,
              );
              return (
                <Box key={childKey}>
                  <RequirementNode
                    nodeKey={childKey}
                    node={opt}
                    cache={cache}
                    completedCourses={completedCourses}
                    selectedPerRequirement={selectedPerRequirement}
                    onSelect={onSelect}
                    selectedOptionsPerRequirement={
                      selectedOptionsPerRequirement
                    }
                    onSelectOption={onSelectOption}
                    ancestorSelections={childAncestors}
                    activeBranch={childActiveBranch}
                    depth={depth + 1}
                    prereqEligible={prereqEligible}
                    levelBuckets={levelBuckets}
                    languageBuckets={languageBuckets}
                    electiveLevelBuckets={electiveLevelBuckets}
                    unassignedCompletedSet={unassignedCompletedSet}
                    unassignedCompletedSetNormalized={
                      unassignedCompletedSetNormalized
                    }
                    allAssignedCoursesNormalized={allAssignedCoursesNormalized}
                    includeClosedComponents={includeClosedComponents}
                    radio={
                      node.requirementId != null && !node.complete
                        ? {
                            checked: isSelected,
                            onChange: () => {
                              ancestorSelections?.forEach(
                                ({ requirementId, optionIndex }) =>
                                  onSelectOption(requirementId, optionIndex),
                              );
                              onSelectOption(node.requirementId!, idx);
                            },
                            name: node.requirementId,
                            value: String(idx),
                          }
                        : undefined
                    }
                  />
                </Box>
              );
            })}
          </Stack>
        </Collapse>
      </Paper>
    );
  }

  if (isAnd && hasOptions) {
    return (
      <Paper
        p="sm"
        withBorder
        radius={0}
        mt="xs"
        style={{
          paddingLeft:
            depth * REQUIREMENT_INDENT_PX + REQUIREMENT_BASE_PADDING_PX,
          backgroundColor: opened
            ? "var(--mantine-color-dark-6)"
            : "var(--mantine-color-dark-8)",
        }}
      >
        {title && (
          <Group
            justify="space-between"
            align="center"
            mb={0}
            onClick={toggleLocal}
            style={{ cursor: "pointer" }}
          >
            <Group gap="xs" align="center">
              {radio && (
                <Radio
                  checked={radio.checked}
                  onChange={radio.onChange}
                  name={radio.name}
                  value={radio.value}
                  disabled={radio.disabled}
                  onClick={(e) => e.stopPropagation()}
                />
              )}
              <IconChevronDown
                size={14}
                style={{
                  transform: opened ? "rotate(0deg)" : "rotate(-90deg)",
                  transition: "transform 150ms ease",
                }}
              />
              <Text fw={500} size="sm" lh={1.25}>
                {title}
              </Text>
            </Group>
            {node.complete && (
              <Badge color="green" variant="light" size="sm">
                Complete
              </Badge>
            )}
          </Group>
        )}
        <Collapse in={opened}>
          <Stack gap="xs">
            {node.options!.map((child, idx) => {
              const childKey = getStableNodeKey(
                child,
                `${getStableNodeKey(node, "parent")}:child:${idx}`,
              );
              return (
                <RequirementNode
                  key={childKey}
                  nodeKey={childKey}
                  node={child}
                  cache={cache}
                  completedCourses={completedCourses}
                  selectedPerRequirement={selectedPerRequirement}
                  onSelect={onSelect}
                  selectedOptionsPerRequirement={selectedOptionsPerRequirement}
                  onSelectOption={onSelectOption}
                  ancestorSelections={ancestorSelections}
                  activeBranch={activeBranch}
                  depth={depth + 1}
                  prereqEligible={prereqEligible}
                  levelBuckets={levelBuckets}
                  languageBuckets={languageBuckets}
                  electiveLevelBuckets={electiveLevelBuckets}
                  unassignedCompletedSet={unassignedCompletedSet}
                  unassignedCompletedSetNormalized={
                    unassignedCompletedSetNormalized
                  }
                  allAssignedCoursesNormalized={allAssignedCoursesNormalized}
                  includeClosedComponents={includeClosedComponents}
                />
              );
            })}
          </Stack>
        </Collapse>
      </Paper>
    );
  }

  const label =
    creditsNeeded > 0 && !showAsComplete
      ? `${title} (${creditsRemaining} credit${creditsRemaining !== 1 ? "s" : ""} needed)`
      : title;

  return (
    <Paper
      p="sm"
      withBorder
      radius={0}
      mt="xs"
      style={{
        paddingLeft:
          depth * REQUIREMENT_INDENT_PX + REQUIREMENT_BASE_PADDING_PX,
        backgroundColor: hasOptions
          ? opened
            ? "var(--mantine-color-dark-6)"
            : "var(--mantine-color-dark-8)"
          : "var(--mantine-color-dark-7)",
      }}
    >
      <Stack gap="xs">
        <Group
          justify="space-between"
          wrap="nowrap"
          align="flex-start"
          onClick={hasOptions ? toggleLocal : undefined}
          style={hasOptions ? { cursor: "pointer" } : undefined}
        >
          <Group gap="xs" align="flex-start">
            {radio && (
              <Radio
                checked={radio.checked}
                onChange={radio.onChange}
                name={radio.name}
                value={radio.value}
                disabled={radio.disabled}
                onClick={(e) => e.stopPropagation()}
              />
            )}
            {hasOptions && (
              <IconChevronDown
                size={16}
                style={{
                  marginTop: 2,
                  transform: opened ? "rotate(0deg)" : "rotate(-90deg)",
                  transition: "transform 150ms ease",
                }}
              />
            )}
            <Text fw={500} size="sm" lh={1.3} lineClamp={2}>
              {label}
            </Text>
          </Group>
          {satisfiedBySelection && allSelectedTaken ? (
            <Badge color="green" variant="light" size="sm">
              Complete
            </Badge>
          ) : satisfiedBySelection ? (
            <Badge color="teal" variant="light" size="sm">
              Satisfied
            </Badge>
          ) : hasRequirementId && creditsRemaining > 0 ? (
            <Badge color="blue" variant="light" size="sm">
              {creditsRemaining} credit{creditsRemaining !== 1 ? "s" : ""}{" "}
              needed
            </Badge>
          ) : null}
        </Group>
        {multiSelectBlock}
        {hasOptions && (node.type === "pick" || node.type === "group") && (
          <Collapse in={opened}>
            <Stack gap="xs" pl="xs">
              {node.options!.map((child, idx) => {
                const childKey = getStableNodeKey(
                  child,
                  `${getStableNodeKey(node, "parent")}:child:${idx}`,
                );
                return (
                  <RequirementNode
                    key={childKey}
                    nodeKey={childKey}
                    node={child}
                    cache={cache}
                    completedCourses={completedCourses}
                    selectedPerRequirement={selectedPerRequirement}
                    onSelect={onSelect}
                    selectedOptionsPerRequirement={
                      selectedOptionsPerRequirement
                    }
                    onSelectOption={onSelectOption}
                    ancestorSelections={ancestorSelections}
                    activeBranch={activeBranch}
                    depth={depth + 1}
                    prereqEligible={prereqEligible}
                    levelBuckets={levelBuckets}
                    languageBuckets={languageBuckets}
                    electiveLevelBuckets={electiveLevelBuckets}
                    unassignedCompletedSet={unassignedCompletedSet}
                    unassignedCompletedSetNormalized={
                      unassignedCompletedSetNormalized
                    }
                    allAssignedCoursesNormalized={allAssignedCoursesNormalized}
                    includeClosedComponents={includeClosedComponents}
                  />
                );
              })}
            </Stack>
          </Collapse>
        )}
      </Stack>
    </Paper>
  );
});
