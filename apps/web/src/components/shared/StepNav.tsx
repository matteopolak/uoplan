import { Box, Group, Stack, Text } from "@mantine/core";
import { IconCheck } from "@tabler/icons-react";
import {
  isWizardStepSkipped,
  skippedWizardStepIsPassed,
} from "../../lib/wizardSteps";

export const STEPS = [
  { label: "Term", description: "Choose term" },
  { label: "Program", description: "Choose your program" },
  { label: "Completed", description: "Mark completed courses" },
  { label: "Options", description: "Choose program options" },
  { label: "Assign", description: "Assign completed courses" },
  { label: "Constrain", description: "Constrain schedule generation" },
  { label: "Generate", description: "Choose count and generate" },
] as const;

export type Step = (typeof STEPS)[number];

interface StepNavProps {
  /** Indices into {@link STEPS}; pass every step (0–6) so optional rows can show as skipped. */
  visibleStepIndices: readonly number[];
  active: number;
  /** Max visible-row index the user has reached; steps before this stay checked when revisiting earlier rows. */
  furthestDisplayIndex: number;
  furthestActualStep: number;
  needsOptionsStep: boolean;
  needsAssignStep: boolean;
  onStepClick: (stepIndex: number) => void;
  isMobile: boolean;
}

function StepItem({
  step,
  displayIdx,
  actualIdx,
  active,
  furthestDisplayIndex,
  furthestActualStep,
  needsOptionsStep,
  needsAssignStep,
  visibleCount,
  onStepClick,
  isMobile,
}: {
  step: Step;
  displayIdx: number;
  actualIdx: number;
  active: number;
  furthestDisplayIndex: number;
  furthestActualStep: number;
  needsOptionsStep: boolean;
  needsAssignStep: boolean;
  visibleCount: number;
  onStepClick: (stepIndex: number) => void;
  isMobile: boolean;
}) {
  const isActive = actualIdx === active;
  const isSkipped = isWizardStepSkipped(
    actualIdx,
    needsOptionsStep,
    needsAssignStep,
  );
  const skippedPassed = skippedWizardStepIsPassed(
    actualIdx,
    furthestActualStep,
    needsOptionsStep,
    needsAssignStep,
  );
  const isComplete = !isSkipped && displayIdx < furthestDisplayIndex;
  /** Completed rows, plus the next row after them (same as pressing Next from the last completed). Skipped rows are never clickable. */
  const isClickable =
    !isSkipped &&
    !isActive &&
    displayIdx <= furthestDisplayIndex;

  const borderColor = isActive
    ? "#B197FC"
    : skippedPassed
      ? "#6C757D"
      : isComplete
        ? "#2F9E44"
        : "#2C2E33";
  const backgroundColor = skippedPassed
    ? "#343A40"
    : isComplete
      ? "#2F9E44"
      : "#141517";

  const labelColor = isActive
    ? "#F8F9FA"
    : skippedPassed
      ? "#909296"
      : isComplete
        ? "#A6A7AB"
        : "#868E96";

  return (
    <Box
      style={{
        display: "flex",
        flexDirection: isMobile ? "column" : "row",
        alignItems: isMobile ? "center" : "flex-start",
        gap: 10,
        paddingBottom: !isMobile && displayIdx < visibleCount - 1 ? 16 : 0,
        cursor: isClickable ? "pointer" : "default",
        position: "relative",
        zIndex: 1,
      }}
      onClick={() => {
        if (isClickable) onStepClick(actualIdx);
      }}
    >
      <Box
        style={{
          width: 20,
          height: 20,
          flexShrink: 0,
          borderRadius: "50%",
          border: `2px solid ${borderColor}`,
          backgroundColor,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginTop: isMobile ? 0 : 1,
        }}
      >
        {isComplete && <IconCheck size={11} color="#fff" />}
        {skippedPassed && <IconCheck size={11} color="#ADB5BD" />}
        {isActive && !isComplete && (
          <Box
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              backgroundColor: "#B197FC",
            }}
          />
        )}
      </Box>
      <Group
        gap={6}
        wrap="nowrap"
        align="center"
        style={{ paddingTop: isMobile ? 4 : 1 }}
      >
        <Text
          size="xs"
          fw={isActive ? 600 : 400}
          style={{
            color: labelColor,
            lineHeight: 1.3,
          }}
        >
          {step.label}
        </Text>
      </Group>
    </Box>
  );
}

export function StepNav({
  visibleStepIndices,
  active,
  furthestDisplayIndex,
  furthestActualStep,
  needsOptionsStep,
  needsAssignStep,
  onStepClick,
  isMobile,
}: StepNavProps) {
  const visibleCount = visibleStepIndices.length;

  if (isMobile) {
    return (
      <Box style={{ width: "100%" }}>
        <Text
          size="xs"
          fw={500}
          mb={10}
          style={{
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: "#A6A7AB",
          }}
        >
          Steps
        </Text>
        <Box style={{ position: "relative", width: "100%" }}>
          {visibleCount > 1 && (
            <Box
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: 10,
                height: 1,
                backgroundColor: "#2C2E33",
                zIndex: 0,
              }}
            />
          )}
          <Group
            gap="md"
            wrap="nowrap"
            style={{
              justifyContent: "space-between",
              width: "100%",
              position: "relative",
              zIndex: 1,
            }}
          >
            {visibleStepIndices.map((actualIdx, displayIdx) => (
              <StepItem
                key={actualIdx}
                step={STEPS[actualIdx]}
                displayIdx={displayIdx}
                actualIdx={actualIdx}
                active={active}
                furthestDisplayIndex={furthestDisplayIndex}
                furthestActualStep={furthestActualStep}
                needsOptionsStep={needsOptionsStep}
                needsAssignStep={needsAssignStep}
                visibleCount={visibleCount}
                onStepClick={onStepClick}
                isMobile={isMobile}
              />
            ))}
          </Group>
        </Box>
      </Box>
    );
  }

  return (
    <Box>
      <Text
        size="xs"
        fw={500}
        mb={14}
        style={{
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          color: "#A6A7AB",
        }}
      >
        Steps
      </Text>
      <Box style={{ position: "relative" }}>
        {visibleCount > 1 && (
          <Box
            style={{
              position: "absolute",
              left: 9,
              top: 10,
              bottom: 10,
              width: 1,
              backgroundColor: "#2C2E33",
              zIndex: 0,
            }}
          />
        )}
        <Stack gap={0}>
          {visibleStepIndices.map((actualIdx, displayIdx) => (
            <StepItem
              key={actualIdx}
              step={STEPS[actualIdx]}
              displayIdx={displayIdx}
              actualIdx={actualIdx}
              active={active}
              furthestDisplayIndex={furthestDisplayIndex}
              furthestActualStep={furthestActualStep}
              needsOptionsStep={needsOptionsStep}
              needsAssignStep={needsAssignStep}
              visibleCount={visibleCount}
              onStepClick={onStepClick}
              isMobile={isMobile}
            />
          ))}
        </Stack>
      </Box>
    </Box>
  );
}
