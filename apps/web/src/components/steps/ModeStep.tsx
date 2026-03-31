import { Stack, Group, Paper, Text, Radio, Box } from "@mantine/core";

export interface ModeStepProps {
  value: "basic" | "advanced" | null;
  onChange: (mode: "basic" | "advanced") => void;
}

export function ModeStep({ value, onChange }: ModeStepProps) {
  return (
    <Stack gap="md" data-tour="mode-select">
      <Radio.Group
        value={value ?? ""}
        onChange={(v) => onChange(v as "basic" | "advanced")}
        name="plannerMode"
      >
        <Stack gap="sm">
          <Paper
            withBorder
            radius={0}
            p="md"
            style={{
              cursor: "pointer",
              borderColor: value === "basic" ? "#B197FC" : "#2C2E33",
              backgroundColor: value === "basic" ? "var(--mantine-color-dark-6)" : "transparent",
              transition: "border-color 0.2s, background-color 0.2s",
            }}
            onClick={() => onChange("basic")}
          >
            <Group wrap="nowrap" align="flex-start">
              <Radio value="basic" mt={2} aria-label="Basic mode" />
              <Box>
                <Text fw={600} size="md">
                  Basic Mode
                </Text>
                <Text size="sm" c="dimmed" mt={4}>
                  Quickly select required courses and electives to generate a schedule. Best for simple scheduling without needing to track full degree progress.
                </Text>
              </Box>
            </Group>
          </Paper>

          <Paper
            withBorder
            radius={0}
            p="md"
            style={{
              cursor: "pointer",
              borderColor: value === "advanced" ? "#B197FC" : "#2C2E33",
              backgroundColor: value === "advanced" ? "var(--mantine-color-dark-6)" : "transparent",
              transition: "border-color 0.2s, background-color 0.2s",
            }}
            onClick={() => onChange("advanced")}
          >
            <Group wrap="nowrap" align="flex-start">
              <Radio value="advanced" mt={2} aria-label="Advanced mode" />
              <Box>
                <Text fw={600} size="md">
                  Advanced Mode
                </Text>
                <Text size="sm" c="dimmed" mt={4}>
                  Select your program and build a comprehensive degree plan. Tracks completed courses and maps them against your specific degree requirements.
                </Text>
              </Box>
            </Group>
          </Paper>
        </Stack>
      </Radio.Group>
    </Stack>
  );
}
