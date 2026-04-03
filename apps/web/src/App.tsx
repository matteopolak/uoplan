import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLingui } from "@lingui/react";
import {
  Alert,
  Badge,
  Box,
  Button,
  Collapse,
  Group,
  Loader,
  Modal,
  Paper,
  Stack,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import { AnimatePresence, motion } from "framer-motion";
import { useMediaQuery } from "@mantine/hooks";
import {
  IconChevronDown,
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
import { ModeStep } from "./components/steps/ModeStep";
import { ProgramStep } from "./components/steps/ProgramStep";
import { BasicCalendarPage } from "./components/calendar/BasicCalendarPage";
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
  WizardStep,
} from "./lib/wizardSteps";
import { ScheduleCountStep } from "./components/steps/ScheduleCountStep";
import { usePersistState } from "./hooks/usePersistState";
import { useNavHistory } from "./hooks/useNavHistory";
import { useTour } from "./hooks/useTour";
import { useShareUrl } from "./hooks/useShareUrl";
import { getWizardStepContent } from "./lib/wizardStepContent";
import { LanguageSwitcher } from "./components/shared/LanguageSwitcher";
import { dynamicActivate, tr, type AppLocale } from "./i18n";

function App() {
  // Subscribe App to locale changes so all text helpers re-render.
  useLingui();

  const {
    catalogue,
    indices,
    cache,
    loading,
    error,
    terms,
    selectedTermId,
    wizardMode,
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
    virtualSectionsOnly,
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
      wizardMode: s.wizardMode,
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
      virtualSectionsOnly: s.virtualSectionsOnly,
      generationLimitFirstYearCredits: s.generationLimitFirstYearCredits,
      generationCompressedSchedule: s.generationCompressedSchedule,
    })),
  );

  const loadData = useAppStore((s) => s.loadData);
  const getShareUrl = useAppStore((s) => s.getShareUrl);
  const setWizardMode = useAppStore((s) => s.setWizardMode);
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
  const setVirtualSectionsOnly = useAppStore((s) => s.setVirtualSectionsOnly);
  const setGenerationLimitFirstYearCredits = useAppStore((s) => s.setGenerationLimitFirstYearCredits);
  const setGenerationCompressedSchedule = useAppStore((s) => s.setGenerationCompressedSchedule);
  const resetToDefault = useAppStore((s) => s.resetToDefault);

  const {
    active,
    setActive,
    replaceActive,
    showCalendar,
    setShowCalendar,
    resetNav,
    furthestStep,
  } =
    useNavHistory();
  const [generating, setGenerating] = useState(false);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [helpModalOpen, setHelpModalOpen] = useState(false);
  const [constrainOpen, setConstrainOpen] = useState(false);
  const wizardStepContent = getWizardStepContent();

  const isMobile = useMediaQuery("(max-width: 768px)");
  const prefersReducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");

  const [isLangTransitioning, setIsLangTransitioning] = useState(false);
  const handleLangSwitch = useCallback(async (locale: AppLocale) => {
    if (prefersReducedMotion) {
      await dynamicActivate(locale);
      return;
    }
    setIsLangTransitioning(true);
    await new Promise(r => setTimeout(r, 130));
    await dynamicActivate(locale);
    setIsLangTransitioning(false);
  }, [prefersReducedMotion]);

  // Use extracted hooks
  const { shareCopied, handleCopyShare } = useShareUrl(getShareUrl);

  useEffect(() => {
    void loadData();
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

  const sidebarFurthestDisplayIndex = useMemo(
    () => furthestReachedDisplayIndex(ALL_WIZARD_STEP_INDICES, furthestStep),
    [furthestStep],
  );

  useEffect(() => {
    if (effectiveActive !== active) replaceActive(effectiveActive);
  }, [active, effectiveActive, replaceActive]);

  const canProceedFromStep = (() => {
    if (effectiveActive === WizardStep.Term) return hasTerms && Boolean(selectedTermId) && Boolean(cache);
    if (effectiveActive === WizardStep.Mode) return Boolean(wizardMode);
    if (effectiveActive === WizardStep.Program) return firstYear !== null && program !== null;
    if (effectiveActive === WizardStep.Options) return !missingOptions;
    if (effectiveActive === WizardStep.Assign) return unassignedCompletedCourses.length === 0;
    return true;
  })();

  const [nextUnlockCue, setNextUnlockCue] = useState(false);
  const prevStepProgressRef = useRef<{
    step: WizardStep;
    canProceed: boolean;
  } | null>(null);

  useEffect(() => {
    let unlockCueTimer: number | null = null;
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
    if (!was.canProceed && canProceedFromStep && effectiveActive !== WizardStep.Generate) {
      unlockCueTimer = window.setTimeout(() => setNextUnlockCue(true), 0);
    }
    prevStepProgressRef.current = {
      step: effectiveActive,
      canProceed: canProceedFromStep,
    };
    return () => {
      if (unlockCueTimer !== null) window.clearTimeout(unlockCueTimer);
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
    void generateSchedules()
      .then(() => {
        setShowCalendar(true);
      })
      .finally(() => {
        setGenerating(false);
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
            {tr("app.loadingData")}
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
          <Alert color="red" title={tr("app.errorTitle")}>
            {error}
          </Alert>
        </Paper>
      </Box>
    );
  }

  const showAdvancedCalendar = showCalendar && generatedSchedules.length > 0 && wizardMode !== 'basic';
  const showBasicCalendar = wizardMode === 'basic' && active > WizardStep.Mode;

  return (
    <AnimatePresence mode="wait">
      {showAdvancedCalendar ? (
        <motion.div
          key="advanced-calendar"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3 }}
          style={{ width: "100%", minHeight: "100vh" }}
        >
          <CalendarPage
            onBack={() => {
              setShowCalendar(false);
            }}
          />
        </motion.div>
      ) : showBasicCalendar ? (
        <motion.div
          key="basic-calendar"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3 }}
          style={{ width: "100%", minHeight: "100vh" }}
        >
          <BasicCalendarPage 
            onBack={() => {
              setActive(WizardStep.Mode);
            }}
          />
        </motion.div>
      ) : (
        <motion.div
          key="wizard"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3 }}
          style={{ width: "100%", minHeight: "100vh" }}
        >
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
          setResetModalOpen(false);
        }}
      />

      <Modal
        opened={helpModalOpen}
        onClose={() => setHelpModalOpen(false)}
        title={
          wizardStepContent[effectiveActive]?.title ??
          tr("app.helpFallback")
        }
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
              {tr("app.help.whatFor")}
            </Text>
            <Text size="sm" style={{ color: "#ADB5BD", lineHeight: 1.5 }}>
              {wizardStepContent[effectiveActive]?.purpose}
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
              {tr("app.help.whatToDo")}
            </Text>
            <Text size="sm" style={{ color: "#ADB5BD", lineHeight: 1.5 }}>
              {wizardStepContent[effectiveActive]?.whatToDo}
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
          {tr("app.beta")}
        </Badge>
      </Title>

      <motion.div
        animate={{ opacity: isLangTransitioning ? 0 : 1, y: isLangTransitioning ? 4 : 0 }}
        transition={{ duration: isLangTransitioning ? 0.13 : 0.20, ease: "easeInOut" }}
        style={{ width: "100%" }}
      >
      <Box
        style={{
          width: "100%",
          maxWidth: 1200,
          margin: "0 auto",
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
            furthestActualStep={furthestStep}
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
                    {tr("app.stepHeader", {
                        current: stepDisplayIndex + 1,
                        total: visibleStepCount,
                        description: STEPS[effectiveActive]
                          .description()
                          .toUpperCase(),
                      },
                    ).toUpperCase()}
                  </Text>
                  <Group gap="xs">
                    <LanguageSwitcher onSwitch={handleLangSwitch} />
                    {indices && (
                      <Tooltip label="Copied to clipboard!" opened={shareCopied} position="bottom" withArrow color="dark">
                        <Button
                          data-tour="share"
                          variant="subtle"
                          color="gray"
                          size="xs"
                          leftSection={<IconShare size={14} />}
                          onClick={handleCopyShare}
                        >
                          {tr("app.share.action")}
                        </Button>
                      </Tooltip>
                    )}
                    <Button
                      variant="subtle"
                      color="gray"
                      size="xs"
                      leftSection={<IconHelp size={14} />}
                      onClick={() => setHelpModalOpen(true)}
                    >
                      {tr("app.help.action")}
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
                      {tr("app.tour.action")}
                    </Button>
                    <Button
                      variant="subtle"
                      color="gray"
                      size="xs"
                      leftSection={<IconRefresh size={14} />}
                      onClick={() => setResetModalOpen(true)}
                    >
                      {tr("app.reset.action")}
                    </Button>
                  </Group>
                </Group>

                {/* Step content */}
                {effectiveActive === WizardStep.Term && terms && (
                  <Stack gap="md">
                    <TermStep
                      terms={terms}
                      value={selectedTermId}
                      onChange={(termId) => {
                        void setSelectedTermId(termId);
                      }}
                    />
                  </Stack>
                )}
                {effectiveActive === WizardStep.Mode && (
                  <Stack gap="md">
                    <ModeStep
                      value={wizardMode}
                      onChange={(mode) => {
                        setWizardMode(mode);
                        if (mode === "basic") {
                          // Jump to generate basic schedules directly if desired, but they have to proceed.
                        }
                      }}
                    />
                  </Stack>
                )}
                {effectiveActive === WizardStep.Program && (
                  <Stack gap="md">
                    <ProgramStep
                      programs={programs}
                      value={program?.url ?? null}
                      onChange={setProgram}
                    />
                  </Stack>
                )}
                {effectiveActive === WizardStep.Completed && (
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
                {effectiveActive === WizardStep.Options && (
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
                {effectiveActive === WizardStep.Assign && (
                  <Stack gap="md">
                    <AssignStep
                      cache={cache}
                      remainingRequirements={remainingRequirements}
                      requirementTreeWithStatus={requirementTreeWithStatus}
                      completedRequirementsList={completedRequirementsList}
                      completedCourses={completedCourses}
                      unassignedCompletedCourses={unassignedCompletedCourses}
                      constrainedPerRequirement={constrainedPerRequirement}
                      selectedPerRequirement={selectedPerRequirement}
                      onSelect={setSelectedForRequirement}
                      selectedOptionsPerRequirement={selectedOptionsPerRequirement}
                      onSelectOption={setSelectedOptionForRequirement}
                      prereqEligibleCourses={filteredPrereqEligibleCourses}
                      includeClosedComponents={includeClosedComponents}
                      virtualSectionsOnly={virtualSectionsOnly}
                    />
                  </Stack>
                )}
                {effectiveActive === WizardStep.Generate && (
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
                      disableGenerateReason={tr(
                        "app.generate.disableReason",
                        {
                          count: unassignedCompletedCourses.length,
                          suffix:
                            unassignedCompletedCourses.length === 1 ? "" : "s",
                        },
                      )}
                      beforeGenerate={
                        <Paper
                          withBorder
                          radius={0}
                          style={{
                            backgroundColor: constrainOpen
                              ? "var(--mantine-color-dark-6)"
                              : "var(--mantine-color-dark-8)",
                          }}
                        >
                          <Group
                            justify="space-between"
                            align="center"
                            p="sm"
                            mb="xs"
                            style={{ cursor: "pointer" }}
                            onClick={() => setConstrainOpen((o) => !o)}
                          >
                            <Group gap="xs" align="center">
                              <IconChevronDown
                                size={14}
                                style={{
                                  flexShrink: 0,
                                  transform: constrainOpen ? "rotate(0deg)" : "rotate(-90deg)",
                                  transition: "transform 150ms ease",
                                }}
                              />
                              <Text fw={600} size="sm">
                                {tr("app.constraints.heading")}
                              </Text>
                            </Group>
                            <Badge size="sm" variant="light" color="violet">
                              {tr("app.constraints.optional")}
                            </Badge>
                          </Group>
                          <Collapse in={!constrainOpen}>
                            <Alert color="blue" variant="light" radius={0} mx="sm" mb="sm" style={{ border: "none" }}>
                              <Text size="sm">
                                {tr("app.constraints.description")}
                              </Text>
                            </Alert>
                          </Collapse>
                          <Collapse in={constrainOpen}>
                            <Box p="sm" pt={0}>
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
                                virtualSectionsOnly={virtualSectionsOnly}
                                onVirtualSectionsOnlyChange={setVirtualSectionsOnly}
                              />
                            </Box>
                          </Collapse>
                        </Paper>
                      }
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
                  disabled={effectiveActive === WizardStep.Term}
                  style={{ border: "none" }}
                >
                  {tr("app.nav.back")}
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
                    disabled={effectiveActive === WizardStep.Generate || !canProceedFromStep}
                  >
                    {tr("app.nav.next")}
                  </Button>
                </motion.div>
              </Group>
            </Box>
          </Box>

          {/* Footer */}
          <Box style={{ marginTop: 16, textAlign: "center" }}>
            <Text size="xs" c="dimmed">
              {typeof __BRANCH_NAME__ !== "undefined" && __BRANCH_NAME__
                ? `${__BRANCH_NAME__} `
                : ""}
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
              {" • send feedback to "}
              <Text
                component="a"
                href="mailto:admin@uoplan.party"
                span
                c="dimmed"
              >
                admin@uoplan.party
              </Text>
            </Text>
          </Box>
        </Box>

        {/* Right gutter (desktop only) */}
        {!isMobile && <Box />}
      </Box>
      </motion.div>
    </Box>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default App;
