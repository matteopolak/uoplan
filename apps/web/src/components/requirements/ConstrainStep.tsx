import { useState, useRef, useMemo, type MouseEvent } from "react";
import {
  Stack,
  MultiSelect,
  Text,
  Paper,
  Badge,
  Group,
  Box,
  Collapse,
  Alert,
  Switch,
  Button,
} from "@mantine/core";
import { IconChevronDown } from "@tabler/icons-react";
import type { DataCache } from "schedule";
import type {
  RemainingRequirement,
  RequirementWithStatus,
  CompletedRequirementItem,
} from "schedule";
import {
  RequirementNode,
  ExpandRegistryContext,
  getStableNodeKey,
  getNodeDisplayTitle,
  type ExpandRegistry,
} from "./RequirementNode";
import {
  applyOptionSelections,
  adjustNodeForAssignments,
  countSatisfiedTopLevelRoots,
  partitionIncompleteConstrainRoots,
} from "./requirementUtils";
import { tr } from "../../i18n";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ConstrainStepProps {
  cache: DataCache | null;
  remainingRequirements: RemainingRequirement[];
  requirementTreeWithStatus: RequirementWithStatus[];
  completedRequirementsList: CompletedRequirementItem[];
  completedCourses: string[];
  selectedPerRequirement: Record<string, string[]>;
  constrainedPerRequirement: Record<string, string[]>;
  onConstrain: (requirementId: string, courses: string[]) => void;
  selectedOptionsPerRequirement: Record<string, number>;
  onSelectOption: (requirementId: string, optionIndex: number) => void;
  prereqEligibleCourses: string[];
  levelBuckets: ("undergrad" | "grad")[];
  languageBuckets: ("en" | "fr" | "other")[];
  electiveLevelBuckets: number[];
  onChangeLevelBuckets: (buckets: ("undergrad" | "grad")[]) => void;
  onChangeLanguageBuckets: (buckets: ("en" | "fr" | "other")[]) => void;
  onChangeElectiveLevelBuckets: (buckets: number[]) => void;
  includeClosedComponents: boolean;
  onIncludeClosedComponentsChange: (value: boolean) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function findMissingSelections(
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

function findFirstMissingPath(
  nodes: RequirementWithStatus[],
  selectedOptionsPerRequirement: Record<string, number>,
  makeNodeKey: (node: RequirementWithStatus, idx: number) => string,
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
        pathSoFar,
      );
      if (result) return result;
    }
  }
  return null;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ConstrainStep({
  cache,
  remainingRequirements: _remainingRequirements,
  requirementTreeWithStatus,
  completedRequirementsList,
  completedCourses,
  selectedPerRequirement,
  constrainedPerRequirement,
  onConstrain,
  selectedOptionsPerRequirement,
  onSelectOption,
  prereqEligibleCourses,
  levelBuckets,
  languageBuckets,
  onChangeLevelBuckets,
  onChangeLanguageBuckets,
  electiveLevelBuckets,
  onChangeElectiveLevelBuckets,
  includeClosedComponents,
  onIncludeClosedComponentsChange,
}: ConstrainStepProps) {
  const [completedOpen, setCompletedOpen] = useState(false);
  const [collapsedUnavailableOpen, setCollapsedUnavailableOpen] =
    useState(false);
  const openFnsRef = useRef(new Map<string, () => void>());
  const registryRef = useRef<ExpandRegistry>({
    register(key, open) {
      openFnsRef.current.set(key, open);
    },
    unregister(key) {
      openFnsRef.current.delete(key);
    },
  });

  const openByKeys = (keys: string[]) => {
    for (const key of keys) openFnsRef.current.get(key)?.();
  };

  const completedSet = useMemo(
    () => new Set(completedCourses),
    [completedCourses],
  );
  const prereqEligible = useMemo(
    () => new Set(prereqEligibleCourses),
    [prereqEligibleCourses],
  );

  // Flatten option selections so or_group/options_group parents are replaced
  // by their selected child branch (chosen in the Options step).
  const flattenedTree = useMemo(
    () => applyOptionSelections(requirementTreeWithStatus, selectedOptionsPerRequirement),
    [requirementTreeWithStatus, selectedOptionsPerRequirement],
  );

  // Adjust tree to reflect manual assignments from the Assign step.
  const adjustedTree = useMemo(
    () =>
      flattenedTree.map((node) =>
        adjustNodeForAssignments(node, selectedPerRequirement, cache),
      ),
    [flattenedTree, selectedPerRequirement, cache],
  );

  const hasTree = adjustedTree.length > 0;
  const incompleteNodes = adjustedTree.filter((node) => !node.complete);

  const constrainCtx = useMemo(
    () => ({
      cache,
      completedCourses: completedSet,
      prereqEligible,
      levelBuckets,
      languageBuckets,
      electiveLevelBuckets,
      unassignedCompletedSetNormalized: new Set<string>(),
      allAssignedCoursesNormalized: new Set<string>(),
      includeClosedComponents,
      completedOnly: false as const,
    }),
    [
      cache,
      completedSet,
      prereqEligible,
      levelBuckets,
      languageBuckets,
      electiveLevelBuckets,
      includeClosedComponents,
    ],
  );

  const { primary: primaryRoots, collapsed: collapsedRoots } = useMemo(
    () =>
      partitionIncompleteConstrainRoots(
        incompleteNodes,
        selectedOptionsPerRequirement,
        constrainedPerRequirement,
        constrainCtx,
      ),
    [
      incompleteNodes,
      selectedOptionsPerRequirement,
      constrainedPerRequirement,
      constrainCtx,
    ],
  );

  const collapsedRootKeysSet = useMemo(
    () =>
      new Set(
        collapsedRoots.map(({ node, rootIndex }) =>
          getStableNodeKey(node, `root:${rootIndex}`),
        ),
      ),
    [collapsedRoots],
  );

  // Top-level tree nodes that were originally incomplete but became complete via adjustment.
  const newlyCompleteNodes = useMemo(() => {
    const originalCompleteIds = new Set(
      flattenedTree
        .filter((n) => n.complete)
        .map((n) => n.requirementId)
        .filter((id): id is string => id != null),
    );
    return adjustedTree.filter(
      (node) =>
        node.complete &&
        node.requirementId != null &&
        !originalCompleteIds.has(node.requirementId),
    );
  }, [adjustedTree, flattenedTree]);

  const assignmentCompletedItems: CompletedRequirementItem[] = useMemo(
    () =>
      newlyCompleteNodes.map((node) => ({
        title: getNodeDisplayTitle(node),
        satisfiedBy:
          node.satisfiedBy ?? selectedPerRequirement[node.requirementId!] ?? [],
      })),
    [newlyCompleteNodes, selectedPerRequirement],
  );

  const allCompletedItems = [...completedRequirementsList, ...assignmentCompletedItems];

  const missingSelections = findMissingSelections(
    incompleteNodes,
    selectedOptionsPerRequirement,
  );
  const hasRemaining = incompleteNodes.length > 0;
  const hasCompleted = allCompletedItems.length > 0;

  const satisfiedTopLevelCount = useMemo(
    () =>
      countSatisfiedTopLevelRoots(
        requirementTreeWithStatus,
        selectedPerRequirement,
        cache,
      ),
    [requirementTreeWithStatus, selectedPerRequirement, cache],
  );
  const topLevelRequirementCount = requirementTreeWithStatus.length;

  if (!hasTree) {
    return (
      <Alert
        color="blue"
        variant="light"
        radius={0}
        data-tour="constrain-schedule"
      >
        <Text size="sm">
          Select a program and complete the previous steps to see requirements.
        </Text>
      </Alert>
    );
  }

  return (
    <Stack gap="lg" data-tour="constrain-schedule">
      <Paper p="sm" withBorder radius={0}>
        <Stack gap="xs">
          <Group justify="space-between" align="center">
            <Text size="sm" fw={500}>
              {tr("constrainStep.courseFilters")}
            </Text>
            <Text size="xs" c="dimmed">
              {tr("constrainStep.filtersHint")}
            </Text>
          </Group>
          <Group gap="md" align="flex-start" style={{ alignItems: "center" }}>
            <MultiSelect
              label={tr("constrainStep.levels.label")}
              data={[
                { value: "undergrad", label: tr("constrainStep.levels.undergrad") },
                { value: "grad", label: tr("constrainStep.levels.grad") },
              ]}
              value={levelBuckets}
              onChange={(vals) =>
                onChangeLevelBuckets(
                  vals.filter(
                    (v): v is "undergrad" | "grad" =>
                      v === "undergrad" || v === "grad",
                  ),
                )
              }
              clearable={false}
            />
            <MultiSelect
              label={tr("constrainStep.languages.label")}
              data={[
                { value: "en", label: tr("constrainStep.languages.english") },
                { value: "fr", label: tr("constrainStep.languages.french") },
                { value: "other", label: tr("constrainStep.languages.other") },
              ]}
              value={languageBuckets}
              onChange={(vals) =>
                onChangeLanguageBuckets(
                  vals.filter(
                    (v): v is "en" | "fr" | "other" =>
                      v === "en" || v === "fr" || v === "other",
                  ),
                )
              }
              clearable={false}
            />
            <MultiSelect
              label={tr("constrainStep.electiveLevels.label")}
              data={[
                { value: "1000", label: "1XXX" },
                { value: "2000", label: "2XXX" },
                { value: "3000", label: "3XXX" },
                { value: "4000", label: "4XXX" },
              ]}
              value={electiveLevelBuckets.map((v) => String(v))}
              onChange={(vals) =>
                onChangeElectiveLevelBuckets(
                  vals
                    .map((v) => parseInt(v, 10))
                    .filter(
                      (n) =>
                        n === 1000 || n === 2000 || n === 3000 || n === 4000,
                    ),
                )
              }
              clearable={false}
            />
            <Switch
              label={tr("constrainStep.includeClosedSections")}
              checked={includeClosedComponents}
              onChange={(e) =>
                onIncludeClosedComponentsChange(e.currentTarget.checked)
              }
            />
          </Group>
        </Stack>
      </Paper>

      {missingSelections.length > 0 && (
        <Alert
          color="yellow"
          variant="light"
          radius={0}
          title="Option selection required"
        >
          <Group justify="space-between" align="center">
            <Text size="sm">
              {missingSelections.length} option group
              {missingSelections.length === 1 ? "" : "s"} require
              {missingSelections.length === 1 ? "s" : ""} a selection before
              generating schedules.
            </Text>
            <Button
              size="xs"
              variant="light"
              color="yellow"
              onClick={() => {
                const path = findFirstMissingPath(
                  incompleteNodes,
                  selectedOptionsPerRequirement,
                  (node, idx) => getStableNodeKey(node, `root:${idx}`),
                );
                if (path) {
                  const firstKey = path[0];
                  const expandCollapsed =
                    !!firstKey && collapsedRootKeysSet.has(firstKey);
                  if (expandCollapsed) {
                    setCollapsedUnavailableOpen(true);
                  }
                  setTimeout(
                    () => {
                      openByKeys(path);
                      setTimeout(() => {
                        document
                          .querySelector('[data-missing-selection="true"]')
                          ?.scrollIntoView({
                            behavior: "smooth",
                            block: "center",
                          });
                      }, 250);
                    },
                    expandCollapsed ? 300 : 0,
                  );
                }
              }}
            >
              Jump to first problem
            </Button>
          </Group>
        </Alert>
      )}

      <ExpandRegistryContext.Provider value={registryRef.current}>
        <Stack gap="md">
          {hasRemaining ? (
            <>
              {primaryRoots.length === 0 && collapsedRoots.length > 0 && (
                <Alert color="gray" variant="light" radius={0}>
                  <Text size="sm">
                    The remaining requirements have no courses in the picker
                    (e.g. missing prerequisites or nothing offered this term). Expand{" "}
                    <strong>No eligible courses</strong> below to review them,
                    or adjust course filters above.
                  </Text>
                </Alert>
              )}
              {primaryRoots.map(({ node, rootIndex }) => {
                const nodeKey = getStableNodeKey(node, `root:${rootIndex}`);
                return (
                  <RequirementNode
                    key={nodeKey}
                    nodeKey={nodeKey}
                    node={node}
                    cache={cache}
                    completedCourses={completedSet}
                    selectedPerRequirement={constrainedPerRequirement}
                    onSelect={onConstrain}
                    selectedOptionsPerRequirement={
                      selectedOptionsPerRequirement
                    }
                    onSelectOption={onSelectOption}
                    activeBranch
                    prereqEligible={prereqEligible}
                    levelBuckets={levelBuckets}
                    languageBuckets={languageBuckets}
                    electiveLevelBuckets={electiveLevelBuckets}
                    unassignedCompletedSet={new Set()}
                    unassignedCompletedSetNormalized={new Set()}
                    allAssignedCoursesNormalized={new Set()}
                    includeClosedComponents={includeClosedComponents}
                  />
                );
              })}
              {collapsedRoots.length > 0 && (
                <Paper
                  p="sm"
                  withBorder
                  radius={0}
                  style={{
                    backgroundColor: collapsedUnavailableOpen
                      ? "var(--mantine-color-dark-6)"
                      : "var(--mantine-color-dark-8)",
                    cursor: "pointer",
                  }}
                  onClick={(e: MouseEvent) => {
                    e.stopPropagation();
                    setCollapsedUnavailableOpen((o) => !o);
                  }}
                >
                  <Group
                    justify="space-between"
                    align="center"
                    mb={collapsedUnavailableOpen ? "sm" : 0}
                  >
                    <Group gap="xs" align="center">
                      <IconChevronDown
                        size={14}
                        style={{
                          transform: collapsedUnavailableOpen
                            ? "rotate(0deg)"
                            : "rotate(-90deg)",
                          transition: "transform 150ms ease",
                        }}
                      />
                      <Text fw={600} size="sm">
                        No eligible courses ({collapsedRoots.length})
                      </Text>
                    </Group>
                    <Badge size="sm" variant="light" color="gray">
                      {collapsedUnavailableOpen ? "Hide" : "Show"}
                    </Badge>
                  </Group>
                  <Collapse in={collapsedUnavailableOpen}>
                    <Stack gap="md" mt="sm">
                      {collapsedRoots.map(({ node, rootIndex }) => {
                        const nodeKey = getStableNodeKey(
                          node,
                          `root:${rootIndex}`,
                        );
                        return (
                          <RequirementNode
                            key={nodeKey}
                            nodeKey={nodeKey}
                            node={node}
                            cache={cache}
                            completedCourses={completedSet}
                            selectedPerRequirement={constrainedPerRequirement}
                            onSelect={onConstrain}
                            selectedOptionsPerRequirement={
                              selectedOptionsPerRequirement
                            }
                            onSelectOption={onSelectOption}
                            activeBranch
                            prereqEligible={prereqEligible}
                            levelBuckets={levelBuckets}
                            languageBuckets={languageBuckets}
                            electiveLevelBuckets={electiveLevelBuckets}
                            unassignedCompletedSet={new Set()}
                            unassignedCompletedSetNormalized={new Set()}
                            allAssignedCoursesNormalized={new Set()}
                            includeClosedComponents={includeClosedComponents}
                          />
                        );
                      })}
                    </Stack>
                  </Collapse>
                </Paper>
              )}
            </>
          ) : (
            <Alert color="blue" variant="light" radius={0}>
              <Text size="sm">
                All requirements are currently satisfied by your completed
                courses. Nothing to constrain.
              </Text>
            </Alert>
          )}
        </Stack>
      </ExpandRegistryContext.Provider>

      {hasCompleted && (
        <Paper
          p="sm"
          withBorder
          radius={0}
          style={{
            backgroundColor: completedOpen
              ? "var(--mantine-color-dark-6)"
              : "var(--mantine-color-dark-8)",
            cursor: "pointer",
          }}
          onClick={(e: MouseEvent) => {
            e.stopPropagation();
            setCompletedOpen((o) => !o);
          }}
        >
          <Group
            justify="space-between"
            align="center"
            mb={completedOpen ? "sm" : 0}
          >
            <Group gap="xs" align="center">
              <IconChevronDown
                size={14}
                style={{
                  transform: completedOpen ? "rotate(0deg)" : "rotate(-90deg)",
                  transition: "transform 150ms ease",
                }}
              />
              <Text fw={600} size="sm">
                {satisfiedTopLevelCount}/{topLevelRequirementCount || "—"}{" "}
                completed requirements
              </Text>
            </Group>
            <Badge size="sm" variant="light" color="green">
              {completedOpen ? "Hide details" : "Show details"}
            </Badge>
          </Group>
          <Collapse in={completedOpen}>
            <Stack gap={0} mt="sm">
              {allCompletedItems.map((item, idx) => (
                <Box
                  key={`${(item.title ?? "").trim()}:${item.satisfiedBy
                    .slice()
                    .sort()
                    .join(",")}:${idx}`}
                  px="sm"
                  py={6}
                  style={{
                    backgroundColor:
                      idx % 2 === 0
                        ? "var(--mantine-color-dark-6)"
                        : "var(--mantine-color-dark-7)",
                    borderTop:
                      idx === 0
                        ? "1px solid var(--mantine-color-dark-4)"
                        : "none",
                    borderBottom: "1px solid var(--mantine-color-dark-4)",
                  }}
                >
                  <Group justify="space-between" wrap="nowrap" align="center">
                    <Text size="sm" lineClamp={2} style={{ flex: 1 }}>
                      {item.title}
                    </Text>
                    <Group gap="xs" wrap="nowrap" align="center">
                      <Text size="xs" c="dimmed">
                        {item.satisfiedBy.sort().join(", ")}
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
    </Stack>
  );
}
