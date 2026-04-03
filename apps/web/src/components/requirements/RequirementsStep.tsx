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
  type ExpandRegistry,
} from "./RequirementNode";
import {
  countSatisfiedTopLevelRoots,
} from "./requirementUtils";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RequirementsStepProps {
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
  levelBuckets: ("undergrad" | "grad")[];
  languageBuckets: ("en" | "fr" | "other")[];
  electiveLevelBuckets: number[];
  onChangeLevelBuckets: (buckets: ("undergrad" | "grad")[]) => void;
  onChangeLanguageBuckets: (buckets: ("en" | "fr" | "other")[]) => void;
  onChangeElectiveLevelBuckets: (buckets: number[]) => void;
  includeClosedComponents: boolean;
  onIncludeClosedComponentsChange: (value: boolean) => void;
  /** When omitted, RequirementNode uses false (virtual-only schedule filter). */
  virtualSectionsOnly?: boolean;
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

export function RequirementsStep({
  cache,
  remainingRequirements: _remainingRequirements,
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
  includeClosedComponents,
  onIncludeClosedComponentsChange,
  virtualSectionsOnly = false,
}: RequirementsStepProps) {
  const [completedOpen, setCompletedOpen] = useState(false);
  const openFnsRef = useRef(new Map<string, () => void>());
  const registry = useMemo<ExpandRegistry>(
    () => ({
      register(key, open) {
        openFnsRef.current.set(key, open);
      },
      unregister(key) {
        openFnsRef.current.delete(key);
      },
    }),
    [],
  );

  const openByKeys = (keys: string[]) => {
    for (const key of keys) openFnsRef.current.get(key)?.();
  };

  const completedSet = new Set(completedCourses);
  const prereqEligible = new Set(prereqEligibleCourses);
  const unassignedCompletedSet = new Set(unassignedCompletedCourses);
  const unassignedCompletedSetNormalized = new Set(
    unassignedCompletedCourses.map((c) => normalizeCourseCode(c)),
  );

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

  const allAssignedCoursesNormalized = useMemo(() => {
    const set = new Set<string>();
    const walk = (nodes: RequirementWithStatus[]) => {
      for (const node of nodes) {
        if (
          (node.type === "course" || node.type === "or_course") &&
          node.satisfiedBy?.length
        ) {
          for (const code of node.satisfiedBy) set.add(normalizeCourseCode(code));
        }
        if (node.options?.length) walk(node.options);
      }
    };
    walk(requirementTreeWithStatus);
    for (const codes of Object.values(selectedPerRequirement)) {
      for (const code of codes) set.add(normalizeCourseCode(code));
    }
    return set;
  }, [requirementTreeWithStatus, selectedPerRequirement]);

  const hasTree = requirementTreeWithStatus.length > 0;
  const incompleteNodes = requirementTreeWithStatus.filter(
    (node) => !node.complete,
  );
  const missingSelections = findMissingSelections(
    incompleteNodes,
    selectedOptionsPerRequirement,
  );
  const hasRemaining = incompleteNodes.length > 0;
  const hasCompleted =
    satisfiedTopLevelCount > 0 || completedRequirementsList.length > 0;

  if (!hasTree) {
    return (
      <Alert color="blue" variant="light" radius={0}>
        <Text size="sm">
          Select a program and complete the previous steps to see requirements.
        </Text>
      </Alert>
    );
  }

  const unassignedDisplay = [...new Set(unassignedCompletedCourses)]
    .map((c) => cache?.getCourse(normalizeCourseCode(c))?.code ?? c)
    .sort();

  return (
    <Stack gap="lg" data-tour="requirements-legacy">
      {unassignedDisplay.length > 0 && (
        <Alert
          color="yellow"
          variant="light"
          radius={0}
          title="Action needed before generating schedules"
        >
          <Text size="sm">
            You have {unassignedDisplay.length} completed course
            {unassignedDisplay.length === 1 ? "" : "s"} not assigned to any
            requirement: {unassignedDisplay.join(", ")}.
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

      <Alert color="blue" variant="light" radius={0}>
        <Text size="sm">
          For each requirement below, select the courses you want this semester.
          Requirements with only one option are pre-selected. Expand options in
          &quot;or&quot; blocks to see which part your selection satisfies.
        </Text>
      </Alert>

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

      <ExpandRegistryContext.Provider value={registry}>
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
                  unassignedCompletedSetNormalized={
                    unassignedCompletedSetNormalized
                  }
                  allAssignedCoursesNormalized={allAssignedCoursesNormalized}
                  includeClosedComponents={includeClosedComponents}
                  virtualSectionsOnly={virtualSectionsOnly}
                />
              );
            })
          ) : (
            <Alert color="blue" variant="light" radius={0}>
              <Text size="sm">
                All requirements are currently satisfied by your completed
                courses.
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
              {completedRequirementsList.map((item, idx) => (
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

      {hasTree && !hasRemaining && !hasCompleted && (
        <Alert color="blue" variant="light" radius={0}>
          <Text size="sm">
            No remaining requirements. You may have completed all courses for your
            program.
          </Text>
        </Alert>
      )}
    </Stack>
  );
}
