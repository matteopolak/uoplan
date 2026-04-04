import {
  useState,
  
  
  useMemo,
  memo,
  
  type CSSProperties,
  type MouseEvent,
  type KeyboardEvent,
  type ReactNode,
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
import type { PaperProps } from "@mantine/core";
import { IconCheck, IconChevronDown, IconX } from "@tabler/icons-react";
import type { ComboboxItem } from "@mantine/core";
import type { DataCache } from "schedule";
import { normalizeCourseCode } from "schedule";
import type { RequirementWithStatus } from "schedule";
import {
  getConstrainMultiSelectOptions,
  getOptionSecondarySummaryLine,
  simplifySingleChildChain,
} from "./requirementUtils";
import { tr } from "../../i18n";

export const REQUIREMENT_INDENT_PX = 12;
export const REQUIREMENT_BASE_PADDING_PX = 10;

const TITLE_FLEX = { flex: 1, minWidth: 0 } as const;
const BADGE_NO_SHRINK = { flexShrink: 0 } as const;

const OPTION_CARD_BORDER_UNSELECTED = "var(--mantine-color-dark-4)";
const OPTION_CARD_BORDER_SELECTED = "var(--mantine-color-violet-6)";
const OPTION_CARD_BG_SELECTED = "var(--mantine-color-violet-light)";
const OPTION_CARD_HOVER_BG = "var(--mantine-color-dark-5)";

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

function optionsStepOptionCardAriaLabel(node: RequirementWithStatus): string {
  return (
    getOptionSecondarySummaryLine(node) ??
    getNodeDisplayTitle(node) ??
    "Select this requirement option"
  );
}

/** Path of (requirementId, optionIndex) from root to this node so selecting a nested option can auto-select parents. */
export type AncestorSelection = { requirementId: string; optionIndex: number };

export interface RequirementNodeProps {
  node: RequirementWithStatus;
  cache: DataCache | null;
  completedCourses: Set<string>;
  selectedPerRequirement: Record<string, string[]>;
  /** Constrain-step selections, used to exempt explicit courses from virtual-only filtering. */
  constrainedPerRequirement?: Record<string, string[]>;
  onSelect: (requirementId: string, courses: string[]) => void;
  selectedOptionsPerRequirement: Record<string, number>;
  onSelectOption?: (requirementId: string, optionIndex: number) => void;
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
  virtualSectionsOnly: boolean;
  /** When true, restrict the dropdown to only courses in completedCourses (Assign step). */
  completedOnly?: boolean;
  /** When true, hide the course-selection dropdown and credits prompts (Options step). */
  hideSelection?: boolean;
  /**
   * When true with `hideSelection` + option `radio`, hides catalogue-style titles on
   * option cards; body (nested groups, summaries) stays visible.
   */
  optionsStepHideCardTitle?: boolean;
}

type RadioConfig = NonNullable<RequirementNodeProps["radio"]>;

export type OptionCardRadioConfig = RadioConfig;

type SelectableOptionPaperProps = Omit<PaperProps, "children"> & {
  radio: OptionCardRadioConfig;
  node: RequirementWithStatus;
  optionsStepHideCardTitle: boolean;
  children: ReactNode;
};

/** Options step: entire card is clickable; hover feedback; nested cards stopPropagation. */
function SelectableOptionPaper({
  radio,
  node,
  optionsStepHideCardTitle,
  style,
  children,
  ...paperProps
}: SelectableOptionPaperProps) {
  const [hover, setHover] = useState(false);
  const flatStyle = (style ?? {}) as CSSProperties;
  const { backgroundColor: bgFromStyle, ...restFlat } = flatStyle;
  const idleBg =
    (typeof bgFromStyle === "string" && bgFromStyle) ||
    "var(--mantine-color-dark-6)";
  const visualBg = radio.checked
    ? OPTION_CARD_BG_SELECTED
    : hover && !radio.disabled
      ? OPTION_CARD_HOVER_BG
      : idleBg;

  return (
    <Paper
      {...paperProps}
      withBorder={false}
      radius={0}
      role="radio"
      aria-checked={radio.checked}
      aria-disabled={radio.disabled}
      aria-label={
        optionsStepHideCardTitle
          ? optionsStepOptionCardAriaLabel(node)
          : undefined
      }
      tabIndex={radio.disabled ? -1 : 0}
      onMouseEnter={() => {
        if (!radio.disabled) setHover(true);
      }}
      onMouseLeave={() => setHover(false)}
      onClick={(e: MouseEvent<HTMLDivElement>) => {
        e.stopPropagation();
        if (!radio.disabled) radio.onChange();
      }}
      onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
        if (radio.disabled) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          radio.onChange();
        }
      }}
      style={{
        ...restFlat,
        backgroundColor: visualBg,
        cursor: radio.disabled ? undefined : "pointer",
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: radio.checked
          ? OPTION_CARD_BORDER_SELECTED
          : OPTION_CARD_BORDER_UNSELECTED,
        transition: "background-color 120ms ease, border-color 120ms ease",
        boxShadow: hover && !radio.disabled && !radio.checked
          ? "0 0 0 1px var(--mantine-color-dark-3)"
          : undefined,
      }}
    >
      {children}
    </Paper>
  );
}

export const RequirementNode = memo(function RequirementNode({
  node: rawNode,
  cache,
  completedCourses,
  selectedPerRequirement,
  constrainedPerRequirement,
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
  virtualSectionsOnly,
  completedOnly = false,
  hideSelection = false,
  optionsStepHideCardTitle = false,
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
    () => hideSelection || (depth === 0 && (autoExpanded || !hasSummary)),
  );

  const collapseIn = hideSelection || opened;

  const toggleLocal = (e: MouseEvent) => {
    e.stopPropagation();
    if (hideSelection || !hasOptions) return;
    setOpened((o) => !o);
  };

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
  const { selectedForDisplay, options } = useMemo(() => {
    return getConstrainMultiSelectOptions(node, selectedPerRequirement, {
      cache,
      completedCourses,
      prereqEligible,
      levelBuckets,
      languageBuckets,
      electiveLevelBuckets,
      unassignedCompletedSetNormalized,
      allAssignedCoursesNormalized,
      includeClosedComponents,
      virtualSectionsOnly,
      constrainedPerRequirement,
      completedOnly,
    });
  }, [
    node,
    prereqEligible,
    levelBuckets,
    languageBuckets,
    electiveLevelBuckets,
    cache,
    completedCourses,
    unassignedCompletedSetNormalized,
    allAssignedCoursesNormalized,
    includeClosedComponents,
    virtualSectionsOnly,
    completedOnly,
    selectedPerRequirement,
    constrainedPerRequirement,
  ]);

  if (isSection) {
    return (
      <Text fw={600} size="sm" c="dimmed" mt={depth > 0 ? "md" : 0} mb="xs">
        {title}
      </Text>
    );
  }

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
          {tr("requirementNode.satisfiedBy", {
            courses: satisfiedByDisplayUnique.sort().join(", "),
          })}
        </Text>
      )}
      {creditsNeeded > 0 && (
        <Text size="xs" c={isOverSelected ? "yellow" : "dimmed"}>
          {isOverSelected
            ? tr("requirementNode.overSelected", {
                selectedCredits,
                creditsNeeded,
                suffix: creditsNeeded !== 1 ? "s" : "",
              })
            : selectedCredits > 0
              ? tr("requirementNode.progress", {
                  selectedCredits,
                  creditsNeeded,
                  nextAction:
                    creditsRemaining > 0
                      ? tr("requirementNode.pickMore", {
                          count: Math.ceil(creditsRemaining / 3),
                          suffix:
                            Math.ceil(creditsRemaining / 3) !== 1 ? "s" : "",
                        })
                      : tr("requirementNode.satisfied"),
                })
              : tr("requirementNode.selectToFulfill", {
                  creditsRemaining,
                  suffix: creditsRemaining !== 1 ? "s" : "",
                })}
        </Text>
      )}
      <MultiSelect
        label={tr("requirementNode.coursesLabel")}
        placeholder={tr("requirementNode.searchPlaceholder")}
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
                <Badge
                  size="xs"
                  color="gray"
                  variant="light"
                  style={BADGE_NO_SHRINK}
                >
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
        nothingFoundMessage={tr("requirementNode.noCoursesFound")}
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
          <Text size="sm" c="dimmed" lineClamp={1} style={TITLE_FLEX}>
            {title}
          </Text>
          <Text size="xs" c="dimmed" style={{ minWidth: 0 }}>
            {satisfiedByDisplayUnique.sort().join(", ")}
          </Text>
          <Badge
            color="green"
            variant="light"
            size="sm"
            style={BADGE_NO_SHRINK}
          >
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

    const orGroupShared = (
      <>
        {radio && hideSelection && !optionsStepHideCardTitle && (
          <Group justify="space-between" align="center" wrap="nowrap" mb={4}>
            <Text fw={500} size="sm" lh={1.25} style={{ minWidth: 0 }}>
              {groupLabel}
            </Text>
            {node.complete && node.satisfiedOptionIndex != null && (
              <Badge
                color="green"
                variant="light"
                size="sm"
                style={BADGE_NO_SHRINK}
              >
                Complete
              </Badge>
            )}
          </Group>
        )}
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
        <Collapse in={collapseIn}>
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
              const summaryLine =
                hideSelection && !optionsStepHideCardTitle
                  ? getOptionSecondarySummaryLine(opt)
                  : null;
              return (
                <Box key={childKey}>
                  {summaryLine && (
                    <Text size="xs" c="dimmed" mb={4}>
                      {summaryLine}
                    </Text>
                  )}
                  <RequirementNode
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
                    virtualSectionsOnly={virtualSectionsOnly}
                    completedOnly={completedOnly}
                    hideSelection={hideSelection}
                    optionsStepHideCardTitle={optionsStepHideCardTitle}
                    radio={
                      node.requirementId != null && !node.complete
                        ? {
                            checked: isSelected,
                            onChange: () => {
                              ancestorSelections?.forEach(
                                ({ requirementId, optionIndex }) =>
                                  onSelectOption?.(requirementId, optionIndex),
                              );
                              onSelectOption?.(node.requirementId!, idx);
                            },
                            name: node.requirementId,
                            value: String(idx),
                          }
                        : undefined
                    }
                  />
                  {isSatisfiedOption && opt.satisfiedBy.length > 0 && (
                    <Box pl="sm" mt={4}>
                      <Badge
                        color="green"
                        variant="light"
                        size="sm"
                        style={BADGE_NO_SHRINK}
                      >
                        Satisfied by: {opt.satisfiedBy.join(", ")}
                      </Badge>
                    </Box>
                  )}
                </Box>
              );
            })}
          </Stack>
        </Collapse>
      </>
    );

    if (radio && hideSelection) {
      return (
        <SelectableOptionPaper
          radio={radio}
          node={node}
          optionsStepHideCardTitle={optionsStepHideCardTitle}
          p="sm"
          mt="xs"
          data-missing-selection={showError ? "true" : undefined}
          style={{
            paddingLeft:
              depth * REQUIREMENT_INDENT_PX + REQUIREMENT_BASE_PADDING_PX,
          }}
        >
          {orGroupShared}
        </SelectableOptionPaper>
      );
    }

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
          backgroundColor:
            hideSelection || opened
              ? "var(--mantine-color-dark-6)"
              : "var(--mantine-color-dark-8)",
        }}
      >
        <Group
          justify="space-between"
          align="center"
          wrap="nowrap"
          mb={0}
          onClick={hideSelection ? undefined : toggleLocal}
          style={{ cursor: hideSelection ? undefined : "pointer" }}
        >
          <Group gap="xs" align="center" style={TITLE_FLEX}>
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
            {!hideSelection && (
              <IconChevronDown
                size={14}
                style={{
                  flexShrink: 0,
                  transform: opened ? "rotate(0deg)" : "rotate(-90deg)",
                  transition: "transform 150ms ease",
                }}
              />
            )}
            <Text fw={500} size="sm" lh={1.25} style={{ minWidth: 0 }}>
              {groupLabel}
            </Text>
          </Group>
          {node.complete && node.satisfiedOptionIndex != null && (
            <Badge
              color="green"
              variant="light"
              size="sm"
              style={BADGE_NO_SHRINK}
            >
              Complete
            </Badge>
          )}
        </Group>
        {orGroupShared}
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

    const optionsGroupShared = (
      <>
        {radio && hideSelection && !optionsStepHideCardTitle && (
          <Group justify="space-between" align="center" wrap="nowrap" mb={4}>
            <Text fw={500} size="sm" lh={1.25} style={{ minWidth: 0 }}>
              {title}
            </Text>
            {node.complete && (
              <Badge
                color="green"
                variant="light"
                size="sm"
                style={BADGE_NO_SHRINK}
              >
                Complete
              </Badge>
            )}
          </Group>
        )}
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
        <Collapse in={collapseIn}>
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
              const summaryLine =
                hideSelection && !optionsStepHideCardTitle
                  ? getOptionSecondarySummaryLine(opt)
                  : null;
              return (
                <Box key={childKey}>
                  {summaryLine && (
                    <Text size="xs" c="dimmed" mb={4}>
                      {summaryLine}
                    </Text>
                  )}
                  <RequirementNode
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
                    virtualSectionsOnly={virtualSectionsOnly}
                    completedOnly={completedOnly}
                    hideSelection={hideSelection}
                    optionsStepHideCardTitle={optionsStepHideCardTitle}
                    radio={
                      node.requirementId != null && !node.complete
                        ? {
                            checked: isSelected,
                            onChange: () => {
                              ancestorSelections?.forEach(
                                ({ requirementId, optionIndex }) =>
                                  onSelectOption?.(requirementId, optionIndex),
                              );
                              onSelectOption?.(node.requirementId!, idx);
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
      </>
    );

    if (radio && hideSelection) {
      return (
        <SelectableOptionPaper
          radio={radio}
          node={node}
          optionsStepHideCardTitle={optionsStepHideCardTitle}
          p="sm"
          mt="xs"
          data-missing-selection={showError ? "true" : undefined}
          style={{
            paddingLeft:
              depth * REQUIREMENT_INDENT_PX + REQUIREMENT_BASE_PADDING_PX,
          }}
        >
          {optionsGroupShared}
        </SelectableOptionPaper>
      );
    }

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
          backgroundColor:
            hideSelection || opened
              ? "var(--mantine-color-dark-6)"
              : "var(--mantine-color-dark-8)",
        }}
      >
        <Group
          justify="space-between"
          align="center"
          wrap="nowrap"
          mb={0}
          onClick={hideSelection ? undefined : toggleLocal}
          style={{ cursor: hideSelection ? undefined : "pointer" }}
        >
          <Group gap="xs" align="center" style={TITLE_FLEX}>
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
            {!hideSelection && (
              <IconChevronDown
                size={14}
                style={{
                  flexShrink: 0,
                  transform: opened ? "rotate(0deg)" : "rotate(-90deg)",
                  transition: "transform 150ms ease",
                }}
              />
            )}
            <Text fw={500} size="sm" lh={1.25} style={{ minWidth: 0 }}>
              {title}
            </Text>
          </Group>
          {node.complete && (
            <Badge
              color="green"
              variant="light"
              size="sm"
              style={BADGE_NO_SHRINK}
            >
              Complete
            </Badge>
          )}
        </Group>
        {optionsGroupShared}
      </Paper>
    );
  }

  if (isAnd && hasOptions) {
    const andCollapse = (
      <Collapse in={collapseIn}>
        <Stack gap="xs">
          {node.options!.map((child, idx) => {
            const childKey = getStableNodeKey(
              child,
              `${getStableNodeKey(node, "parent")}:child:${idx}`,
            );
            return (
              <RequirementNode
                key={childKey}
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
                virtualSectionsOnly={virtualSectionsOnly}
                completedOnly={completedOnly}
                hideSelection={hideSelection}
                optionsStepHideCardTitle={optionsStepHideCardTitle}
              />
            );
          })}
        </Stack>
      </Collapse>
    );

    if (radio && hideSelection) {
      return (
        <SelectableOptionPaper
          radio={radio}
          node={node}
          optionsStepHideCardTitle={optionsStepHideCardTitle}
          p="sm"
          mt="xs"
          style={{
            paddingLeft:
              depth * REQUIREMENT_INDENT_PX + REQUIREMENT_BASE_PADDING_PX,
          }}
        >
          {title && !optionsStepHideCardTitle && (
            <Group justify="space-between" align="center" wrap="nowrap" mb={4}>
              <Text fw={500} size="sm" lh={1.25} style={{ minWidth: 0 }}>
                {title}
              </Text>
              {node.complete && (
                <Badge
                  color="green"
                  variant="light"
                  size="sm"
                  style={BADGE_NO_SHRINK}
                >
                  Complete
                </Badge>
              )}
            </Group>
          )}
          {andCollapse}
        </SelectableOptionPaper>
      );
    }

    return (
      <Paper
        p="sm"
        withBorder
        radius={0}
        mt="xs"
        style={{
          paddingLeft:
            depth * REQUIREMENT_INDENT_PX + REQUIREMENT_BASE_PADDING_PX,
          backgroundColor:
            hideSelection || opened
              ? "var(--mantine-color-dark-6)"
              : "var(--mantine-color-dark-8)",
        }}
      >
        {title && (
          <Group
            justify="space-between"
            align="center"
            wrap="nowrap"
            mb={0}
            onClick={hideSelection ? undefined : toggleLocal}
            style={{ cursor: hideSelection ? undefined : "pointer" }}
          >
            <Group gap="xs" align="center" style={TITLE_FLEX}>
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
              {!hideSelection && (
                <IconChevronDown
                  size={14}
                  style={{
                    flexShrink: 0,
                    transform: opened ? "rotate(0deg)" : "rotate(-90deg)",
                    transition: "transform 150ms ease",
                  }}
                />
              )}
              <Text fw={500} size="sm" lh={1.25} style={{ minWidth: 0 }}>
                {title}
              </Text>
            </Group>
            {node.complete && (
              <Badge
                color="green"
                variant="light"
                size="sm"
                style={BADGE_NO_SHRINK}
              >
                Complete
              </Badge>
            )}
          </Group>
        )}
        {andCollapse}
      </Paper>
    );
  }

  const label =
    creditsNeeded > 0 && !showAsComplete
      ? `${title} (${creditsRemaining} credit${creditsRemaining !== 1 ? "s" : ""} needed)`
      : title;

  const leafPickCollapse =
    hasOptions && (node.type === "pick" || node.type === "group") ? (
      <Collapse in={collapseIn}>
        <Stack gap="xs" pl="xs">
          {node.options!.map((child, idx) => {
            const childKey = getStableNodeKey(
              child,
              `${getStableNodeKey(node, "parent")}:child:${idx}`,
            );
            return (
              <RequirementNode
                key={childKey}
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
                virtualSectionsOnly={virtualSectionsOnly}
                completedOnly={completedOnly}
                hideSelection={hideSelection}
                optionsStepHideCardTitle={optionsStepHideCardTitle}
              />
            );
          })}
        </Stack>
      </Collapse>
    ) : null;

  const leafBadgeRow =
    satisfiedBySelection && allSelectedTaken ? (
      <Badge color="green" variant="light" size="sm" style={BADGE_NO_SHRINK}>
        Complete
      </Badge>
    ) : satisfiedBySelection ? (
      <Badge color="teal" variant="light" size="sm" style={BADGE_NO_SHRINK}>
        Satisfied
      </Badge>
    ) : hasRequirementId && creditsRemaining > 0 && !hideSelection ? (
      <Badge color="blue" variant="light" size="sm" style={BADGE_NO_SHRINK}>
        {creditsRemaining} credit{creditsRemaining !== 1 ? "s" : ""} needed
      </Badge>
    ) : null;

  const leafPrimaryText = !optionsStepHideCardTitle ? (
    <Text
      fw={500}
      size="sm"
      lh={1.3}
      lineClamp={2}
      style={{ minWidth: 0, flex: 1 }}
    >
      {label}
    </Text>
  ) : (() => {
      const line = getOptionSecondarySummaryLine(node);
      if (line) {
        return (
          <Text
            size="xs"
            c="dimmed"
            lh={1.35}
            style={{ minWidth: 0, flex: 1 }}
          >
            {line}
          </Text>
        );
      }
      if (hasRequirementId && creditsRemaining > 0) {
        return (
          <Text size="xs" c="dimmed" style={{ minWidth: 0, flex: 1 }}>
            {creditsRemaining} credit{creditsRemaining !== 1 ? "s" : ""}{" "}
            needed
          </Text>
        );
      }
      return (
        <Text size="xs" c="dimmed" style={{ minWidth: 0, flex: 1 }}>
          Tap to select
        </Text>
      );
    })();

  const defaultPaperBg = hasOptions
    ? hideSelection || opened
      ? "var(--mantine-color-dark-6)"
      : "var(--mantine-color-dark-8)"
    : "var(--mantine-color-dark-7)";

  if (radio && hideSelection) {
    return (
      <SelectableOptionPaper
        radio={radio}
        node={node}
        optionsStepHideCardTitle={optionsStepHideCardTitle}
        p="sm"
        mt="xs"
        style={{
          paddingLeft:
            depth * REQUIREMENT_INDENT_PX + REQUIREMENT_BASE_PADDING_PX,
          backgroundColor: defaultPaperBg,
        }}
      >
        <Stack gap="xs">
          <Group
            justify="space-between"
            wrap="nowrap"
            align="flex-start"
            gap="xs"
            style={{ width: "100%" }}
          >
            {leafPrimaryText}
            {leafBadgeRow}
          </Group>
          {leafPickCollapse}
        </Stack>
      </SelectableOptionPaper>
    );
  }

  return (
    <Paper
      p="sm"
      withBorder
      radius={0}
      mt="xs"
      style={{
        paddingLeft:
          depth * REQUIREMENT_INDENT_PX + REQUIREMENT_BASE_PADDING_PX,
        backgroundColor: defaultPaperBg,
      }}
    >
      <Stack gap="xs">
        <Group
          justify="space-between"
          wrap="nowrap"
          align="flex-start"
          onClick={hasOptions && !hideSelection ? toggleLocal : undefined}
          style={
            hasOptions && !hideSelection ? { cursor: "pointer" } : undefined
          }
        >
          <Group gap="xs" align="flex-start" style={TITLE_FLEX}>
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
            {hasOptions && !hideSelection && (
              <IconChevronDown
                size={16}
                style={{
                  flexShrink: 0,
                  marginTop: 2,
                  transform: opened ? "rotate(0deg)" : "rotate(-90deg)",
                  transition: "transform 150ms ease",
                }}
              />
            )}
            <Text fw={500} size="sm" lh={1.3} lineClamp={2} style={{ minWidth: 0 }}>
              {label}
            </Text>
          </Group>
          {leafBadgeRow}
        </Group>
        {!hideSelection && multiSelectBlock}
        {leafPickCollapse}
      </Stack>
    </Paper>
  );
}, function areEqual(prevProps, nextProps) {
  if (prevProps.activeBranch !== nextProps.activeBranch) return false;
  if (prevProps.depth !== nextProps.depth) return false;
  if (prevProps.radio !== nextProps.radio) return false;
  if (prevProps.includeClosedComponents !== nextProps.includeClosedComponents) return false;
  if (prevProps.virtualSectionsOnly !== nextProps.virtualSectionsOnly) return false;
  
  if (prevProps.node !== nextProps.node) return false;

  // We can optimize global map checks by seeing if this specific node's requirementId changed.
  // We check subtree reqIds in the tree.
  const reqId = nextProps.node.requirementId;
  
  if (reqId) {
    if (prevProps.selectedPerRequirement[reqId] !== nextProps.selectedPerRequirement[reqId]) return false;
    if (prevProps.constrainedPerRequirement?.[reqId] !== nextProps.constrainedPerRequirement?.[reqId]) return false;
    if (prevProps.selectedOptionsPerRequirement[reqId] !== nextProps.selectedOptionsPerRequirement[reqId]) return false;
  }

  // Check object references that don't change very often
  if (prevProps.completedCourses !== nextProps.completedCourses) return false;
  if (prevProps.unassignedCompletedSet !== nextProps.unassignedCompletedSet) return false;
  if (prevProps.unassignedCompletedSetNormalized !== nextProps.unassignedCompletedSetNormalized) return false;
  if (prevProps.allAssignedCoursesNormalized !== nextProps.allAssignedCoursesNormalized) return false;
  if (prevProps.prereqEligible !== nextProps.prereqEligible) return false;
  if (prevProps.levelBuckets !== nextProps.levelBuckets) return false;
  if (prevProps.languageBuckets !== nextProps.languageBuckets) return false;
  if (prevProps.electiveLevelBuckets !== nextProps.electiveLevelBuckets) return false;
  if (prevProps.ancestorSelections !== nextProps.ancestorSelections) return false;

  // If this node is NOT a leaf, we MUST ensure we re-render if any of its descendants' requirementIds
  // have changed in the Maps. A simple trick: if it's a leaf, we can return true! 
  // If it's a parent, it's safer to just check Map reference equality, as the parent needs to 
  // pass down the fresh maps. Actually, React will skip the parent but re-render the child 
  // ONLY if the parent didn't re-render. But the child gets its props FROM the parent! 
  // Wait, if parent is memo'd and skips render, children do NOT get new props.
  // So we MUST re-render the parent if ANY child needs to re-render.
  // To avoid this, we should NOT check subtree equality, but instead we just return false
  // if the map reference changed and the node has children.
  
  const hasChildren = nextProps.node.options && nextProps.node.options.length > 0;
  if (hasChildren) {
    if (prevProps.selectedPerRequirement !== nextProps.selectedPerRequirement) return false;
    if (prevProps.selectedOptionsPerRequirement !== nextProps.selectedOptionsPerRequirement) return false;
    if (prevProps.constrainedPerRequirement !== nextProps.constrainedPerRequirement) return false;
  }

  return true;
});
