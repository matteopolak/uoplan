import { Box, Group, Paper, Stack, Text, UnstyledButton } from "@mantine/core";
import { IconArrowLeft } from "@tabler/icons-react";
import type { RequirementWithStatus } from "schedule";
import {
  getOptionSecondarySummaryLine,
  simplifySingleChildChain,
} from "./requirementUtils";
import {
  RequirementNode,
  getNodeDisplayTitle,
  getStableNodeKey,
  REQUIREMENT_BASE_PADDING_PX,
  REQUIREMENT_INDENT_PX,
} from "./RequirementNode";

const EMPTY_SET = new Set<string>();
const EMPTY_RECORD: Record<string, string[]> = {};

export interface OptionsDrilldownProps {
  /** Stable prefix for child RequirementNode keys and registry. */
  nodeKeyPrefix: string;
  node: RequirementWithStatus;
  completedCourses: Set<string>;
  selectedOptionsPerRequirement: Record<string, number>;
  onSelectOption: (requirementId: string, optionIndex: number) => void;
  onClearOption: (requirementId: string) => void;
  activeBranch: boolean;
  depth?: number;
}

function orGroupLabel(node: RequirementWithStatus): string {
  const rawTitle = (node.title ?? "").trim();
  const useGeneric = rawTitle === "" || rawTitle.toLowerCase() === "or";
  return useGeneric
    ? "One of the following must be completed"
    : rawTitle || node.code || "Choose one option";
}

export function OptionsDrilldown({
  nodeKeyPrefix,
  node: rawNode,
  completedCourses,
  selectedOptionsPerRequirement,
  onSelectOption,
  onClearOption,
  activeBranch,
  depth = 0,
}: OptionsDrilldownProps) {
  const { node } = simplifySingleChildChain(rawNode);

  const indent =
    depth * REQUIREMENT_INDENT_PX + REQUIREMENT_BASE_PADDING_PX;

  const requirementNodeShared = {
    cache: null as const,
    completedCourses,
    selectedPerRequirement: EMPTY_RECORD,
    onSelect: () => {},
    selectedOptionsPerRequirement,
    onSelectOption,
    prereqEligible: EMPTY_SET,
    levelBuckets: ["undergrad", "grad"] as const,
    languageBuckets: ["en", "fr", "other"] as const,
    electiveLevelBuckets: [] as number[],
    unassignedCompletedSet: EMPTY_SET,
    unassignedCompletedSetNormalized: EMPTY_SET,
    allAssignedCoursesNormalized: EMPTY_SET,
    includeClosedComponents: false,
    hideSelection: true as const,
  };

  if (node.type === "section") {
    return (
      <RequirementNode
        nodeKey={`${nodeKeyPrefix}:section`}
        node={node}
        {...requirementNodeShared}
        activeBranch={activeBranch}
        depth={depth}
      />
    );
  }

  const isOptionGroup =
    (node.type === "or_group" || node.type === "options_group") &&
    node.requirementId != null &&
    !node.complete &&
    (node.options?.length ?? 0) > 0;

  if (isOptionGroup) {
    const reqId = node.requirementId!;
    const options = node.options!;
    const selectedIdx = selectedOptionsPerRequirement[reqId];
    const selOk =
      selectedIdx != null &&
      selectedIdx >= 0 &&
      selectedIdx < options.length;
    const selectedChild = selOk ? options[selectedIdx] : null;

    const showError =
      activeBranch &&
      selectedIdx == null &&
      !node.complete;

    if (!selOk) {
      return (
        <Paper
          p="sm"
          withBorder
          radius={0}
          mt={depth > 0 ? "xs" : 0}
          data-missing-selection={showError ? "true" : undefined}
          style={{
            paddingLeft: indent,
            backgroundColor: "var(--mantine-color-dark-6)",
          }}
        >
          {node.type === "or_group" && (
            <Text size="sm" c="dimmed" mb="xs">
              {orGroupLabel(node)}
            </Text>
          )}
          {showError && (
            <Text size="xs" c="red" mb="xs">
              Select exactly one option in this group.
            </Text>
          )}
          <Stack gap="xs">
            {options.map((opt, idx) => {
              const childKey = getStableNodeKey(
                opt,
                `${nodeKeyPrefix}:pick:${idx}`,
              );
              const isSelected = selectedIdx === idx;
              const childActiveBranch =
                activeBranch &&
                (selectedIdx == null || selectedIdx === idx);
              return (
                <Box key={childKey}>
                  <RequirementNode
                    nodeKey={childKey}
                    node={opt}
                    {...requirementNodeShared}
                    radio={{
                      checked: isSelected,
                      onChange: () => onSelectOption(reqId, idx),
                      name: reqId,
                      value: String(idx),
                    }}
                    activeBranch={childActiveBranch}
                    depth={depth + 1}
                    optionsStepHideCardTitle
                  />
                </Box>
              );
            })}
          </Stack>
        </Paper>
      );
    }

    const chosenHint =
      getOptionSecondarySummaryLine(selectedChild!) ?? "Selected branch";
    const backDescription =
      getOptionSecondarySummaryLine(selectedChild!) ?? getNodeDisplayTitle(selectedChild!);
    const backAriaLabel = `Change this requirement set — go back to pick a different option. Current path: ${backDescription}`;
    return (
      <Paper
        withBorder
        radius={0}
        mt={depth > 0 ? "xs" : 0}
        p={0}
        style={{ overflow: "hidden" }}
      >
        <UnstyledButton
          type="button"
          onClick={() => onClearOption(reqId)}
          aria-label={backAriaLabel}
          style={{
            display: "block",
            width: "100%",
            padding: "var(--mantine-spacing-sm)",
            paddingLeft: indent,
            border: "none",
            borderBottom: "1px solid var(--mantine-color-dark-4)",
            backgroundColor: "var(--mantine-color-dark-6)",
            cursor: "pointer",
            textAlign: "left",
            transition: "background-color 120ms ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor =
              "var(--mantine-color-dark-5)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor =
              "var(--mantine-color-dark-6)";
          }}
        >
          <Group gap="sm" wrap="nowrap" align="flex-start">
            <IconArrowLeft
              size={20}
              aria-hidden
              style={{
                flexShrink: 0,
                marginTop: 2,
                color: "var(--mantine-color-gray-5)",
              }}
            />
            <Stack gap={4} style={{ minWidth: 0, flex: 1 }}>
              <Text size="xs" c="dimmed" fw={600} tt="uppercase" lh={1.2}>
                Change this requirement set
              </Text>
              <Text size="sm" lh={1.35} style={{ minWidth: 0 }}>
                {chosenHint}
              </Text>
            </Stack>
          </Group>
        </UnstyledButton>
        <Box
          p="sm"
          style={{
            paddingLeft: indent,
            backgroundColor: "var(--mantine-color-dark-7)",
          }}
        >
          <OptionsDrilldown
            nodeKeyPrefix={getStableNodeKey(
              selectedChild!,
              `${nodeKeyPrefix}:in:${selectedIdx}`,
            )}
            node={selectedChild!}
            completedCourses={completedCourses}
            selectedOptionsPerRequirement={selectedOptionsPerRequirement}
            onSelectOption={onSelectOption}
            onClearOption={onClearOption}
            activeBranch={activeBranch}
            depth={depth + 1}
          />
        </Box>
      </Paper>
    );
  }

  if (node.type === "and" && node.options?.length) {
    return (
      <Stack gap="lg">
        {node.options.map((child, idx) => {
          const childPrefix = getStableNodeKey(
            child,
            `${nodeKeyPrefix}:and:${idx}`,
          );
          return (
            <OptionsDrilldown
              key={childPrefix}
              nodeKeyPrefix={childPrefix}
              node={child}
              completedCourses={completedCourses}
              selectedOptionsPerRequirement={selectedOptionsPerRequirement}
              onSelectOption={onSelectOption}
              onClearOption={onClearOption}
              activeBranch={activeBranch}
              depth={depth + 1}
            />
          );
        })}
      </Stack>
    );
  }

  return (
    <RequirementNode
      nodeKey={nodeKeyPrefix}
      node={node}
      {...requirementNodeShared}
      activeBranch={activeBranch}
      depth={depth}
    />
  );
}
