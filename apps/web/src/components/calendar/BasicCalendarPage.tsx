import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Select,
  Stack,
  Text,
  Title,
  MultiSelect,
  NumberInput,
  type OptionsFilter,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import {
  IconMenu2,
  IconX,
} from "@tabler/icons-react";
import { useAppStore } from "../../store/appStore";
import { useShallow } from "zustand/react/shallow";
import { CalendarView, type CalendarViewHandle } from "./CalendarView";
import { GenerationErrorDetailBlocks } from "../GenerationErrorDetailBlocks";
import { buildScheduleIcs, downloadTextFile, parseTranscriptPdf, isOptCourse, normalizeCourseCode } from "schedule";
import { Loader } from "@mantine/core";
import { createCourseOptions, renderCourseOption } from '../shared/CourseSelect';
import { useTimetableDateRangeFromSchedule } from "../../hooks/useTimetableDateRange";
import { tr } from "../../i18n";
import { LanguageSwitcher } from "../shared/LanguageSwitcher";
import { CourseFiltersCard } from "../requirements/CourseFiltersCard";

interface BasicCalendarPageProps {
  onBack: () => void;
}

const requiredCoursesFilter: OptionsFilter = ({ options, search }) => {
  const query = search.toLowerCase().trim();
  if (!query) return options;

  const exactMatches: typeof options = [];
  const partialMatches: typeof options = [];

  for (const option of options) {
    if ("value" in option) {
      const val = option.value.toLowerCase();
      const label = typeof option.label === "string" ? option.label.toLowerCase() : "";
      const valNoSpace = val.replace(/\s+/g, "");
      const queryNoSpace = query.replace(/\s+/g, "");

      if (val.includes(query) || valNoSpace.includes(queryNoSpace)) {
        exactMatches.push(option);
      } else if (label.includes(query)) {
        partialMatches.push(option);
      }
    }
  }

  return [...exactMatches, ...partialMatches];
};

const completedCoursesFilter: OptionsFilter = ({ options, search }) => {
  const query = search.toLowerCase().trim();
  if (!query) return options;

  return options.filter((option) => {
    if (!("value" in option)) return false;
    const value = option.value.toLowerCase();
    const label = typeof option.label === "string" ? option.label.toLowerCase() : "";
    return value.includes(query) || label.includes(query);
  });
};

export function BasicCalendarPage({ onBack }: BasicCalendarPageProps) {
  useEffect(() => {
    document.documentElement.classList.add("calendar-no-scrollbar-gutter");
    return () => {
      document.documentElement.classList.remove("calendar-no-scrollbar-gutter");
    };
  }, []);

  const {
    generatedSchedules,
    selectedScheduleIndex,
    generationError,
    cache,
    professorRatings,
    scheduleColorMaps,
    basicPinnedCourses,
    basicElectivesCount,
    basicExcludedCategories,
    levelBuckets,
    languageBuckets,
    electiveLevelBuckets,
    includeClosedComponents,
    completedCourses,
    indices,
  } = useAppStore(
    useShallow((s) => ({
      generatedSchedules: s.generatedSchedules,
      selectedScheduleIndex: s.selectedScheduleIndex,
      generationError: s.generationError,
      cache: s.cache,
      professorRatings: s.professorRatings,
      scheduleColorMaps: s.scheduleColorMaps,
      basicPinnedCourses: s.basicPinnedCourses,
      basicElectivesCount: s.basicElectivesCount,
      basicExcludedCategories: s.basicExcludedCategories,
      levelBuckets: s.levelBuckets,
      languageBuckets: s.languageBuckets,
      electiveLevelBuckets: s.electiveLevelBuckets,
      includeClosedComponents: s.includeClosedComponents,
      completedCourses: s.completedCourses,
      indices: s.indices,
    })),
  );

  const setSelectedScheduleIndex = useAppStore((s) => s.setSelectedScheduleIndex);
  const generateBasicSchedules = useAppStore((s) => s.generateBasicSchedules);
  const getSwapCandidates = useAppStore((s) => s.getSwapCandidates);
  const swapCourseInSchedule = useAppStore((s) => s.swapCourseInSchedule);
  const setBasicPinnedCourses = useAppStore((s) => s.setBasicPinnedCourses);
  const setBasicElectivesCount = useAppStore((s) => s.setBasicElectivesCount);
  const setBasicExcludedCategories = useAppStore((s) => s.setBasicExcludedCategories);
  const setWizardMode = useAppStore((s) => s.setWizardMode);
  const clearGeneratedSchedules = useAppStore((s) => s.clearGeneratedSchedules);
  const setCompletedCourses = useAppStore((s) => s.setCompletedCourses);
  const setLevelBuckets = useAppStore((s) => s.setLevelBuckets);
  const setLanguageBuckets = useAppStore((s) => s.setLanguageBuckets);
  const setElectiveLevelBuckets = useAppStore((s) => s.setElectiveLevelBuckets);
  const setIncludeClosedComponents = useAppStore((s) => s.setIncludeClosedComponents);

  const morphRef = useRef<CalendarViewHandle>(null);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [transcriptError, setTranscriptError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [timetableStartDate, setTimetableStartDate] = useState("");
  const [timetableEndDate, setTimetableEndDate] = useState("");

  const isMobile = useMediaQuery("(max-width: 768px)");

  useTimetableDateRangeFromSchedule(
    generatedSchedules,
    selectedScheduleIndex,
    timetableStartDate,
    timetableEndDate,
    setTimetableStartDate,
    setTimetableEndDate,
  );

  const scheduleOptions = generatedSchedules.map((_, i) => ({
    value: String(i),
    label: tr("basicCalendar.schedule.label", {
      index: i + 1,
    }),
  }));
  const currentSchedule =
    generatedSchedules[selectedScheduleIndex] ?? generatedSchedules[0];

  const startOk =
    Boolean(timetableStartDate) &&
    !Number.isNaN(Date.parse(`${timetableStartDate}T00:00:00Z`));
  const endOk =
    Boolean(timetableEndDate) &&
    !Number.isNaN(Date.parse(`${timetableEndDate}T00:00:00Z`));
  const dateRangeOk = startOk && endOk && timetableStartDate <= timetableEndDate;

  const genErrDetails = generationError?.details ?? null;

  const handleTranscriptFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !cache) return;
    setTranscriptError(null);
    setTranscriptLoading(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const { courses: parsedCourses } = await parseTranscriptPdf(arrayBuffer);
      const inCatalogue: string[] = [];
      const indexedCodes = indices ? new Set(indices.courses.map(normalizeCourseCode)) : new Set<string>();
      for (const code of parsedCourses) {
        if (isOptCourse(normalizeCourseCode(code)) || cache.getCourse(code) || indexedCodes.has(normalizeCourseCode(code))) {
          inCatalogue.push(code);
        }
      }
      const merged = [...new Set([...completedCourses, ...inCatalogue])];
      setCompletedCourses(merged);
      clearGeneratedSchedules();
    } catch (err) {
      setTranscriptError(
        err instanceof Error
          ? err.message
          : tr("basicCalendar.transcript.parseFailed")
      );
    } finally {
      setTranscriptLoading(false);
      e.target.value = '';
    }
  };

  const handleGenerate = () => {
    setGenerating(true);
    void generateBasicSchedules({ appendFirstOnly: true })
      .then(() => {
        const newIndex = useAppStore.getState().generatedSchedules.length - 1;
        setSelectedScheduleIndex(Math.max(0, newIndex));
        morphRef.current?.animate(Math.max(0, newIndex));
      })
      .finally(() => {
        setGenerating(false);
      });
  };

  const handleDownloadIcs = () => {
    if (!currentSchedule) return;
    const ics = buildScheduleIcs({
      schedule: currentSchedule,
      cache: cache!,
      startDate: timetableStartDate,
      endDate: timetableEndDate,
    });
    const idx = (selectedScheduleIndex ?? 0) + 1;
    const filename = `uoplan-basic-schedule-${idx}-${timetableStartDate}-to-${timetableEndDate}.ics`;
    downloadTextFile(filename, ics, "text/calendar;charset=utf-8");
  };

  // Build categories for excluded select
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

  const completedCourseOptions = useMemo(() => {
    if (!cache) return [];
    return createCourseOptions(cache.getAllCourses().map((c) => c.code), cache);
  }, [cache]);

  const requiredCourseOptions = useMemo(() => {
    if (!cache) return [];
    return cache.getAllSchedules().map((sched) => {
      const course = cache.getCourse(sched.courseCode);
      if (!course) return null;
      return {
        value: course.code,
        label: `${course.code} - ${course.title}`,
      };
    }).filter((o): o is NonNullable<typeof o> => o !== null)
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [cache]);

  return (
    <Box
      component="main"
      style={{
        width: "100%",
        minHeight: isMobile ? "100vh" : 0,
        height: isMobile ? "auto" : "100dvh",
        display: "flex",
        flexDirection: "row",
        boxSizing: "border-box",
        overflow: isMobile ? "visible" : "hidden",
      }}
    >
      {isMobile && sidebarOpen && (
        <Box
          aria-hidden
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            zIndex: 199,
          }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Box
        style={{
          width: 360,
          flexShrink: 0,
          padding: "24px 20px",
          borderRight: "2px solid #2C2E33",
          backgroundColor: "#1E1E20",
          display: "flex",
          flexDirection: "column",
          gap: 24,
          minHeight: 0,
          maxHeight: "100%",
          overflowY: "auto",
          ...(isMobile
            ? {
                position: "fixed",
                top: 0,
                left: 0,
                height: "100vh",
                zIndex: 200,
                transform: sidebarOpen ? "translateX(0)" : "translateX(-100%)",
                transition: "transform 0.2s ease",
                boxShadow: sidebarOpen ? "4px 0 24px rgba(0,0,0,0.3)" : "none",
              }
            : {}),
        }}
      >
        {isMobile && (
          <Button
            variant="subtle"
            color="gray"
            size="sm"
            radius={0}
            leftSection={<IconX size={18} />}
            onClick={() => setSidebarOpen(false)}
            style={{ border: "none", alignSelf: "flex-start", marginBottom: 8 }}
          >
            {tr("basicCalendar.mobile.close")}
          </Button>
        )}

        <Title
          order={1}
          style={{
            fontFamily: '"DM Serif Display", serif',
            color: "#F8F9FA",
            marginBottom: 0,
          }}
        >
          {tr("basicCalendar.title")}
        </Title>
        <Text size="sm" style={{ color: "#ADB5BD", marginTop: -8 }}>
          {tr("basicCalendar.subtitle")}
        </Text>

        <Stack gap="md">
          <LanguageSwitcher />
          <MultiSelect
            label={tr("basicCalendar.required.label")}
            placeholder={tr("basicCalendar.required.placeholder")}
            searchable
            data={requiredCourseOptions}
            value={basicPinnedCourses}
            onChange={(v) => {
              setBasicPinnedCourses(v);
              clearGeneratedSchedules();
            }}
            filter={requiredCoursesFilter}
            radius={0}
          />

          <NumberInput
            label={tr("basicCalendar.electives.label")}
            value={basicElectivesCount}
            onChange={(v) => {
              if (typeof v !== "number" || Number.isNaN(v)) return;
              const nextCount = Math.max(0, Math.min(6, Math.trunc(v)));
              if (nextCount === basicElectivesCount) return;
              setBasicElectivesCount(nextCount);
              clearGeneratedSchedules();
            }}
            min={0}
            max={6}
            radius={0}
          />

          <MultiSelect
            label={tr("basicCalendar.exclude.label")}
            placeholder={tr("basicCalendar.exclude.placeholder")}
            searchable
            data={allCategories.map(c => ({ value: c, label: c }))}
            value={basicExcludedCategories}
            onChange={(v) => {
              setBasicExcludedCategories(v);
              clearGeneratedSchedules();
            }}
            radius={0}
          />

          <CourseFiltersCard
            levelBuckets={levelBuckets}
            languageBuckets={languageBuckets}
            electiveLevelBuckets={electiveLevelBuckets}
            includeClosedComponents={includeClosedComponents}
            showGraduateElectiveLevels
            onChangeLevelBuckets={(buckets) => {
              setLevelBuckets(buckets);
              clearGeneratedSchedules();
            }}
            onChangeLanguageBuckets={(buckets) => {
              setLanguageBuckets(buckets);
              clearGeneratedSchedules();
            }}
            onChangeElectiveLevelBuckets={(buckets) => {
              setElectiveLevelBuckets(buckets);
              clearGeneratedSchedules();
            }}
            onIncludeClosedComponentsChange={(value) => {
              setIncludeClosedComponents(value);
              clearGeneratedSchedules();
            }}
          />

          <Button
            variant="filled"
            color="violet"
            size="md"
            radius={0}
            loading={generating}
            onClick={handleGenerate}
          >
            {tr("basicCalendar.generate")}
          </Button>
        </Stack>

        {generationError && (
          <Alert
            color="red"
            variant="light"
            radius={0}
            py="xs"
            title={generationError.message}
          >
            <GenerationErrorDetailBlocks
              errorDetails={genErrDetails}
              summarizeEmptyPools={false}
            />
          </Alert>
        )}

        {generatedSchedules.length > 0 && (
          <>
            <Select
              label={tr("basicCalendar.generatedSchedules")}
              data={scheduleOptions}
              value={String(
                Math.min(selectedScheduleIndex, generatedSchedules.length - 1),
              )}
              onChange={(v) => {
                const idx = Number(v ?? 0);
                setSelectedScheduleIndex(idx);
                morphRef.current?.animate(idx);
              }}
              size="md"
              radius={0}
            />

            <Button
              size="sm"
              color="violet"
              variant="filled"
              radius={0}
              disabled={!dateRangeOk}
              onClick={handleDownloadIcs}
            >
              {tr("basicCalendar.downloadIcs")}
            </Button>
          </>
        )}

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
                clearGeneratedSchedules();
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

        <Box style={{ flex: 1, minHeight: 24 }} />

        <Button
          variant="subtle"
          color="gray"
          size="sm"
          radius={0}
          onClick={() => {
            setWizardMode(null);
            onBack();
          }}
          style={{ alignSelf: "stretch" }}
        >
          {tr("basicCalendar.changeMode")}
        </Button>
      </Box>

      {/* Calendar area */}
      <Box
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          padding: 0,
          paddingBottom: isMobile ? 72 : 0,
          width: "100%",
        }}
      >
        <CalendarView
          ref={morphRef}
          schedules={generatedSchedules}
          selectedIndex={selectedScheduleIndex}
          onSelectIndex={setSelectedScheduleIndex}
          cache={cache}
          professorRatings={professorRatings}
          getSwapCandidates={getSwapCandidates}
          onSwap={swapCourseInSchedule}
          colorMaps={scheduleColorMaps}
        />
      </Box>

      {/* Mobile bottom nav */}
      {isMobile && (
        <Box
          component="nav"
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            display: "flex",
            gap: 0,
            backgroundColor: "#1E1E20",
            borderTop: "2px solid #2C2E33",
            paddingBottom: "env(safe-area-inset-bottom, 0)",
            zIndex: 198,
          }}
        >
          <Button
            variant="subtle"
            color="gray"
            size="md"
            radius={0}
            style={{ flex: 1, border: "none", height: 56 }}
            leftSection={<IconMenu2 size={22} />}
            onClick={() => setSidebarOpen(true)}
          >
            {tr("basicCalendar.mobile.menu")}
          </Button>
        </Box>
      )}
    </Box>
  );
}
