import { useRef } from "react";
import { Alert, Stack, Text } from "@mantine/core";
import type { RequirementWithStatus } from "schedule";
import { ExpandRegistryContext, getStableNodeKey, type ExpandRegistry } from "./RequirementNode";
import { OptionsDrilldown } from "./OptionsDrilldown";
import { nodeHasOptionGroups } from "./requirementUtils";

export interface OptionsStepProps {
  requirementTreeWithStatus: RequirementWithStatus[];
  completedCourses: string[];
  selectedOptionsPerRequirement: Record<string, number>;
  onSelectOption: (requirementId: string, optionIndex: number) => void;
  onClearOption: (requirementId: string) => void;
}

export function OptionsStep({
  requirementTreeWithStatus,
  completedCourses,
  selectedOptionsPerRequirement,
  onSelectOption,
  onClearOption,
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

  const completedCoursesSet = new Set(completedCourses);

  // Only show top-level nodes that contain (or are) option groups needing selection.
  const relevantNodes = requirementTreeWithStatus.filter(nodeHasOptionGroups);

  if (relevantNodes.length === 0) {
    return (
      <Alert color="blue" variant="light" radius={0}>
        <Text size="sm">
          No options to configure for this program. Click Next to continue.
        </Text>
      </Alert>
    );
  }

  return (
    <Stack gap="md" data-tour="options">
      <Alert color="blue" variant="light" radius={0}>
        <Text size="sm">
          Step through each choice below. Tap an option to continue; use the back
          arrow to change a path and pick a different branch.
        </Text>
      </Alert>

      <ExpandRegistryContext.Provider value={registryRef.current}>
        <Stack gap="md">
          {relevantNodes.map((node, idx) => {
            const nodeKey = getStableNodeKey(node, `options:${idx}`);
            return (
              <OptionsDrilldown
                key={nodeKey}
                nodeKeyPrefix={nodeKey}
                node={node}
                completedCourses={completedCoursesSet}
                selectedOptionsPerRequirement={selectedOptionsPerRequirement}
                onSelectOption={onSelectOption}
                onClearOption={onClearOption}
                activeBranch={true}
                depth={0}
              />
            );
          })}
        </Stack>
      </ExpandRegistryContext.Provider>
    </Stack>
  );
}
