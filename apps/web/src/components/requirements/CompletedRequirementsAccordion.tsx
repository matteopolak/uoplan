import { useState, type MouseEvent } from "react";
import { Paper, Group, Text, Badge, Collapse, Stack, Box } from "@mantine/core";
import { IconChevronDown } from "@tabler/icons-react";
import type { CompletedRequirementItem } from "schedule";

interface CompletedRequirementsAccordionProps {
  completedItems: CompletedRequirementItem[];
  satisfiedCount: number;
  totalCount: number;
}

export function CompletedRequirementsAccordion({
  completedItems,
  satisfiedCount,
  totalCount,
}: CompletedRequirementsAccordionProps) {
  const [completedOpen, setCompletedOpen] = useState(false);

  if (completedItems.length === 0) {
    return null;
  }

  return (
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
      <Group justify="space-between" align="center" mb={completedOpen ? "sm" : 0}>
        <Group gap="xs" align="center">
          <IconChevronDown
            size={14}
            style={{
              transform: completedOpen ? "rotate(0deg)" : "rotate(-90deg)",
              transition: "transform 150ms ease",
            }}
          />
          <Text fw={600} size="sm">
            {satisfiedCount}/{totalCount || "—"} completed requirements
          </Text>
        </Group>
        <Badge size="sm" variant="light" color="green">
          {completedOpen ? "Hide details" : "Show details"}
        </Badge>
      </Group>
      <Collapse in={completedOpen}>
        <Stack gap={0} mt="sm">
          {completedItems.map((item, idx) => (
            <Box
              key={`${(item.title ?? "").trim()}:${item.satisfiedBy.slice().sort().join(",")}:${idx}`}
              px="sm"
              py={6}
              style={{
                backgroundColor:
                  idx % 2 === 0 ? "var(--mantine-color-dark-6)" : "var(--mantine-color-dark-7)",
                borderTop: idx === 0 ? "1px solid var(--mantine-color-dark-4)" : "none",
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
  );
}
