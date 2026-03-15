import { useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Box,
  Button,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { AnimatePresence, motion } from "framer-motion";
import { useMediaQuery } from "@mantine/hooks";
import { IconHelp, IconRefresh, IconShare } from "@tabler/icons-react";
import { runTour } from "./tour";
import { useAppStore } from "./store/appStore";
import { STEPS, StepNav } from "./components/StepNav";
import { ResetModal } from "./components/ResetModal";
import { CalendarPage } from "./components/CalendarPage";
import { TermStep } from "./components/TermStep";
import { ProgramStep } from "./components/ProgramStep";
import { CompletedCoursesStep } from "./components/CompletedCoursesStep";
import { RequirementsStep } from "./components/RequirementsStep";
import { ScheduleCountStep } from "./components/ScheduleCountStep";
import { usePersistState } from "./hooks/usePersistState";
import { useNavHistory } from "./hooks/useNavHistory";

function App() {
  const {
    loadData,
    getShareUrl,
    catalogue,
    indices,
    cache,
    loading,
    error,
    terms,
    selectedTermId,
    program,
    completedCourses,
    remainingRequirements,
    requirementTreeWithStatus,
    completedRequirementsList,
    unassignedCompletedCourses,
    selectedPerRequirement,
    selectedOptionsPerRequirement,
    coursesThisSemester,
    generationMinStartMinutes,
    generationMaxEndMinutes,
    generationAllowedDays,
    generationMinProfessorRating,
    setGenerationMinProfessorRating,
    setGenerationMinStartMinutes,
    setGenerationMaxEndMinutes,
    setGenerationAllowedDays,
    generatedSchedules,
    setProgram,
    setSelectedTermId,
    setCompletedCourses,
    setSelectedForRequirement,
    setCoursesThisSemester,
    setSelectedOptionForRequirement,
    generateSchedules,
    generationError,
    filteredPrereqEligibleCourses,
    levelBuckets,
    languageBuckets,
    electiveLevelBuckets,
    setLevelBuckets,
    setLanguageBuckets,
    setElectiveLevelBuckets,
    includeClosedComponents,
    setIncludeClosedComponents,
    generationLimitFirstYearCredits,
    setGenerationLimitFirstYearCredits,
    generationCompressedSchedule,
    setGenerationCompressedSchedule,
    resetToDefault,
  } = useAppStore();

  const { active, setActive, showCalendar, setShowCalendar, resetNav } =
    useNavHistory();
  const [generating, setGenerating] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [resetModalOpen, setResetModalOpen] = useState(false);

  const isMobile = useMediaQuery("(max-width: 768px)");

  useEffect(() => {
    loadData();
  }, [loadData]);

  usePersistState(!!indices);

  useEffect(() => {
    if (loading || !indices || localStorage.getItem("uoplan-tour-done")) return;
    const t = setTimeout(() => runTour(setActive), 400);
    return () => clearTimeout(t);
  }, [loading, indices]);

  const programs = catalogue?.programs ?? [];
  const hasTerms = (terms?.length ?? 0) > 0;
  const canProceedFromStep =
    active !== 0 || (hasTerms && Boolean(selectedTermId) && Boolean(cache));

  const handleGenerate = () => {
    setGenerating(true);
    generateSchedules().then(() => {
      setGenerating(false);
      setShowCalendar(true);
    });
  };

  const uniqueSelected = new Set(Object.values(selectedPerRequirement).flat())
    .size;

  // First-year credit totals used by ScheduleCountStep.
  const completedFirstYearCredits = completedCourses.reduce((sum, code) => {
    const m = code.match(/\d{4}/);
    if (!m || Number(m[0]) >= 2000) return sum;
    return sum + (cache?.getCourse(code)?.credits ?? 3);
  }, 0);
  const selectedFirstYearCredits = [
    ...new Set(Object.values(selectedPerRequirement).flat()),
  ]
    .filter((code) => !completedCourses.includes(code))
    .reduce((sum, code) => {
      const m = code.match(/\d{4}/);
      if (!m || Number(m[0]) >= 2000) return sum;
      return sum + (cache?.getCourse(code)?.credits ?? 3);
    }, 0);
  const totalFirstYearCredits =
    completedFirstYearCredits + selectedFirstYearCredits;
  const warnFirstYearLimit = totalFirstYearCredits > 48;

  if (loading) {
    return (
      <Box
        component="main"
        style={{
          minHeight: "100vh",
          padding: "60px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Stack align="center" justify="center" gap="md">
          <Loader size="lg" color="constructBlack" />
          <Text size="sm" c="dimmed">
            Loading course data...
          </Text>
        </Stack>
      </Box>
    );
  }

  if (error) {
    return (
      <Box
        component="main"
        style={{
          minHeight: "100vh",
          padding: "60px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Paper
          withBorder
          style={{
            border: "2px solid #2C2E33",
            padding: 32,
            maxWidth: 480,
            width: "100%",
            backgroundColor: "#1E1E20",
          }}
        >
          <Alert color="red" title="Error">
            {error}
          </Alert>
        </Paper>
      </Box>
    );
  }

  if (showCalendar && generatedSchedules.length > 0) {
    return (
      <CalendarPage
        onBack={() => {
          setShowCalendar(false);
        }}
      />
    );
  }

  return (
    <Box
      component="main"
      style={{
        minHeight: "100vh",
        padding: isMobile ? "24px 16px 60px" : "40px 24px 60px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 24,
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      <ResetModal
        opened={resetModalOpen}
        onClose={() => setResetModalOpen(false)}
        onConfirm={() => {
          resetToDefault();
          resetNav();
          setResetModalOpen(false);
        }}
      />

      <Title
        order={1}
        style={{
          fontFamily: '"DM Serif Display", serif',
          color: "#F8F9FA",
          display: "flex",
          alignItems: "baseline",
          gap: 4,
        }}
      >
        uoplan.party
        <Badge color="blue" variant="light" size="sm">
          Beta
        </Badge>
      </Title>

      <Box
        style={{
          width: "100%",
          maxWidth: 1200,
          display: isMobile ? "flex" : "grid",
          flexDirection: isMobile ? "column" : undefined,
          gridTemplateColumns: isMobile
            ? undefined
            : "minmax(0, 260px) minmax(0, 1fr) minmax(0, 260px)",
          justifyContent: "center",
          gap: isMobile ? 20 : 0,
        }}
      >
        {/* Step navigation sidebar */}
        <Box
          style={{
            display: "flex",
            justifyContent: isMobile ? "flex-start" : "flex-end",
            paddingRight: isMobile ? 0 : 40,
            paddingTop: 4,
          }}
        >
          <StepNav
            active={active}
            onStepClick={setActive}
            isMobile={isMobile ?? false}
          />
        </Box>

        {/* Main wizard panel */}
        <Box style={{ minWidth: 0 }}>
          <Box
            style={{
              backgroundColor: "#1E1E20",
              ...(isMobile
                ? { border: "none", padding: 16 }
                : { border: "2px solid #2C2E33", padding: 40 }),
            }}
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={active}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                {/* Step header row */}
                <Group justify="space-between" mb={8}>
                  <Text
                    size="xs"
                    fw={500}
                    style={{
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      color: "#A6A7AB",
                    }}
                  >
                    STEP {active + 1} OF {STEPS.length} –{" "}
                    {STEPS[active].description.toUpperCase()}
                  </Text>
                  <Group gap="xs">
                    {indices && (
                      <Button
                        data-tour="share"
                        variant="subtle"
                        color="gray"
                        size="xs"
                        leftSection={<IconShare size={14} />}
                        onClick={() => {
                          const url = getShareUrl();
                          if (url && navigator.clipboard?.writeText) {
                            navigator.clipboard.writeText(url);
                            setShareCopied(true);
                            setTimeout(() => setShareCopied(false), 2000);
                          }
                        }}
                      >
                        {shareCopied ? "Link copied" : "Share"}
                      </Button>
                    )}
                    <Button
                      variant="subtle"
                      color="gray"
                      size="xs"
                      leftSection={<IconHelp size={14} />}
                      onClick={() => runTour(setActive)}
                    >
                      Tour
                    </Button>
                    <Button
                      variant="subtle"
                      color="gray"
                      size="xs"
                      leftSection={<IconRefresh size={14} />}
                      onClick={() => setResetModalOpen(true)}
                    >
                      Reset
                    </Button>
                  </Group>
                </Group>

                {/* Step content */}
                {active === 0 && terms && (
                  <Stack gap="md">
                    <TermStep
                      terms={terms}
                      value={selectedTermId}
                      onChange={setSelectedTermId}
                    />
                  </Stack>
                )}
                {active === 1 && (
                  <Stack gap="md">
                    <ProgramStep
                      programs={programs}
                      value={program?.url ?? null}
                      onChange={setProgram}
                    />
                  </Stack>
                )}
                {active === 2 && (
                  <Stack gap="md">
                    <CompletedCoursesStep
                      cache={cache}
                      remainingRequirements={remainingRequirements}
                      completedCourses={completedCourses}
                      onChange={setCompletedCourses}
                      hasProgram={!!program}
                    />
                  </Stack>
                )}
                {active === 3 && (
                  <Stack gap="md">
                    <RequirementsStep
                      cache={cache}
                      remainingRequirements={remainingRequirements}
                      requirementTreeWithStatus={requirementTreeWithStatus}
                      completedRequirementsList={completedRequirementsList}
                      completedCourses={completedCourses}
                      unassignedCompletedCourses={unassignedCompletedCourses}
                      selectedPerRequirement={selectedPerRequirement}
                      onSelect={setSelectedForRequirement}
                      selectedOptionsPerRequirement={
                        selectedOptionsPerRequirement
                      }
                      onSelectOption={setSelectedOptionForRequirement}
                      prereqEligibleCourses={filteredPrereqEligibleCourses}
                      levelBuckets={levelBuckets}
                      languageBuckets={languageBuckets}
                      onChangeLevelBuckets={setLevelBuckets}
                      onChangeLanguageBuckets={setLanguageBuckets}
                      electiveLevelBuckets={electiveLevelBuckets}
                      onChangeElectiveLevelBuckets={setElectiveLevelBuckets}
                      includeClosedComponents={includeClosedComponents}
                      onIncludeClosedComponentsChange={
                        setIncludeClosedComponents
                      }
                    />
                  </Stack>
                )}
                {active === 4 && (
                  <Stack gap="md">
                    <ScheduleCountStep
                      coursesThisSemester={coursesThisSemester}
                      onCoursesChange={setCoursesThisSemester}
                      selectedCount={uniqueSelected}
                      minStartMinutes={generationMinStartMinutes}
                      onMinStartMinutesChange={setGenerationMinStartMinutes}
                      maxEndMinutes={generationMaxEndMinutes}
                      onMaxEndMinutesChange={setGenerationMaxEndMinutes}
                      allowedDays={generationAllowedDays}
                      onAllowedDaysChange={setGenerationAllowedDays}
                      minProfessorRating={generationMinProfessorRating}
                      onMinProfessorRatingChange={
                        setGenerationMinProfessorRating
                      }
                      totalFirstYearCredits={totalFirstYearCredits}
                      warnFirstYearLimit={warnFirstYearLimit}
                      limitFirstYearCredits={generationLimitFirstYearCredits}
                      onLimitFirstYearCreditsChange={
                        setGenerationLimitFirstYearCredits
                      }
                      compressedSchedule={generationCompressedSchedule}
                      onCompressedScheduleChange={
                        setGenerationCompressedSchedule
                      }
                      onGenerate={handleGenerate}
                      generating={generating}
                      error={generationError}
                      disableGenerate={unassignedCompletedCourses.length > 0}
                      disableGenerateReason={`You still need to assign ${unassignedCompletedCourses.length} completed course${unassignedCompletedCourses.length === 1 ? "" : "s"} in Requirements before you can generate schedules.`}
                    />
                  </Stack>
                )}

                {/* Back / Next navigation */}
                <Group justify="space-between" mt={30}>
                  <Button
                    variant="subtle"
                    color="gray"
                    radius={0}
                    onClick={() =>
                      setActive((current) => Math.max(0, current - 1))
                    }
                    disabled={active === 0}
                    style={{ border: "none" }}
                  >
                    Back
                  </Button>
                  <Button
                    color="constructBlack"
                    radius={0}
                    onClick={() =>
                      setActive((current) =>
                        Math.min(STEPS.length - 1, current + 1),
                      )
                    }
                    disabled={
                      active === STEPS.length - 1 || !canProceedFromStep
                    }
                  >
                    Next
                  </Button>
                </Group>
              </motion.div>
            </AnimatePresence>
          </Box>

          {/* Footer */}
          <Box style={{ marginTop: 16, textAlign: "center" }}>
            <Text size="xs" c="dimmed">
              {typeof __COMMIT_HASH__ !== "undefined" ? __COMMIT_HASH__ : "dev"}
              {" • "}
              <Text
                component="a"
                href="https://github.com/matteopolak/uoplan"
                target="_blank"
                rel="noopener noreferrer"
                span
                c="dimmed"
              >
                github.com/matteopolak/uoplan
              </Text>
            </Text>
          </Box>
        </Box>

        {/* Right gutter (desktop only) */}
        {!isMobile && <Box />}
      </Box>
    </Box>
  );
}

export default App;
