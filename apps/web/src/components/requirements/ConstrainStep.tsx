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
import { normalizeCourseCode } from "schedule";
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
import { applyOptionSelections } from "./requirementUtils";

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

/**
 * Adjust a requirement tree node to reflect manual course assignments from the
 * Assign step (`selectedPerRequirement`). For each node with a requirementId:
 * - If assigned credits >= creditsNeeded → mark complete, zero out creditsNeeded
 * - If partially assigned → reduce creditsNeeded by assigned credits
 * Children are adjusted recursively; an and_group is marked complete when all
 * its children become complete.
 */
function adjustNodeForAssignments(
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

// ─── Component ───────────────────────────────────────────────────────────────

export function ConstrainStep({
  cache,
  remainingRequirements,
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

  const completedSet = new Set(completedCourses);
  const prereqEligible = new Set(prereqEligibleCourses);

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

  // Same extraNodeCount logic as AssignStep: top-level nodes with requirementId
  // not in either flat list (e.g. or_group parents).
  const remainingReqIds = useMemo(
    () =>
      new Set(
        remainingRequirements
          .map((r) => r.requirementId)
          .filter((id): id is string => id != null),
      ),
    [remainingRequirements],
  );
  const extraNodeCount = useMemo(
    () =>
      flattenedTree.filter(
        (n) =>
          n.requirementId != null &&
          !n.complete &&
          !remainingReqIds.has(n.requirementId),
      ).length,
    [flattenedTree, remainingReqIds],
  );
  const totalRequirements =
    completedRequirementsList.length + remainingRequirements.length + extraNodeCount;

  if (!hasTree) {
    return (
      <Text c="dimmed">
        Select a program and complete the previous steps to see requirements.
      </Text>
    );
  }

  return (
    <Stack gap="lg">
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
          <Group gap="md" align="flex-start" style={{ alignItems: "center" }}>
            <MultiSelect
              label="Levels"
              data={[
                { value: "undergrad", label: "Undergraduate (0–4XXX)" },
                { value: "grad", label: "Graduate (5XXX+)" },
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
              label="Languages"
              data={[
                { value: "en", label: "English" },
                { value: "fr", label: "French" },
                { value: "other", label: "Other" },
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
              label="Elective levels"
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
              label="Include closed sections"
              checked={includeClosedComponents}
              onChange={(e) =>
                onIncludeClosedComponentsChange(e.currentTarget.checked)
              }
            />
          </Group>
        </Stack>
      </Paper>

      <Text size="sm" c="dimmed">
        Optionally pin specific courses for each requirement. Leave a
        requirement empty to let the generator pick any eligible course.
        Selecting up to the required number of courses pins them — the rest
        will be filled automatically. Selecting more than needed restricts the
        pool to only those courses.
      </Text>

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
                  openByKeys(path);
                  setTimeout(() => {
                    document
                      .querySelector('[data-missing-selection="true"]')
                      ?.scrollIntoView({ behavior: "smooth", block: "center" });
                  }, 250);
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
            incompleteNodes.map((node, idx) => {
              const nodeKey = getStableNodeKey(node, `root:${idx}`);
              return (
                <RequirementNode
                  key={nodeKey}
                  nodeKey={nodeKey}
                  node={node}
                  cache={cache}
                  completedCourses={completedSet}
                  selectedPerRequirement={constrainedPerRequirement}
                  onSelect={onConstrain}
                  selectedOptionsPerRequirement={selectedOptionsPerRequirement}
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
            })
          ) : (
            <Text size="sm" c="dimmed">
              All requirements are currently satisfied by your completed
              courses. Nothing to constrain.
            </Text>
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
                {allCompletedItems.length}/{totalRequirements || "—"}{" "}
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
