import { Box, Group, Stack, Text } from "@mantine/core";
import { IconCheck } from "@tabler/icons-react";

export const STEPS = [
  { label: "Term", description: "Choose term" },
  { label: "Program", description: "Choose your program" },
  { label: "Completed", description: "Mark completed courses" },
  { label: "Requirements", description: "Select courses" },
  { label: "Generate", description: "Choose count and generate" },
] as const;

export type Step = (typeof STEPS)[number];

interface StepNavProps {
  active: number;
  onStepClick: (idx: number) => void;
  isMobile: boolean;
}

function StepItem({
  step,
  idx,
  active,
  onStepClick,
  isMobile,
}: {
  step: Step;
  idx: number;
  active: number;
  onStepClick: (idx: number) => void;
  isMobile: boolean;
}) {
  const isActive = idx === active;
  const isComplete = idx < active;

  return (
    <Box
      style={{
        display: "flex",
        flexDirection: isMobile ? "column" : "row",
        alignItems: isMobile ? "center" : "flex-start",
        gap: 10,
        paddingBottom: !isMobile && idx < STEPS.length - 1 ? 16 : 0,
        cursor: isComplete ? "pointer" : "default",
        position: "relative",
        zIndex: 1,
      }}
      onClick={() => {
        if (isComplete) onStepClick(idx);
      }}
    >
      <Box
        style={{
          width: 20,
          height: 20,
          flexShrink: 0,
          borderRadius: "50%",
          border: `2px solid ${isActive ? "#B197FC" : isComplete ? "#2F9E44" : "#2C2E33"}`,
          backgroundColor: isComplete ? "#2F9E44" : "#141517",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginTop: isMobile ? 0 : 1,
        }}
      >
        {isComplete && <IconCheck size={11} color="#fff" />}
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
            color: isActive ? "#F8F9FA" : isComplete ? "#A6A7AB" : "#868E96",
            lineHeight: 1.3,
          }}
        >
          {step.label}
        </Text>
      </Group>
    </Box>
  );
}

export function StepNav({ active, onStepClick, isMobile }: StepNavProps) {
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
          {STEPS.length > 1 && (
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
            {STEPS.map((step, idx) => (
              <StepItem
                key={step.label}
                step={step}
                idx={idx}
                active={active}
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
        {STEPS.length > 1 && (
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
          {STEPS.map((step, idx) => (
            <StepItem
              key={step.label}
              step={step}
              idx={idx}
              active={active}
              onStepClick={onStepClick}
              isMobile={isMobile}
            />
          ))}
        </Stack>
      </Box>
    </Box>
  );
}
