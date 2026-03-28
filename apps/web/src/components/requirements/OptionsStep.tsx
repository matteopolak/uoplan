import { useRef } from "react";
import { Stack, Text } from "@mantine/core";
import type { RequirementWithStatus } from "schedule";
import {
  RequirementNode,
  ExpandRegistryContext,
  getStableNodeKey,
  type ExpandRegistry,
} from "./RequirementNode";
import { nodeHasOptionGroups } from "./requirementUtils";

export interface OptionsStepProps {
  requirementTreeWithStatus: RequirementWithStatus[];
  completedCourses: string[];
  selectedOptionsPerRequirement: Record<string, number>;
  onSelectOption: (requirementId: string, optionIndex: number) => void;
}

const EMPTY_SET = new Set<string>();
const EMPTY_RECORD: Record<string, string[]> = {};

export function OptionsStep({
  requirementTreeWithStatus,
  completedCourses,
  selectedOptionsPerRequirement,
  onSelectOption,
}: OptionsStepProps) {
  const openFnsRef = useRef(new Map<string, () => void>());
  const registryRef = useRef<ExpandRegistry>({
    register(key, open) {
      openFnsRef.current.set(key, open);
    },
    unregister(key) {
      openFnsRef.current.delete(key);
    },
  });

  const completedSet = new Set(completedCourses);

  // Only show top-level nodes that contain (or are) option groups needing selection.
  const relevantNodes = requirementTreeWithStatus.filter(nodeHasOptionGroups);

  if (relevantNodes.length === 0) {
    return (
      <Text c="dimmed">
        No options to configure for this program. Click Next to continue.
      </Text>
    );
  }

  return (
    <Stack gap="md" data-tour="options">
      <Text size="sm" c="dimmed">
        Your program requires you to choose one option from each group below.
        Select an option for each before continuing.
      </Text>

      <ExpandRegistryContext.Provider value={registryRef.current}>
        <Stack gap="md">
          {relevantNodes.map((node, idx) => {
            const nodeKey = getStableNodeKey(node, `options:${idx}`);
            return (
              <RequirementNode
                key={nodeKey}
                nodeKey={nodeKey}
                node={node}
                cache={null}
                completedCourses={completedSet}
                selectedPerRequirement={EMPTY_RECORD}
                onSelect={() => {}}
                selectedOptionsPerRequirement={selectedOptionsPerRequirement}
                onSelectOption={onSelectOption}
                activeBranch={true}
                prereqEligible={EMPTY_SET}
                levelBuckets={["undergrad", "grad"]}
                languageBuckets={["en", "fr", "other"]}
                electiveLevelBuckets={[]}
                unassignedCompletedSet={EMPTY_SET}
                unassignedCompletedSetNormalized={EMPTY_SET}
                allAssignedCoursesNormalized={EMPTY_SET}
                includeClosedComponents={false}
                hideSelection
              />
            );
          })}
        </Stack>
      </ExpandRegistryContext.Provider>
    </Stack>
  );
}
