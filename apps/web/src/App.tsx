import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Badge,
  Box,
  Button,
  Group,
  Loader,
  Modal,
  Paper,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { AnimatePresence, motion } from "framer-motion";
import { useMediaQuery } from "@mantine/hooks";
import {
  IconCompass,
  IconHelp,
  IconRefresh,
  IconShare,
} from "@tabler/icons-react";
import { runTour } from "./tour";
import { useAppStore } from "./store/appStore";
import { useShallow } from "zustand/react/shallow";
import { STEPS, StepNav } from "./components/shared/StepNav";
import { ResetModal } from "./components/shared/ResetModal";
import { CalendarPage } from "./components/calendar/CalendarPage";
import { TermStep } from "./components/steps/TermStep";
import { ProgramStep } from "./components/steps/ProgramStep";
import { CompletedCoursesStep } from "./components/steps/CompletedCoursesStep";
import { AssignStep } from "./components/requirements/AssignStep";
import { ConstrainStep } from "./components/requirements/ConstrainStep";
import { OptionsStep } from "./components/requirements/OptionsStep";
import {
  hasMissingOptionSelections,
  nodeHasOptionGroups,
} from "./components/requirements/requirementUtils";
import {
  ALL_WIZARD_STEP_INDICES,
  buildVisibleStepIndices,
  furthestReachedDisplayIndex,
  getNextStep,
  getPrevStep,
  normalizeActiveStep,
} from "./lib/wizardSteps";
import { ScheduleCountStep } from "./components/steps/ScheduleCountStep";
import { usePersistState } from "./hooks/usePersistState";
import { useNavHistory } from "./hooks/useNavHistory";
import { useTour } from "./hooks/useTour";
import { useShareUrl } from "./hooks/useShareUrl";
import { WIZARD_STEP_CONTENT } from "./lib/wizardStepContent";

function App() {
  const {
    catalogue,
    indices,
    cache,
    loading,
    error,
    terms,
    selectedTermId,
    firstYear,
    program,
    completedCourses,
    remainingRequirements,
    requirementTreeWithStatus,
    completedRequirementsList,
    unassignedCompletedCourses,
    selectedPerRequirement,
    constrainedPerRequirement,
    selectedOptionsPerRequirement,
    coursesThisSemester,
    generationMinStartMinutes,
    generationMaxEndMinutes,
    generationAllowedDays,
    generationMinProfessorRating,
    generatedSchedules,
    generationError,
    filteredPrereqEligibleCourses,
    levelBuckets,
    languageBuckets,
    electiveLevelBuckets,
    includeClosedComponents,
    generationLimitFirstYearCredits,
    generationCompressedSchedule,
  } = useAppStore(
    useShallow((s) => ({
      catalogue: s.catalogue,
      indices: s.indices,
      cache: s.cache,
      loading: s.loading,
      error: s.error,
      terms: s.terms,
      selectedTermId: s.selectedTermId,
      firstYear: s.firstYear,
      program: s.program,
      completedCourses: s.completedCourses,
      remainingRequirements: s.remainingRequirements,
      requirementTreeWithStatus: s.requirementTreeWithStatus,
      completedRequirementsList: s.completedRequirementsList,
      unassignedCompletedCourses: s.unassignedCompletedCourses,
      selectedPerRequirement: s.selectedPerRequirement,
      constrainedPerRequirement: s.constrainedPerRequirement,
      selectedOptionsPerRequirement: s.selectedOptionsPerRequirement,
      coursesThisSemester: s.coursesThisSemester,
      generationMinStartMinutes: s.generationMinStartMinutes,
      generationMaxEndMinutes: s.generationMaxEndMinutes,
      generationAllowedDays: s.generationAllowedDays,
      generationMinProfessorRating: s.generationMinProfessorRating,
      generatedSchedules: s.generatedSchedules,
      generationError: s.generationError,
      filteredPrereqEligibleCourses: s.filteredPrereqEligibleCourses,
      levelBuckets: s.levelBuckets,
      languageBuckets: s.languageBuckets,
      electiveLevelBuckets: s.electiveLevelBuckets,
      includeClosedComponents: s.includeClosedComponents,
      generationLimitFirstYearCredits: s.generationLimitFirstYearCredits,
      generationCompressedSchedule: s.generationCompressedSchedule,
    })),
  );

  const loadData = useAppStore((s) => s.loadData);
  const getShareUrl = useAppStore((s) => s.getShareUrl);
  const setProgram = useAppStore((s) => s.setProgram);
  const setSelectedTermId = useAppStore((s) => s.setSelectedTermId);
  const setCompletedCourses = useAppStore((s) => s.setCompletedCourses);
  const setSelectedForRequirement = useAppStore((s) => s.setSelectedForRequirement);
  const setConstrainedForRequirement = useAppStore((s) => s.setConstrainedForRequirement);
  const setCoursesThisSemester = useAppStore((s) => s.setCoursesThisSemester);
  const setSelectedOptionForRequirement = useAppStore((s) => s.setSelectedOptionForRequirement);
  const clearSelectedOptionForRequirement = useAppStore(
    (s) => s.clearSelectedOptionForRequirement,
  );
  const generateSchedules = useAppStore((s) => s.generateSchedules);
  const setGenerationMinProfessorRating = useAppStore((s) => s.setGenerationMinProfessorRating);
  const setGenerationMinStartMinutes = useAppStore((s) => s.setGenerationMinStartMinutes);
  const setGenerationMaxEndMinutes = useAppStore((s) => s.setGenerationMaxEndMinutes);
  const setGenerationAllowedDays = useAppStore((s) => s.setGenerationAllowedDays);
  const setLevelBuckets = useAppStore((s) => s.setLevelBuckets);
  const setLanguageBuckets = useAppStore((s) => s.setLanguageBuckets);
  const setElectiveLevelBuckets = useAppStore((s) => s.setElectiveLevelBuckets);
  const setIncludeClosedComponents = useAppStore((s) => s.setIncludeClosedComponents);
  const setGenerationLimitFirstYearCredits = useAppStore((s) => s.setGenerationLimitFirstYearCredits);
  const setGenerationCompressedSchedule = useAppStore((s) => s.setGenerationCompressedSchedule);
  const resetToDefault = useAppStore((s) => s.resetToDefault);

  const { active, setActive, replaceActive, showCalendar, setShowCalendar, resetNav } =
    useNavHistory();
  const [generating, setGenerating] = useState(false);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [helpModalOpen, setHelpModalOpen] = useState(false);

  const isMobile = useMediaQuery("(max-width: 768px)");
  const prefersReducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");

  // Use extracted hooks
  const { shareCopied, handleCopyShare } = useShareUrl(getShareUrl);

  useEffect(() => {
    loadData();
  }, [loadData]);

  usePersistState(!!indices);

  const programs = catalogue?.programs ?? [];
  const hasTerms = (terms?.length ?? 0) > 0;

  const missingOptions = useMemo(
    () => hasMissingOptionSelections(requirementTreeWithStatus, selectedOptionsPerRequirement),
    [requirementTreeWithStatus, selectedOptionsPerRequirement],
  );

  const needsOptionsStep = useMemo(
    () => requirementTreeWithStatus.some(nodeHasOptionGroups),
    [requirementTreeWithStatus],
  );

  const needsAssignStep = unassignedCompletedCourses.length > 0;

  const navVisibleStepIndices = useMemo(
    () => buildVisibleStepIndices(needsOptionsStep, needsAssignStep),
    [needsOptionsStep, needsAssignStep],
  );

  useTour(
    !loading && !!indices,
    setActive,
    needsOptionsStep,
    needsAssignStep,
  );

  const effectiveActive = useMemo(
    () => normalizeActiveStep(active, needsOptionsStep, needsAssignStep),
    [active, needsOptionsStep, needsAssignStep],
  );

  const stepDisplayIndex = Math.max(
    0,
    navVisibleStepIndices.indexOf(effectiveActive),
  );
  const visibleStepCount = navVisibleStepIndices.length;

  const [furthestActualStep, setFurthestActualStep] = useState(0);
  useEffect(() => {
    setFurthestActualStep((m) => Math.max(m, effectiveActive));
  }, [effectiveActive]);

  const sidebarFurthestDisplayIndex = useMemo(
    () => furthestReachedDisplayIndex(ALL_WIZARD_STEP_INDICES, furthestActualStep),
    [furthestActualStep],
  );

  useEffect(() => {
    if (effectiveActive !== active) replaceActive(effectiveActive);
  }, [active, effectiveActive, replaceActive]);

  const canProceedFromStep = (() => {
    if (effectiveActive === 0) return hasTerms && Boolean(selectedTermId) && Boolean(cache);
    if (effectiveActive === 1) return firstYear !== null && program !== null;
    if (effectiveActive === 3) return !missingOptions;
    if (effectiveActive === 4) return unassignedCompletedCourses.length === 0;
    return true;
  })();

  const [nextUnlockCue, setNextUnlockCue] = useState(false);
  const prevStepProgressRef = useRef<{
    step: number;
    canProceed: boolean;
  } | null>(null);

  useEffect(() => {
    if (prevStepProgressRef.current === null) {
      prevStepProgressRef.current = {
        step: effectiveActive,
        canProceed: canProceedFromStep,
      };
      return;
    }
    const was = prevStepProgressRef.current;
    if (was.step !== effectiveActive) {
      prevStepProgressRef.current = {
        step: effectiveActive,
        canProceed: canProceedFromStep,
      };
      return;
    }
    if (!was.canProceed && canProceedFromStep && effectiveActive !== 6) {
      setNextUnlockCue(true);
    }
    prevStepProgressRef.current = {
      step: effectiveActive,
      canProceed: canProceedFromStep,
    };
  }, [effectiveActive, canProceedFromStep]);

  useEffect(() => {
    if (!nextUnlockCue) return;
    const ms = prefersReducedMotion ? 700 : 650;
    const t = window.setTimeout(() => setNextUnlockCue(false), ms);
    return () => window.clearTimeout(t);
  }, [nextUnlockCue, prefersReducedMotion]);

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
        padding: isMobile ? "20px 12px 48px" : "28px 20px 48px",
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
          setFurthestActualStep(0);
          setResetModalOpen(false);
        }}
      />

      <Modal
        opened={helpModalOpen}
        onClose={() => setHelpModalOpen(false)}
        title={WIZARD_STEP_CONTENT[effectiveActive]?.title ?? "Help"}
        centered
        radius={0}
        styles={{
          header: {
            backgroundColor: "#1E1E20",
            borderBottom: "1px solid #2C2E33",
          },
          body: { backgroundColor: "#1E1E20" },
          title: { color: "#F8F9FA", fontWeight: 600 },
        }}
      >
        <Stack gap="md">
          <Box>
            <Text
              size="xs"
              fw={600}
              tt="uppercase"
              style={{ letterSpacing: "0.08em", color: "#868E96" }}
              mb={6}
            >
              What this step is for
            </Text>
            <Text size="sm" style={{ color: "#ADB5BD", lineHeight: 1.5 }}>
              {WIZARD_STEP_CONTENT[effectiveActive]?.purpose}
            </Text>
          </Box>
          <Box>
            <Text
              size="xs"
              fw={600}
              tt="uppercase"
              style={{ letterSpacing: "0.08em", color: "#868E96" }}
              mb={6}
            >
              What you should do
            </Text>
            <Text size="sm" style={{ color: "#ADB5BD", lineHeight: 1.5 }}>
              {WIZARD_STEP_CONTENT[effectiveActive]?.whatToDo}
            </Text>
          </Box>
        </Stack>
      </Modal>

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
            paddingRight: isMobile ? 0 : 28,
            paddingTop: 4,
          }}
        >
          <StepNav
            visibleStepIndices={ALL_WIZARD_STEP_INDICES}
            active={effectiveActive}
            furthestDisplayIndex={sidebarFurthestDisplayIndex}
            furthestActualStep={furthestActualStep}
            needsOptionsStep={needsOptionsStep}
            needsAssignStep={needsAssignStep}
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
                ? { border: "none", padding: 12 }
                : { border: "2px solid #2C2E33", padding: 24 }),
            }}
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={effectiveActive}
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
                    STEP {stepDisplayIndex + 1} OF {visibleStepCount} –{" "}
                    {STEPS[effectiveActive].description.toUpperCase()}
                  </Text>
                  <Group gap="xs">
                    {indices && (
                      <Button
                        data-tour="share"
                        variant="subtle"
                        color="gray"
                        size="xs"
                        leftSection={<IconShare size={14} />}
                        onClick={handleCopyShare}
                      >
                        {shareCopied ? "Link copied" : "Share"}
                      </Button>
                    )}
                    <Button
                      variant="subtle"
                      color="gray"
                      size="xs"
                      leftSection={<IconHelp size={14} />}
                      onClick={() => setHelpModalOpen(true)}
                    >
                      Help
                    </Button>
                    <Button
                      variant="subtle"
                      color="gray"
                      size="xs"
                      leftSection={<IconCompass size={14} />}
                      onClick={() =>
                        runTour(setActive, navVisibleStepIndices)
                      }
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
                {effectiveActive === 0 && terms && (
                  <Stack gap="md">
                    <TermStep
                      terms={terms}
                      value={selectedTermId}
                      onChange={setSelectedTermId}
                    />
                  </Stack>
                )}
                {effectiveActive === 1 && (
                  <Stack gap="md">
                    <ProgramStep
                      programs={programs}
                      value={program?.url ?? null}
                      onChange={setProgram}
                    />
                  </Stack>
                )}
                {effectiveActive === 2 && (
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
                {effectiveActive === 3 && (
                  <Stack gap="md">
                    <OptionsStep
                      requirementTreeWithStatus={requirementTreeWithStatus}
                      completedCourses={completedCourses}
                      selectedOptionsPerRequirement={selectedOptionsPerRequirement}
                      onSelectOption={setSelectedOptionForRequirement}
                      onClearOption={clearSelectedOptionForRequirement}
                    />
                  </Stack>
                )}
                {effectiveActive === 4 && (
                  <Stack gap="md">
                    <AssignStep
                      cache={cache}
                      remainingRequirements={remainingRequirements}
                      requirementTreeWithStatus={requirementTreeWithStatus}
                      completedRequirementsList={completedRequirementsList}
                      completedCourses={completedCourses}
                      unassignedCompletedCourses={unassignedCompletedCourses}
                      selectedPerRequirement={selectedPerRequirement}
                      onSelect={setSelectedForRequirement}
                      selectedOptionsPerRequirement={selectedOptionsPerRequirement}
                      onSelectOption={setSelectedOptionForRequirement}
                      prereqEligibleCourses={filteredPrereqEligibleCourses}
                    />
                  </Stack>
                )}
                {effectiveActive === 5 && (
                  <Stack gap="md">
                    <ConstrainStep
                      cache={cache}
                      remainingRequirements={remainingRequirements}
                      requirementTreeWithStatus={requirementTreeWithStatus}
                      completedRequirementsList={completedRequirementsList}
                      completedCourses={completedCourses}
                      selectedPerRequirement={selectedPerRequirement}
                      constrainedPerRequirement={constrainedPerRequirement}
                      onConstrain={setConstrainedForRequirement}
                      selectedOptionsPerRequirement={selectedOptionsPerRequirement}
                      onSelectOption={setSelectedOptionForRequirement}
                      prereqEligibleCourses={filteredPrereqEligibleCourses}
                      levelBuckets={levelBuckets}
                      languageBuckets={languageBuckets}
                      onChangeLevelBuckets={setLevelBuckets}
                      onChangeLanguageBuckets={setLanguageBuckets}
                      electiveLevelBuckets={electiveLevelBuckets}
                      onChangeElectiveLevelBuckets={setElectiveLevelBuckets}
                      includeClosedComponents={includeClosedComponents}
                      onIncludeClosedComponentsChange={setIncludeClosedComponents}
                    />
                  </Stack>
                )}
                {effectiveActive === 6 && (
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
                      error={generationError?.message ?? null}
                      errorDetails={generationError?.details ?? null}
                      disableGenerate={unassignedCompletedCourses.length > 0}
                      disableGenerateReason={`You still need to assign ${unassignedCompletedCourses.length} completed course${unassignedCompletedCourses.length === 1 ? "" : "s"} in Requirements before you can generate schedules.`}
                    />
                  </Stack>
                )}
              </motion.div>
            </AnimatePresence>

            {/* Outside motion.div so position:sticky works (transform breaks sticky). */}
            <Box
              style={{
                position: "sticky",
                bottom: 0,
                zIndex: 10,
                marginTop: 24,
                marginLeft: isMobile ? -12 : -24,
                marginRight: isMobile ? -12 : -24,
                paddingInline: isMobile ? 12 : 24,
                paddingTop: 16,
                paddingBottom: "max(12px, env(safe-area-inset-bottom))",
                backgroundColor: "#1E1E20",
                borderTop: "1px solid #2C2E33",
              }}
            >
              <Group justify="space-between">
                <Button
                  variant="subtle"
                  color="gray"
                  radius={0}
                  onClick={() =>
                    setActive(
                      getPrevStep(
                        effectiveActive,
                        needsOptionsStep,
                        needsAssignStep,
                      ),
                    )
                  }
                  disabled={effectiveActive === 0}
                  style={{ border: "none" }}
                >
                  Back
                </Button>
                <motion.div
                  style={{ display: "inline-block" }}
                  animate={
                    nextUnlockCue && !prefersReducedMotion
                      ? { x: [0, -6, 6, -5, 5, -3, 3, 0] }
                      : { x: 0 }
                  }
                  transition={{ duration: 0.45, ease: "easeInOut" }}
                >
                  <Button
                    color={nextUnlockCue ? "violet" : "constructBlack"}
                    radius={0}
                    onClick={() =>
                      setActive(
                        getNextStep(
                          effectiveActive,
                          needsOptionsStep,
                          needsAssignStep,
                        ),
                      )
                    }
                    disabled={effectiveActive === 6 || !canProceedFromStep}
                  >
                    Next
                  </Button>
                </motion.div>
              </Group>
            </Box>
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
