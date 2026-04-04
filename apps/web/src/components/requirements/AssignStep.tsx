import { useMemo } from "react";
import { Stack, Text, Alert } from "@mantine/core";
import type { DataCache } from "schedule";
import { normalizeCourseCode } from "schedule";
import type {
  RemainingRequirement,
  RequirementWithStatus,
  CompletedRequirementItem,
} from "schedule";
import { RequirementNode, getStableNodeKey } from "./RequirementNode";
import {
  applyOptionSelections,
  countSatisfiedTopLevelRoots,
} from "./requirementUtils";
import { CompletedRequirementsAccordion } from "./CompletedRequirementsAccordion";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AssignStepProps {
  cache: DataCache | null;
  remainingRequirements: RemainingRequirement[];
  requirementTreeWithStatus: RequirementWithStatus[];
  completedRequirementsList: CompletedRequirementItem[];
  completedCourses: string[];
  unassignedCompletedCourses: string[];
  constrainedPerRequirement: Record<string, string[]>;
  selectedPerRequirement: Record<string, string[]>;
  onSelect: (requirementId: string, courses: string[]) => void;
  selectedOptionsPerRequirement: Record<string, number>;
  prereqEligibleCourses: string[];
  includeClosedComponents?: boolean;
  virtualSectionsOnly?: boolean;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function AssignStep({
  cache,
  remainingRequirements: _remainingRequirements,
  requirementTreeWithStatus,
  completedRequirementsList,
  completedCourses,
  unassignedCompletedCourses,
  constrainedPerRequirement,
  selectedPerRequirement,
  onSelect,
  selectedOptionsPerRequirement,
  prereqEligibleCourses,
  includeClosedComponents = true,
  virtualSectionsOnly = false,
}: AssignStepProps) {
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

      <Stack gap="md">
          {hasRemaining ? (
            incompleteNodes.map((node, idx) => {
              const nodeKey = getStableNodeKey(node, `root:${idx}`);
              return (
                <RequirementNode
                  key={nodeKey}
                  node={node}
                  cache={cache}
                  completedCourses={completedSet}
                  selectedPerRequirement={selectedPerRequirement}
                  constrainedPerRequirement={constrainedPerRequirement}
                  onSelect={onSelect}
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
                  includeClosedComponents={includeClosedComponents}
                  virtualSectionsOnly={virtualSectionsOnly}
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

      {hasCompleted && (
        <CompletedRequirementsAccordion
          completedItems={completedRequirementsList}
          satisfiedCount={satisfiedTopLevelCount}
          totalCount={topLevelRequirementCount}
        />
      )}
    </Stack>
  );
}
