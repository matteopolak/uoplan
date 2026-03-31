import { useState } from "react";
import {
  Stack,
  Group,
  Paper,
  Text,
  Radio,
  Box,
  VisuallyHidden,
  Badge,
} from "@mantine/core";
import { tr } from "../../i18n";

export interface ModeStepProps {
  value: "basic" | "advanced" | null;
  onChange: (mode: "basic" | "advanced") => void;
}

export function ModeStep({ value, onChange }: ModeStepProps) {
  const [hoveredMode, setHoveredMode] = useState<"basic" | "advanced" | null>(null);

  const getCardStyles = (mode: "basic" | "advanced") => {
    const isSelected = value === mode;
    const isHovered = hoveredMode === mode;

    return {
      cursor: "pointer",
      borderColor: isSelected
        ? "var(--mantine-color-dark-2)"
        : isHovered
          ? "var(--mantine-color-dark-3)"
          : "var(--mantine-color-dark-4)",
      backgroundColor: isSelected
        ? "var(--mantine-color-dark-6)"
        : isHovered
          ? "var(--mantine-color-dark-7)"
          : "transparent",
      boxShadow: isHovered && !isSelected
        ? "0 0 0 1px var(--mantine-color-dark-3)"
        : undefined,
      transition: "border-color 0.2s, background-color 0.2s, box-shadow 0.2s",
    } as const;
  };

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
            style={getCardStyles("basic")}
            onClick={() => onChange("basic")}
            onMouseEnter={() => setHoveredMode("basic")}
            onMouseLeave={() => setHoveredMode((m) => (m === "basic" ? null : m))}
            role="radio"
            aria-checked={value === "basic"}
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onChange("basic");
              }
            }}
          >
            <Group wrap="nowrap" align="flex-start">
              <VisuallyHidden>
                <Radio
                  value="basic"
                  mt={2}
                  aria-label={tr("modeStep.basic.aria")}
                />
              </VisuallyHidden>
              <Box>
                <Group gap="xs" align="center">
                  <Text fw={600} size="md">
                    {tr("modeStep.basic.title")}
                  </Text>
                  <Badge size="xs" variant="light" color="violet" radius={0}>
                    {tr("modeStep.basic.badge")}
                  </Badge>
                </Group>
                <Text size="sm" c="dimmed" mt={4}>
                  {tr("modeStep.basic.description")}
                </Text>
              </Box>
            </Group>
          </Paper>

          <Paper
            withBorder
            radius={0}
            p="md"
            style={getCardStyles("advanced")}
            onClick={() => onChange("advanced")}
            onMouseEnter={() => setHoveredMode("advanced")}
            onMouseLeave={() => setHoveredMode((m) => (m === "advanced" ? null : m))}
            role="radio"
            aria-checked={value === "advanced"}
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onChange("advanced");
              }
            }}
          >
            <Group wrap="nowrap" align="flex-start">
              <VisuallyHidden>
                <Radio
                  value="advanced"
                  mt={2}
                  aria-label={tr("modeStep.advanced.aria")}
                />
              </VisuallyHidden>
              <Box>
                <Group gap="xs" align="center">
                  <Text fw={600} size="md">
                    {tr("modeStep.advanced.title")}
                  </Text>
                  <Badge size="xs" variant="light" color="violet" radius={0}>
                    {tr("modeStep.advanced.badge")}
                  </Badge>
                </Group>
                <Text size="sm" c="dimmed" mt={4}>
                  {tr("modeStep.advanced.description")}
                </Text>
              </Box>
            </Group>
          </Paper>
        </Stack>
      </Radio.Group>
    </Stack>
  );
}
