import {
  Collapse,
  Group,
  MultiSelect,
  Paper,
  Stack,
  Switch,
  Text,
  UnstyledButton,
  Box,
  Divider,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconChevronDown } from "@tabler/icons-react";
import { tr } from "../../i18n";

export interface ExcludeElectiveSubjectsProps {
  data: { value: string; label: string }[];
  value: string[];
  onChange: (value: string[]) => void;
}

export interface BaseCourseFiltersProps {
  levelBuckets: ("undergrad" | "grad")[];
  languageBuckets: ("en" | "fr" | "other")[];
  electiveLevelBuckets: number[];
  includeClosedComponents: boolean;
  virtualSectionsOnly: boolean;
  showGraduateElectiveLevels?: boolean;
  onChangeLevelBuckets: (buckets: ("undergrad" | "grad")[]) => void;
  onChangeLanguageBuckets: (buckets: ("en" | "fr" | "other")[]) => void;
  onChangeElectiveLevelBuckets: (buckets: number[]) => void;
  onIncludeClosedComponentsChange: (value: boolean) => void;
  onVirtualSectionsOnlyChange: (value: boolean) => void;
}

export interface BasicCourseFiltersCardProps extends BaseCourseFiltersProps {
  excludeElectiveSubjects?: ExcludeElectiveSubjectsProps;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
}

export function BasicCourseFiltersCard({
  levelBuckets,
  languageBuckets,
  electiveLevelBuckets,
  includeClosedComponents,
  virtualSectionsOnly,
  showGraduateElectiveLevels = false,
  onChangeLevelBuckets,
  onChangeLanguageBuckets,
  onChangeElectiveLevelBuckets,
  onIncludeClosedComponentsChange,
  onVirtualSectionsOnlyChange,
  excludeElectiveSubjects,
  collapsible = false,
  defaultCollapsed = true,
}: BasicCourseFiltersCardProps) {
  const [filtersOpen, { toggle: toggleFilters }] = useDisclosure(
    !defaultCollapsed,
  );

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

  const headerContent = (
    <>
      <Text size="sm" fw={500}>
        {tr("basicCourseFilters.title")}
      </Text>
      <Text size="xs" c="dimmed">
        {tr("basicCourseFilters.hint")}
      </Text>
    </>
  );

  const filterBody = (
    <Stack gap="md" mt={collapsible ? "sm" : 0}>
      {excludeElectiveSubjects && (
        <MultiSelect
          label={tr("basicCalendar.exclude.label")}
          placeholder={tr("basicCalendar.exclude.placeholder")}
          searchable
          data={excludeElectiveSubjects.data}
          value={excludeElectiveSubjects.value}
          onChange={excludeElectiveSubjects.onChange}
          radius={0}
        />
      )}
      <Group gap="md" align="flex-start" style={{ alignItems: "center" }}>
        <MultiSelect
          label={tr("basicCourseFilters.careers.label")}
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
          w="100%"
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
          w="100%"
        />
        <MultiSelect
          label={tr("basicCourseFilters.levels.label")}
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
          w="100%"
        />
        <Switch
          label={tr("constrainStep.includeClosedSections")}
          checked={includeClosedComponents}
          onChange={(e) =>
            onIncludeClosedComponentsChange(e.currentTarget.checked)
          }
        />
        <Switch
          label={tr("constrainStep.virtualSectionsOnly")}
          checked={virtualSectionsOnly}
          onChange={(e) =>
            onVirtualSectionsOnlyChange(e.currentTarget.checked)
          }
        />
      </Group>
    </Stack>
  );

  return (
    <Paper p="sm" withBorder radius={0}>
      <Stack gap="xs">
        {collapsible ? (
          <UnstyledButton
            type="button"
            onClick={toggleFilters}
            aria-expanded={filtersOpen}
            style={{
              borderRadius: 0,
              textAlign: "left",
              width: "100%",
            }}
          >
            <Group align="flex-start" gap="sm" wrap="nowrap">
              <IconChevronDown
                size={18}
                style={{
                  flexShrink: 0,
                  marginTop: 2,
                  transform: filtersOpen ? "rotate(0deg)" : "rotate(-90deg)",
                  transition: "transform 0.15s ease",
                }}
                aria-hidden
              />
              <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
                {headerContent}
              </Stack>
            </Group>
          </UnstyledButton>
        ) : (
          <Group justify="space-between" align="center">
            <Stack gap={4}>
              {headerContent}
            </Stack>
          </Group>
        )}
        <Collapse in={collapsible ? filtersOpen : true}>{filterBody}</Collapse>
      </Stack>
    </Paper>
  );
}

export type AdvancedCourseFiltersCardProps = BaseCourseFiltersProps;

export function AdvancedCourseFiltersCard({
  levelBuckets,
  languageBuckets,
  electiveLevelBuckets,
  includeClosedComponents,
  virtualSectionsOnly,
  showGraduateElectiveLevels = false,
  onChangeLevelBuckets,
  onChangeLanguageBuckets,
  onChangeElectiveLevelBuckets,
  onIncludeClosedComponentsChange,
  onVirtualSectionsOnlyChange,
}: AdvancedCourseFiltersCardProps) {
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
      <Stack gap="md">
        {/* Section 1: Course filters */}
        <Box>
          <Group justify="space-between" align="center" mb="xs">
            <Stack gap={4}>
              <Text size="sm" fw={500}>
                {tr("advancedCourseFilters.course.title")}
              </Text>
              <Text size="xs" c="dimmed">
                {tr("advancedCourseFilters.course.hint")}
              </Text>
            </Stack>
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
              w="100%"
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
              w="100%"
            />
            <Switch
              label={tr("constrainStep.includeClosedSections")}
              checked={includeClosedComponents}
              onChange={(e) =>
                onIncludeClosedComponentsChange(e.currentTarget.checked)
              }
            />
          </Group>
        </Box>

        <Divider color="var(--mantine-color-dark-4)" />

        {/* Section 2: Elective filters */}
        <Box>
          <Group justify="space-between" align="center" mb="xs">
            <Stack gap={4}>
              <Text size="sm" fw={500}>
                {tr("advancedCourseFilters.elective.title")}
              </Text>
              <Text size="xs" c="dimmed">
                {tr("advancedCourseFilters.elective.hint")}
              </Text>
            </Stack>
          </Group>
          <Group gap="md" align="flex-start" style={{ alignItems: "center" }}>
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
              w="100%"
            />
            <Switch
              label={tr("constrainStep.virtualSectionsOnly")}
              checked={virtualSectionsOnly}
              onChange={(e) =>
                onVirtualSectionsOnlyChange(e.currentTarget.checked)
              }
            />
          </Group>
        </Box>
      </Stack>
    </Paper>
  );
}
