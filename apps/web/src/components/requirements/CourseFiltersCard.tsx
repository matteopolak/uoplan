import { Group, MultiSelect, Paper, Stack, Switch, Text } from "@mantine/core";
import { tr } from "../../i18n";

export interface CourseFiltersCardProps {
  levelBuckets: ("undergrad" | "grad")[];
  languageBuckets: ("en" | "fr" | "other")[];
  electiveLevelBuckets: number[];
  includeClosedComponents: boolean;
  showGraduateElectiveLevels?: boolean;
  onChangeLevelBuckets: (buckets: ("undergrad" | "grad")[]) => void;
  onChangeLanguageBuckets: (buckets: ("en" | "fr" | "other")[]) => void;
  onChangeElectiveLevelBuckets: (buckets: number[]) => void;
  onIncludeClosedComponentsChange: (value: boolean) => void;
}

export function CourseFiltersCard({
  levelBuckets,
  languageBuckets,
  electiveLevelBuckets,
  includeClosedComponents,
  showGraduateElectiveLevels = false,
  onChangeLevelBuckets,
  onChangeLanguageBuckets,
  onChangeElectiveLevelBuckets,
  onIncludeClosedComponentsChange,
}: CourseFiltersCardProps) {
  const electiveLevelOptions = showGraduateElectiveLevels
    ? [
        { value: "1000", label: "1XXX" },
        { value: "2000", label: "2XXX" },
        { value: "3000", label: "3XXX" },
        { value: "4000", label: "4XXX" },
        { value: "5000", label: "5XXX" },
        { value: "6000", label: "6XXX" },
      ]
    : [
        { value: "1000", label: "1XXX" },
        { value: "2000", label: "2XXX" },
        { value: "3000", label: "3XXX" },
        { value: "4000", label: "4XXX" },
      ];

  const allowedElectiveLevels = showGraduateElectiveLevels
    ? new Set([1000, 2000, 3000, 4000, 5000, 6000])
    : new Set([1000, 2000, 3000, 4000]);

  return (
    <Paper p="sm" withBorder radius={0}>
      <Stack gap="xs">
        <Group justify="space-between" align="center">
          <Text size="sm" fw={500}>
            {tr("constrainStep.courseFilters")}
          </Text>
          <Text size="xs" c="dimmed">
            {tr("constrainStep.filtersHint")}
          </Text>
        </Group>
        <Group gap="md" align="flex-start" style={{ alignItems: "center" }}>
          <MultiSelect
            label={tr("constrainStep.levels.label")}
            data={[
              { value: "undergrad", label: tr("constrainStep.levels.undergrad") },
              { value: "grad", label: tr("constrainStep.levels.grad") },
            ]}
            value={levelBuckets}
            onChange={(vals) =>
              onChangeLevelBuckets(
                vals.filter(
                  (v): v is "undergrad" | "grad" =>
                    v === "undergrad" || v === "grad",
                ),
              )
            }
            clearable={false}
          />
          <MultiSelect
            label={tr("constrainStep.languages.label")}
            data={[
              { value: "en", label: tr("constrainStep.languages.english") },
              { value: "fr", label: tr("constrainStep.languages.french") },
              { value: "other", label: tr("constrainStep.languages.other") },
            ]}
            value={languageBuckets}
            onChange={(vals) =>
              onChangeLanguageBuckets(
                vals.filter(
                  (v): v is "en" | "fr" | "other" =>
                    v === "en" || v === "fr" || v === "other",
                ),
              )
            }
            clearable={false}
          />
          <MultiSelect
            label={tr("constrainStep.electiveLevels.label")}
            data={electiveLevelOptions}
            value={electiveLevelBuckets.map((v) => String(v))}
            onChange={(vals) =>
              onChangeElectiveLevelBuckets(
                vals
                  .map((v) => parseInt(v, 10))
                  .filter((n) => allowedElectiveLevels.has(n)),
              )
            }
            clearable={false}
          />
          <Switch
            label={tr("constrainStep.includeClosedSections")}
            checked={includeClosedComponents}
            onChange={(e) =>
              onIncludeClosedComponentsChange(e.currentTarget.checked)
            }
          />
        </Group>
      </Stack>
    </Paper>
  );
}
