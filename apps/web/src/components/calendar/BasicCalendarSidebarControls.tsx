import { useMemo, useRef, useState } from "react";
import { Button, MultiSelect, NumberInput, Stack, Box, Text, Loader, Alert, type OptionsFilter } from "@mantine/core";
import { useAppStore } from "../../store/appStore";
import { useShallow } from "zustand/react/shallow";
import { createCourseOptions, renderCourseOption } from "../shared/CourseSelect";
import { BasicCourseFiltersCard } from "../requirements/CourseFiltersCard";
import { tr } from "../../i18n";
import { parseTranscriptPdf, isOptCourse, normalizeCourseCode } from "schedule";

export function BasicCalendarSidebarControls({ onBeforeNavigate }: { onBeforeNavigate?: () => void }) {
  const {
    cache,
    basicPinnedCourses,
    basicElectivesCount,
    basicExcludedCategories,
    levelBuckets,
    languageBuckets,
    electiveLevelBuckets,
    includeClosedComponents,
    virtualSectionsOnly,
    completedCourses,
    indices,
  } = useAppStore(
    useShallow((s) => ({
      cache: s.cache,
      basicPinnedCourses: s.basicPinnedCourses,
      basicElectivesCount: s.basicElectivesCount,
      basicExcludedCategories: s.basicExcludedCategories,
      levelBuckets: s.levelBuckets,
      languageBuckets: s.languageBuckets,
      electiveLevelBuckets: s.electiveLevelBuckets,
      includeClosedComponents: s.includeClosedComponents,
      virtualSectionsOnly: s.virtualSectionsOnly,
      completedCourses: s.completedCourses,
      indices: s.indices,
    }))
  );

  const setBasicPinnedCourses = useAppStore((s) => s.setBasicPinnedCourses);
  const setBasicElectivesCount = useAppStore((s) => s.setBasicElectivesCount);
  const setBasicExcludedCategories = useAppStore((s) => s.setBasicExcludedCategories);
  const goToPreviousSeed = useAppStore((s) => s.goToPreviousSeed);
  const goToNextSeed = useAppStore((s) => s.goToNextSeed);
  const markBasicSettingsChanged = useAppStore((s) => s.markBasicSettingsChanged);
  const setLevelBuckets = useAppStore((s) => s.setLevelBuckets);
  const setLanguageBuckets = useAppStore((s) => s.setLanguageBuckets);
  const setElectiveLevelBuckets = useAppStore((s) => s.setElectiveLevelBuckets);
  const setIncludeClosedComponents = useAppStore((s) => s.setIncludeClosedComponents);
  const setVirtualSectionsOnly = useAppStore((s) => s.setVirtualSectionsOnly);
  const setCompletedCourses = useAppStore((s) => s.setCompletedCourses);

  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [transcriptError, setTranscriptError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleTranscriptFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setTranscriptLoading(true);
    setTranscriptError(null);

    try {
      const buffer = await file.arrayBuffer();
      const { courses: parsedCourses } = await parseTranscriptPdf(buffer);
      const inCatalogue: string[] = [];
      const indexedCodes = indices ? new Set(indices.courses.map(normalizeCourseCode)) : new Set<string>();
      for (const code of parsedCourses) {
        if (isOptCourse(normalizeCourseCode(code)) || cache!.getCourse(code) || indexedCodes.has(normalizeCourseCode(code))) {
          inCatalogue.push(code);
        }
      }
      const merged = [...new Set([...completedCourses, ...inCatalogue])];

      if (merged.length > completedCourses.length) {
        setCompletedCourses(merged);
        markBasicSettingsChanged();
      } else {
        setTranscriptError(tr("basicCalendar.transcript.error.noneAdded"));
      }
    } catch (err) {
      console.error(err);
      setTranscriptError(tr("basicCalendar.transcript.error.parseFailed"));
    } finally {
      setTranscriptLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const allCategories = useMemo(() => {
    if (!cache) return [] as string[];
    const categories = [
      ...new Set(
        cache.getAllCourses().map((c) => {
          const match = c.code.match(/^([A-Z]{3,4})/i);
          return match ? match[1].toUpperCase() : null;
        }),
      ),
    ].filter((c): c is string => c !== null);
    categories.sort();
    return categories;
  }, [cache]);

  const requiredCourseOptions = useMemo(() => {
    if (!cache) return [];
    const seen = new Set<string>();
    return cache.getAllSchedules().flatMap((sched) => {
      const course = cache.getCourse(sched.courseCode);
      if (!course) return [];
      if (seen.has(course.code)) return [];
      seen.add(course.code);
      return [{ value: course.code, label: `${course.code} - ${course.title}` }];
    }).sort((a, b) => a.label.localeCompare(b.label));
  }, [cache]);

  const requiredCoursesFilter: OptionsFilter = ({ options, search }) => {
    const splittedSearch = search.toLowerCase().trim().split(" ");
    return (options as { label: string; value: string }[]).filter((option) => {
      if (!option.label) return false;
      const words = option.label.toLowerCase().trim().split(" ");
      return splittedSearch.every((searchWord) => words.some((word: string) => word.includes(searchWord)));
    });
  };

  const completedCourseOptions = useMemo(() => {
    if (!cache) return [];
    const unique = [...new Set(cache.getAllCourses().map((c) => c.code))];
    return createCourseOptions(unique, cache);
  }, [cache]);

  const completedCoursesFilter: OptionsFilter = ({ options, search }) => {
    const splittedSearch = search.toLowerCase().trim().split(" ");
    return (options as { label: string; value: string }[]).filter((option) => {
      if (!option.label) return false;
      const words = option.label.toLowerCase().trim().split(" ");
      return splittedSearch.every((searchWord) => words.some((word: string) => word.includes(searchWord)));
    });
  };

  return (
    <>
      <Stack gap="md">
        <MultiSelect
          label={tr("basicCalendar.required.label")}
          placeholder={tr("basicCalendar.required.placeholder")}
          searchable
          data={requiredCourseOptions}
          value={basicPinnedCourses}
          onChange={(v) => {
            setBasicPinnedCourses(v);
            markBasicSettingsChanged();
          }}
          filter={requiredCoursesFilter}
          radius={0}
        />

        <NumberInput
          label={tr("basicCalendar.electives.label")}
          value={basicElectivesCount}
          onChange={(v) => {
            if (typeof v !== "number" || Number.isNaN(v)) return;
            const nextCount = Math.max(0, Math.min(8, Math.trunc(v)));
            if (nextCount === basicElectivesCount) return;
            setBasicElectivesCount(nextCount);
            markBasicSettingsChanged();
          }}
          min={0}
          max={8}
          radius={0}
        />

        <BasicCourseFiltersCard
          levelBuckets={levelBuckets}
          languageBuckets={languageBuckets}
          electiveLevelBuckets={electiveLevelBuckets}
          includeClosedComponents={includeClosedComponents}
          virtualSectionsOnly={virtualSectionsOnly}
          showGraduateElectiveLevels
          collapsible
          excludeElectiveSubjects={{
            data: allCategories.map((c) => ({ value: c, label: c })),
            value: basicExcludedCategories,
            onChange: (v) => {
              setBasicExcludedCategories(v);
              markBasicSettingsChanged();
            },
          }}
          onChangeLevelBuckets={(buckets) => {
            setLevelBuckets(buckets);
            markBasicSettingsChanged();
          }}
          onChangeLanguageBuckets={(buckets) => {
            setLanguageBuckets(buckets);
            markBasicSettingsChanged();
          }}
          onChangeElectiveLevelBuckets={(buckets) => {
            setElectiveLevelBuckets(buckets);
            markBasicSettingsChanged();
          }}
          onIncludeClosedComponentsChange={(checked) => {
            setIncludeClosedComponents(checked);
            markBasicSettingsChanged();
          }}
          onVirtualSectionsOnlyChange={(checked) => {
            setVirtualSectionsOnly(checked);
            markBasicSettingsChanged();
          }}
        />

        {/* Seed Navigation for Basic Mode */}
        <Button.Group>
          <Button
            variant="light"
            color="violet"
            size="sm"
            radius={0}
            onClick={() => { onBeforeNavigate?.(); goToPreviousSeed(); }}
          >
            {tr("calendarPage.previous")}
          </Button>
          <Button
            variant="filled"
            color="violet"
            size="sm"
            radius={0}
            onClick={() => { onBeforeNavigate?.(); goToNextSeed(); }}
          >
            {tr("calendarPage.next")}
          </Button>
        </Button.Group>
      </Stack>

      <Box style={{ borderTop: "1px solid #2C2E33", paddingTop: 16, marginTop: 8 }}>
        <Text size="sm" fw={600} mb={8} style={{ color: "#F8F9FA" }}>
          {tr("basicCalendar.prereq.heading")}
        </Text>
        <Text size="xs" style={{ color: "#ADB5BD", marginBottom: 12 }}>
          {tr("basicCalendar.prereq.description")}
        </Text>
        <Stack gap="sm">
          <MultiSelect
            placeholder={tr("basicCalendar.completed.placeholder")}
            data={completedCourseOptions}
            value={completedCourses}
            onChange={(v) => {
              setCompletedCourses(v);
              markBasicSettingsChanged();
            }}
            searchable
            clearable
            renderOption={renderCourseOption(cache)}
            filter={completedCoursesFilter}
            nothingFoundMessage={tr("basicCalendar.completed.notFound")}
            radius={0}
          />

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            onChange={(e) => {
              void handleTranscriptFile(e);
            }}
            disabled={transcriptLoading}
            style={{ display: "none" }}
          />
          <Button
            size="sm"
            color="gray"
            variant="light"
            radius={0}
            onClick={() => fileInputRef.current?.click()}
            disabled={transcriptLoading}
            leftSection={transcriptLoading ? <Loader size="xs" /> : undefined}
            fullWidth
          >
            {transcriptLoading
              ? tr("basicCalendar.transcript.parsing")
              : tr("basicCalendar.transcript.upload")}
          </Button>
          {transcriptError && (
            <Alert color="red" variant="light" py="xs">
              <Text size="xs">{transcriptError}</Text>
            </Alert>
          )}
        </Stack>
      </Box>
    </>
  );
}
