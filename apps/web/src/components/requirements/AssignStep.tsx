import { useRef, useMemo, type MouseEvent } from "react";
import {
  Stack,
  Text,
  Paper,
  Badge,
  Group,
  Box,
  Collapse,
  Alert,
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
  applyOptionSelections,
  countSatisfiedTopLevelRoots,
} from "./requirementUtils";
import { useState } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AssignStepProps {
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
}

// ─── Component ───────────────────────────────────────────────────────────────

export function AssignStep({
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
}: AssignStepProps) {
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

  const completedSet = new Set(completedCourses);
  const prereqEligible = new Set(prereqEligibleCourses);
  const unassignedCompletedSet = new Set(unassignedCompletedCourses);
  const unassignedCompletedSetNormalized = new Set(
    unassignedCompletedCourses.map((c) => normalizeCourseCode(c)),
  );

  const flattenedTree = useMemo(
    () => applyOptionSelections(requirementTreeWithStatus, selectedOptionsPerRequirement),
    [requirementTreeWithStatus, selectedOptionsPerRequirement],
  );

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
    walk(flattenedTree);
    for (const codes of Object.values(selectedPerRequirement)) {
      for (const code of codes) set.add(normalizeCourseCode(code));
    }
    return set;
  }, [flattenedTree, selectedPerRequirement]);

  const hasTree = flattenedTree.length > 0;
  const incompleteNodes = flattenedTree.filter(
    (node) => !node.complete,
  );
  const hasRemaining = incompleteNodes.length > 0;
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
    <Stack gap="lg" data-tour="assign-requirements">
      {unassignedDisplay.length > 0 ? (
        <Alert
          color="yellow"
          variant="light"
          radius={0}
          title="Assign all completed courses before continuing"
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
      ) : (
        <Alert color="green" variant="light" radius={0} title="All courses assigned">
          <Text size="sm">
            All completed courses are assigned to requirements. Click Next to
            continue.
          </Text>
        </Alert>
      )}

      <Alert color="blue" variant="light" radius={0}>
        <Text size="sm">
          For each requirement below, assign the completed courses that satisfy
          it. Only your completed courses are shown in the dropdowns.
        </Text>
      </Alert>

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
                  levelBuckets={["undergrad", "grad"]}
                  languageBuckets={["en", "fr", "other"]}
                  electiveLevelBuckets={[]}
                  unassignedCompletedSet={unassignedCompletedSet}
                  unassignedCompletedSetNormalized={
                    unassignedCompletedSetNormalized
                  }
                  allAssignedCoursesNormalized={allAssignedCoursesNormalized}
                  includeClosedComponents
                  completedOnly
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
    </Stack>
  );
}
