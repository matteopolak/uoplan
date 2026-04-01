import { useMemo, useRef } from "react";
import { Alert, Stack, Text } from "@mantine/core";
import type { RequirementWithStatus } from "schedule";
import { ExpandRegistryContext, getStableNodeKey, type ExpandRegistry } from "./RequirementNode";
import { OptionsDrilldown } from "./OptionsDrilldown";
import { nodeHasOptionGroups } from "./requirementUtils";
import { tr } from "../../i18n";

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

  const completedCoursesSet = new Set(completedCourses);

  // Only show top-level nodes that contain (or are) option groups needing selection.
  const relevantNodes = requirementTreeWithStatus.filter(nodeHasOptionGroups);

  if (relevantNodes.length === 0) {
    return (
      <Alert color="blue" variant="light" radius={0} data-tour="options">
        <Text size="sm">
          {tr("optionsStep.none", )}
        </Text>
      </Alert>
    );
  }

  return (
    <Stack gap="md" data-tour="options">
      <Alert color="blue" variant="light" radius={0}>
        <Text size="sm">
          {tr("optionsStep.note", )}
        </Text>
      </Alert>

      <ExpandRegistryContext.Provider value={registry}>
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
