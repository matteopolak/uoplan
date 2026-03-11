import { useState, MouseEvent } from 'react';
import { Stack, MultiSelect, Text, Paper, Badge, Group, Box, Collapse, Radio, Alert } from '@mantine/core';
import { IconCheck, IconChevronDown } from '@tabler/icons-react';
import { createCourseOptions } from './CourseSelect';
import type { ComboboxItem } from '@mantine/core';
import type { DataCache } from '../lib/dataCache';
import { normalizeCourseCode } from '../lib/dataCache';
import { courseMatchesFilters } from '../lib/courseFilters';
import type {
  RemainingRequirement,
  RequirementWithStatus,
  CompletedRequirementItem,
} from '../lib/requirements';

const REQUIREMENT_INDENT_PX = 12;
const REQUIREMENT_BASE_PADDING_PX = 10;

function getStableNodeKey(node: RequirementWithStatus, fallback: string): string {
  // Prefer a real stable identifier if present.
  if (node.requirementId) return `req:${node.requirementId}`;
  // Otherwise build a reasonably-stable fingerprint (titles/codes/types generally don't change on selection).
  const title = (node.title ?? '').trim();
  const code = (node.code ?? '').trim();
  return `node:${node.type}:${code}:${title}:${fallback}`;
}

interface RequirementsStepProps {
  cache: DataCache | null;
  remainingRequirements: RemainingRequirement[];
  requirementTreeWithStatus: RequirementWithStatus[];
  completedRequirementsList: CompletedRequirementItem[];
  completedCourses: string[];
  unassignedCompletedCourses: string[];
  selectedPerRequirement: Record<string, string[]>;
  onSelect: (requirementId: string, courses: string[]) => void;
  selectedOptionsPerRequirement: Record<string, number>;
  onSelectOption: (requirementId: string, optionIndex: number) => void;
  prereqEligibleCourses: string[];
  levelBuckets: ('undergrad' | 'grad')[];
  languageBuckets: ('en' | 'fr' | 'other')[];
  electiveLevelBuckets: number[];
  onChangeLevelBuckets: (buckets: ('undergrad' | 'grad')[]) => void;
  onChangeLanguageBuckets: (buckets: ('en' | 'fr' | 'other')[]) => void;
  onChangeElectiveLevelBuckets: (buckets: number[]) => void;
}

function getSelectedCredits(cache: DataCache | null, courseCodes: string[]): number {
  if (!cache) return 0;
  return courseCodes.reduce(
    (sum, code) => sum + (cache.getCourse(code)?.credits ?? 3),
    0
  );
}

function normalizeTitleForCompare(title: string | undefined): string {
  return (title ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function getNodeDisplayTitle(node: RequirementWithStatus): string {
  const rawTitle = (node.title ?? '').trim();
  const fallback = rawTitle || node.code || `${node.type} requirement`;
  if (node.type === 'or_group') {
    const useGenericLabel = rawTitle === '' || rawTitle.toLowerCase() === 'or';
    return useGenericLabel ? 'One of the following must be completed' : fallback;
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

  // Only inline when the node itself doesn't represent a selectable requirement slot.
  while (
    current.requirementId == null &&
    current.options &&
    current.options.length === 1 &&
    current.options[0] &&
    (current.options[0].options?.length ?? 0) > 0 &&
    // Inline primarily when titles are duplicated or one side is blank/generic.
    (() => {
      const parentT = normalizeTitleForCompare(current.title);
      const childT = normalizeTitleForCompare(current.options![0].title);
      const parentGeneric = parentT === '' || parentT === 'or';
      const childGeneric = childT === '' || childT === 'or';
      return parentGeneric || childGeneric || parentT === childT;
    })()
  ) {
    const child = current.options[0];
    current = {
      ...child,
      // Preserve the most descriptive title between wrapper and child.
      title: (current.title ?? '').trim() ? current.title : child.title,
      code: current.code ?? child.code,
    };
    changed = true;
  }

  return { node: current, autoExpanded: changed };
}

/** Path of (requirementId, optionIndex) from root to this node so selecting a nested option can auto-select parents. */
type AncestorSelection = { requirementId: string; optionIndex: number };

interface RequirementNodeProps {
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
  levelBuckets: ('undergrad' | 'grad')[];
  languageBuckets: ('en' | 'fr' | 'other')[];
  electiveLevelBuckets: number[];
  /** Course codes that are completed but not yet assigned to any requirement; show first in dropdown with checkmark. */
  unassignedCompletedSet: Set<string>;
  /** Normalized form of unassigned completed (for dedupe/checkmark when option value is canonical). */
  unassignedCompletedSetNormalized: Set<string>;
}

function RequirementNode({
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
}: RequirementNodeProps) {
  // If a parent (like an option) is responsible for selection UX, don't remove it,
  // but we still want to reduce *nested* single-child wrappers inside it.
  const radioSafeMerge = (() => {
    if (!radio) return null;
    if (!rawNode.options || rawNode.options.length !== 1) return null;
    const onlyChild = rawNode.options[0];
    if (!onlyChild?.options || onlyChild.options.length === 0) return null;

    const parentTitle = (rawNode.title ?? '').trim();
    const childTitle = getNodeDisplayTitle(onlyChild);
    const mergedTitle =
      parentTitle && childTitle
        ? `${parentTitle}${parentTitle.endsWith(':') ? ' ' : ': '}${childTitle}`
        : parentTitle || childTitle || rawNode.code || `${rawNode.type} requirement`;

    // Replace wrapper with child node (keeps inner group logic + errors),
    // but retain the wrapper's label as a prefix in the title.
    const merged: RequirementWithStatus = {
      ...onlyChild,
      title: mergedTitle,
      // Treat as complete only if both wrapper+child are complete.
      complete: rawNode.complete && onlyChild.complete,
      satisfiedBy: rawNode.satisfiedBy.length ? rawNode.satisfiedBy : onlyChild.satisfiedBy,
    };
    return { node: merged, autoExpanded: true };
  })();

  const { node, autoExpanded } = radioSafeMerge
    ? radioSafeMerge
    : radio
      ? { node: rawNode, autoExpanded: false }
      : simplifySingleChildChain(rawNode);
  const hasOptions = node.options && node.options.length > 0;
  const rawTitle = (node.title ?? '').trim();
  const title = rawTitle || node.code || `${node.type} requirement`;
  const isOrGroup = node.type === 'or_group';
  const isOptionsGroup = node.type === 'options_group';
  const isAnd = node.type === 'and';
  const isSection = node.type === 'section';

  const creditsNeeded = node.creditsNeeded ?? 0;
  const hasNiceTitle = rawTitle.length > 0;
  const hasCode = !!node.code;
  const hasCreditsInfo = creditsNeeded > 0;
  const hasSatisfiedInfo = node.complete && node.satisfiedBy.length > 0;
  const hasSummary = hasNiceTitle || hasCode || hasCreditsInfo || hasSatisfiedInfo;

  const [opened, setOpened] = useState(
    () => depth === 0 && (autoExpanded || !hasSummary)
  );

  const toggleLocal = (e: MouseEvent) => {
    e.stopPropagation();
    if (!hasOptions) return;
    setOpened((o) => !o);
  };

  if (isSection) {
    return (
      <Text fw={600} size="sm" c="dimmed" mt={depth > 0 ? 'md' : 0} mb="xs">
        {title}
      </Text>
    );
  }

  const selected = node.requirementId
    ? (selectedPerRequirement[node.requirementId] ?? [])
    : [];
  const selectedCreditsForComplete = getSelectedCredits(cache, selected);
  const satisfiedBySelection =
    node.requirementId != null && creditsNeeded > 0 && selectedCreditsForComplete >= creditsNeeded;
  const allSelectedTaken =
    selected.length > 0 && selected.every((c) => completedCourses.has(c));
  const showAsComplete =
    (node.complete && node.satisfiedBy.length > 0) || satisfiedBySelection;
  const hasRequirementId = node.requirementId != null;
  const isElectiveWithExclusions =
    (node.type === 'discipline_elective' ||
      node.type === 'elective' ||
      node.type === 'faculty_elective' ||
      node.type === 'free_elective' ||
      node.type === 'non_discipline_elective') &&
    (node.excluded_disciplines?.length ?? 0) > 0;
  const isCompletedCourse = (code: string): boolean => {
    const norm = normalizeCourseCode(code);
    const canonical = cache?.getCourse(norm)?.code ?? code;
    return completedCourses.has(canonical) || completedCourses.has(norm);
  };
  const filtered =
    node.candidateCourses
      // Include both completed (for assignment to this requirement) and not-yet-taken (for "want in schedule")
      ?.filter((c) => prereqEligible.has(c))
      // Completed courses should always be assignable:
      // - never filtered by level/language or elective-level buckets
      // - no schedule required (already taken)
      .filter((c) => {
        if (isCompletedCourse(c) || unassignedCompletedSetNormalized.has(normalizeCourseCode(c))) {
          return true;
        }

        // Non-completed courses must match current level/language filters
        if (!courseMatchesFilters(c, { levels: levelBuckets, languageBuckets })) return false;

        // For this term, suggested courses must have a schedule
        if (cache && !cache.getSchedule(c)) return false;

        // Elective-specific level bucket filtering (future courses only)
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
  // Canonicalize selected so pills match options (same course can appear with different spacing/casing)
  const selectedForDisplay = selected.map(
    (c) => cache?.getCourse(normalizeCourseCode(c))?.code ?? c,
  );
  // One entry per course (dedupe by normalized code), use canonical display code so no duplicate rows or glitchy selection
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
  const options = createCourseOptions(availableSorted, cache);
  const selectedCredits = getSelectedCredits(cache, selectedForDisplay);
  const satisfiedByDisplay = [
    ...(node.satisfiedBy ?? []),
    ...selectedForDisplay,
  ].filter(Boolean);
  const satisfiedByDisplayUnique = [...new Set(satisfiedByDisplay)];
  const creditsRemaining = Math.max(0, creditsNeeded - selectedCredits);
  const isOverSelected = creditsNeeded > 0 && selectedCredits > creditsNeeded;

  const multiSelectBlock =
    hasRequirementId ? (
      <Stack gap="xs" mt="xs">
        {satisfiedByDisplayUnique.length > 0 && (
          <Text size="xs" c="dimmed">
            Satisfied by: {satisfiedByDisplayUnique.sort().join(', ')}
          </Text>
        )}
        {creditsNeeded > 0 && (
          <Text size="xs" c={isOverSelected ? 'yellow' : 'dimmed'}>
            {isOverSelected
              ? `You have selected ${selectedCredits} credits, which is more than the ${creditsNeeded} credit${creditsNeeded !== 1 ? 's' : ''} required. Extra courses may not count toward this requirement.`
                : selectedCredits > 0
                ? `${selectedCredits} of ${creditsNeeded} credits selected — ${creditsRemaining > 0 ? `pick ${Math.ceil(creditsRemaining / 3)} more course${Math.ceil(creditsRemaining / 3) !== 1 ? 's' : ''}` : 'requirement satisfied'}`
                : `Select course(s) to fulfill this requirement (${creditsRemaining} credit${creditsRemaining !== 1 ? 's' : ''} needed).`}
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
            const label =
              cache?.getCourse(option.value)?.title
                ? `${option.value} – ${cache.getCourse(option.value)?.title}`
                : option.value;
            if (unassignedCompletedSetNormalized.has(normalizeCourseCode(option.value))) {
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
                o.label.toLowerCase().includes(q)
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
          paddingLeft: depth * REQUIREMENT_INDENT_PX + REQUIREMENT_BASE_PADDING_PX,
          backgroundColor: 'var(--mantine-color-dark-7)',
        }}
      >
        <Group gap="xs" wrap="nowrap" align="center">
          <Text size="sm" c="dimmed" lineClamp={1} style={{ flex: 1 }}>
            {title}
          </Text>
          <Text size="xs" c="dimmed">
            {satisfiedByDisplayUnique.sort().join(', ')}
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
      node.requirementId != null ? selectedOptionsPerRequirement[node.requirementId] : undefined;
    const showError =
      activeBranch && node.requirementId != null && selectedOptionIndex == null && !node.complete;

    const useGenericLabel =
      rawTitle === '' || rawTitle.toLowerCase() === 'or';
    const groupLabel = useGenericLabel
      ? 'One of the following must be completed'
      : title;
    return (
      <Paper
        p="sm"
        withBorder
        radius={0}
        mt="xs"
        style={{
          paddingLeft: depth * REQUIREMENT_INDENT_PX + REQUIREMENT_BASE_PADDING_PX,
          backgroundColor: opened ? 'var(--mantine-color-dark-6)' : 'var(--mantine-color-dark-8)',
        }}
      >
        <Group
          justify="space-between"
          align="center"
          mb={0}
          onClick={toggleLocal}
          style={{ cursor: 'pointer' }}
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
                transform: opened ? 'rotate(0deg)' : 'rotate(-90deg)',
                transition: 'transform 150ms ease',
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
            Satisfied by: {node.satisfiedBy.join(', ')}
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
              const childKey = getStableNodeKey(opt, `${getStableNodeKey(node, 'parent')}:opt:${idx}`);
              return (
                <Box key={childKey}>
                  <RequirementNode
                    node={opt}
                    cache={cache}
                    completedCourses={completedCourses}
                    selectedPerRequirement={selectedPerRequirement}
                    onSelect={onSelect}
                    selectedOptionsPerRequirement={selectedOptionsPerRequirement}
                    onSelectOption={onSelectOption}
                    ancestorSelections={childAncestors}
                    activeBranch={childActiveBranch}
                    depth={depth + 1}
                    prereqEligible={prereqEligible}
                    levelBuckets={levelBuckets}
                    languageBuckets={languageBuckets}
                    electiveLevelBuckets={electiveLevelBuckets}
                  unassignedCompletedSet={unassignedCompletedSet}
                  unassignedCompletedSetNormalized={unassignedCompletedSetNormalized}
                    radio={
                      node.requirementId != null && !node.complete
                        ? {
                            checked: isSelected,
                            onChange: () => {
                              ancestorSelections?.forEach(({ requirementId, optionIndex }) =>
                                onSelectOption(requirementId, optionIndex)
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
                        Satisfied by: {opt.satisfiedBy.join(', ')}
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
      node.requirementId != null ? selectedOptionsPerRequirement[node.requirementId] : undefined;
    const showError =
      activeBranch && node.requirementId != null && selectedOptionIndex == null && !node.complete;

    return (
      <Paper
        p="sm"
        withBorder
        radius={0}
        mt="xs"
        style={{
          paddingLeft: depth * REQUIREMENT_INDENT_PX + REQUIREMENT_BASE_PADDING_PX,
          backgroundColor: opened ? 'var(--mantine-color-dark-6)' : 'var(--mantine-color-dark-8)',
        }}
      >
        <Group
          justify="space-between"
          align="center"
          mb={0}
          onClick={toggleLocal}
          style={{ cursor: 'pointer' }}
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
                transform: opened ? 'rotate(0deg)' : 'rotate(-90deg)',
                transition: 'transform 150ms ease',
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
            Satisfied by option: {node.satisfiedBy.join(', ')}
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
              const childKey = getStableNodeKey(opt, `${getStableNodeKey(node, 'parent')}:opt:${idx}`);
              return (
                <Box key={childKey}>
                  <RequirementNode
                    node={opt}
                    cache={cache}
                    completedCourses={completedCourses}
                    selectedPerRequirement={selectedPerRequirement}
                    onSelect={onSelect}
                    selectedOptionsPerRequirement={selectedOptionsPerRequirement}
                    onSelectOption={onSelectOption}
                    ancestorSelections={childAncestors}
                    activeBranch={childActiveBranch}
                    depth={depth + 1}
                    prereqEligible={prereqEligible}
                    levelBuckets={levelBuckets}
                    languageBuckets={languageBuckets}
                    electiveLevelBuckets={electiveLevelBuckets}
                  unassignedCompletedSet={unassignedCompletedSet}
                  unassignedCompletedSetNormalized={unassignedCompletedSetNormalized}
                    radio={
                      node.requirementId != null && !node.complete
                        ? {
                            checked: isSelected,
                            onChange: () => {
                              ancestorSelections?.forEach(({ requirementId, optionIndex }) =>
                                onSelectOption(requirementId, optionIndex)
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
          paddingLeft: depth * REQUIREMENT_INDENT_PX + REQUIREMENT_BASE_PADDING_PX,
          backgroundColor: opened ? 'var(--mantine-color-dark-6)' : 'var(--mantine-color-dark-8)',
        }}
      >
        {title && (
          <Group
            justify="space-between"
            align="center"
            mb={0}
            onClick={toggleLocal}
            style={{ cursor: 'pointer' }}
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
                  transform: opened ? 'rotate(0deg)' : 'rotate(-90deg)',
                  transition: 'transform 150ms ease',
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
            {node.options!.map((child, idx) => (
              <RequirementNode
                key={getStableNodeKey(child, `${getStableNodeKey(node, 'parent')}:child:${idx}`)}
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
                  unassignedCompletedSetNormalized={unassignedCompletedSetNormalized}
              />
            ))}
          </Stack>
        </Collapse>
      </Paper>
    );
  }

  const label =
    creditsNeeded > 0 && !showAsComplete
      ? `${title} (${creditsRemaining} credit${creditsRemaining !== 1 ? 's' : ''} needed)`
      : title;

  return (
    <Paper
      p="sm"
      withBorder
      radius={0}
      mt="xs"
      style={{
        paddingLeft: depth * REQUIREMENT_INDENT_PX + REQUIREMENT_BASE_PADDING_PX,
        backgroundColor: hasOptions
          ? opened
            ? 'var(--mantine-color-dark-6)'
            : 'var(--mantine-color-dark-8)'
          : 'var(--mantine-color-dark-7)',
      }}
    >
      <Stack gap="xs">
        <Group
          justify="space-between"
          wrap="nowrap"
          align="flex-start"
          onClick={hasOptions ? toggleLocal : undefined}
          style={hasOptions ? { cursor: 'pointer' } : undefined}
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
                  transform: opened ? 'rotate(0deg)' : 'rotate(-90deg)',
                  transition: 'transform 150ms ease',
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
              {creditsRemaining} credit{creditsRemaining !== 1 ? 's' : ''} needed
            </Badge>
          ) : null}
        </Group>
        {multiSelectBlock}
        {hasOptions && (node.type === 'pick' || node.type === 'group') && (
          <Collapse in={opened}>
            <Stack gap="xs" pl="xs">
              {node.options!.map((child, idx) => (
                <RequirementNode
                  key={getStableNodeKey(child, `${getStableNodeKey(node, 'parent')}:child:${idx}`)}
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
                  unassignedCompletedSetNormalized={unassignedCompletedSetNormalized}
                />
              ))}
            </Stack>
          </Collapse>
        )}
      </Stack>
    </Paper>
  );
}

export function RequirementsStep({
  cache,
  remainingRequirements,
  requirementTreeWithStatus,
  completedRequirementsList,
  completedCourses,
  unassignedCompletedCourses,
  selectedPerRequirement,
  onSelect,
  selectedOptionsPerRequirement,
  onSelectOption,
  prereqEligibleCourses,
  levelBuckets,
  languageBuckets,
  onChangeLevelBuckets,
  onChangeLanguageBuckets,
  electiveLevelBuckets,
  onChangeElectiveLevelBuckets,
}: RequirementsStepProps) {
  const [completedOpen, setCompletedOpen] = useState(false);
  const completedSet = new Set(completedCourses);
  const prereqEligible = new Set(prereqEligibleCourses);
  const unassignedCompletedSet = new Set(unassignedCompletedCourses);
  const unassignedCompletedSetNormalized = new Set(
    unassignedCompletedCourses.map((c) => normalizeCourseCode(c)),
  );
  const hasTree = requirementTreeWithStatus.length > 0;
  const incompleteNodes = requirementTreeWithStatus.filter((node) => !node.complete);
  const hasRemaining = incompleteNodes.length > 0;
  const hasCompleted = completedRequirementsList.length > 0;
  const totalRequirements = completedRequirementsList.length + remainingRequirements.length;

  if (!hasTree) {
    return (
      <Text c="dimmed">
        Select a program and complete the previous steps to see requirements.
      </Text>
    );
  }

  const unassignedDisplay = [...new Set(unassignedCompletedCourses)]
    .map((c) => cache?.getCourse(normalizeCourseCode(c))?.code ?? c)
    .sort();

  return (
    <Stack gap="lg" data-tour="requirements">
      {unassignedDisplay.length > 0 && (
        <Alert color="yellow" variant="light" radius={0} title="Action needed before generating schedules">
          <Text size="sm">
            You have {unassignedDisplay.length} completed course{unassignedDisplay.length === 1 ? '' : 's'} not assigned to any requirement:{' '}
            {unassignedDisplay.join(', ')}.
          </Text>
          <Text size="sm" mt={6}>
            Assign each completed course to the requirement it satisfies.
          </Text>
        </Alert>
      )}
      <Paper p="sm" withBorder radius={0}>
        <Stack gap="xs">
          <Group justify="space-between" align="center">
            <Text size="sm" fw={500}>
              Course filters
            </Text>
            <Text size="xs" c="dimmed">
              Filters apply to suggested and searchable courses for this step.
            </Text>
          </Group>
          <Group gap="md" align="flex-start">
            <MultiSelect
              label="Levels"
              data={[
                { value: 'undergrad', label: 'Undergraduate (0–4XXX)' },
                { value: 'grad', label: 'Graduate (5XXX+)' },
              ]}
              value={levelBuckets}
              onChange={(vals) =>
                onChangeLevelBuckets(vals.filter((v): v is 'undergrad' | 'grad' => v === 'undergrad' || v === 'grad'))
              }
              clearable={false}
            />
            <MultiSelect
              label="Languages"
              data={[
                { value: 'en', label: 'English' },
                { value: 'fr', label: 'French' },
                { value: 'other', label: 'Other' },
              ]}
              value={languageBuckets}
              onChange={(vals) =>
                onChangeLanguageBuckets(
                  vals.filter(
                    (v): v is 'en' | 'fr' | 'other' => v === 'en' || v === 'fr' || v === 'other',
                  ),
                )
              }
              clearable={false}
            />
            <MultiSelect
              label="Elective levels"
              data={[
                { value: '1000', label: '1XXX' },
                { value: '2000', label: '2XXX' },
                { value: '3000', label: '3XXX' },
                { value: '4000', label: '4XXX' },
              ]}
              value={electiveLevelBuckets.map((v) => String(v))}
              onChange={(vals) =>
                onChangeElectiveLevelBuckets(
                  vals
                    .map((v) => parseInt(v, 10))
                    .filter((n) => n === 1000 || n === 2000 || n === 3000 || n === 4000),
                )
              }
              clearable={false}
            />
          </Group>
        </Stack>
      </Paper>
      <Text size="sm" c="dimmed">
        For each requirement below, select the courses you want this semester.
        Requirements with only one option are pre-selected. Expand options in
        &quot;or&quot; blocks to see which part your selection satisfies.
      </Text>

      <Stack gap="md">
        {hasRemaining ? (
          incompleteNodes.map((node, idx) => (
            <RequirementNode
              key={getStableNodeKey(node, `root:${idx}`)}
              node={node}
              cache={cache}
              completedCourses={completedSet}
              selectedPerRequirement={selectedPerRequirement}
              onSelect={onSelect}
              selectedOptionsPerRequirement={selectedOptionsPerRequirement}
              onSelectOption={onSelectOption}
              activeBranch
              prereqEligible={prereqEligible}
              levelBuckets={levelBuckets}
              languageBuckets={languageBuckets}
              electiveLevelBuckets={electiveLevelBuckets}
                  unassignedCompletedSet={unassignedCompletedSet}
                  unassignedCompletedSetNormalized={unassignedCompletedSetNormalized}
            />
          ))
        ) : (
          <Text size="sm" c="dimmed">
            All requirements are currently satisfied by your completed courses.
          </Text>
        )}
      </Stack>

      {hasCompleted && (
        <Paper
          p="sm"
          withBorder
          radius={0}
          style={{
            backgroundColor: completedOpen ? 'var(--mantine-color-dark-6)' : 'var(--mantine-color-dark-8)',
            cursor: 'pointer',
          }}
          onClick={(e: MouseEvent) => {
            e.stopPropagation();
            setCompletedOpen((o) => !o);
          }}
        >
          <Group justify="space-between" align="center" mb={completedOpen ? 'sm' : 0}>
            <Group gap="xs" align="center">
              <IconChevronDown
                size={14}
                style={{
                  transform: completedOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
                  transition: 'transform 150ms ease',
                }}
              />
              <Text fw={600} size="sm">
                {completedRequirementsList.length}/{totalRequirements || '—'} completed requirements
              </Text>
            </Group>
            <Badge size="sm" variant="light" color="green">
              {completedOpen ? 'Hide details' : 'Show details'}
            </Badge>
          </Group>
          <Collapse in={completedOpen}>
            <Stack gap={0} mt="sm">
              {completedRequirementsList.map((item, idx) => (
                <Box
                  key={`${(item.title ?? '').trim()}:${item.satisfiedBy.slice().sort().join(',')}:${idx}`}
                  px="sm"
                  py={6}
                  style={{
                    backgroundColor:
                      idx % 2 === 0
                        ? 'var(--mantine-color-dark-6)'
                        : 'var(--mantine-color-dark-7)',
                    borderTop:
                      idx === 0 ? '1px solid var(--mantine-color-dark-4)' : 'none',
                    borderBottom: '1px solid var(--mantine-color-dark-4)',
                  }}
                >
                  <Group justify="space-between" wrap="nowrap" align="center">
                    <Text size="sm" lineClamp={2} style={{ flex: 1 }}>
                      {item.title}
                    </Text>
                    <Group gap="xs" wrap="nowrap" align="center">
                      <Text size="xs" c="dimmed">
                        {item.satisfiedBy.sort().join(', ')}
                      </Text>
                      <Badge color="green" variant="light" size="sm">
                        Complete
                      </Badge>
                    </Group>
                  </Group>
                </Box>
              ))}
            </Stack>
          </Collapse>
        </Paper>
      )}

      {hasTree && !hasRemaining && !hasCompleted && (
        <Text c="dimmed" size="sm">
          No remaining requirements. You may have completed all courses for your
          program.
        </Text>
      )}
    </Stack>
  );
}
