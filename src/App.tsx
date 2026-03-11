import { useEffect, useRef, useState } from 'react';
import { Box, Stack, Title, Alert, Loader, Text, Paper, Group, Button, Select, TextInput, Modal, Textarea } from '@mantine/core';
import { AnimatePresence, motion } from 'framer-motion';
import { useMediaQuery } from '@mantine/hooks';
import { IconArrowBackUp, IconArrowLeft, IconCheck, IconHelp, IconMenu2, IconRefresh, IconShare, IconX } from '@tabler/icons-react';
import 'driver.js/dist/driver.css';
import { runTour } from './tour';
import { useAppStore } from './store/appStore';
import { TermStep } from './components/TermStep';
import { ProgramStep } from './components/ProgramStep';
import { CompletedCoursesStep } from './components/CompletedCoursesStep';
import { RequirementsStep } from './components/RequirementsStep';
import { ScheduleCountStep } from './components/ScheduleCountStep';
import { CalendarView } from './components/CalendarView';
import { buildScheduleIcs, downloadTextFile } from './lib/ics';

const STEPS = [
  { label: 'Term', description: 'Choose term' },
  { label: 'Program', description: 'Choose your program' },
  { label: 'Completed', description: 'Mark completed courses' },
  { label: 'Requirements', description: 'Select courses' },
  { label: 'Generate', description: 'Choose count and generate' },
] as const;

function formatBuildVersion(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'vunknown';
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `v${yyyy}${mm}${dd}-${hh}${min}`;
}

function App() {
  const {
    loadData,
    getShareUrl,
    getEncodedStateBase64,
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
    setGenerationMinStartMinutes,
    setGenerationMaxEndMinutes,
    setGenerationAllowedDays,
    generatedSchedules,
    selectedScheduleIndex,
    setProgram,
    setSelectedTermId,
    setCompletedCourses,
    setSelectedForRequirement,
    setCoursesThisSemester,
    setSelectedOptionForRequirement,
    generateSchedules,
    setSelectedScheduleIndex,
    swapCourseInSchedule,
    undoLastSwap,
    getSwapCandidates,
    swapHistory,
    generationError,
    filteredPrereqEligibleCourses,
    levelBuckets,
    languageBuckets,
    electiveLevelBuckets,
    setLevelBuckets,
    setLanguageBuckets,
    setElectiveLevelBuckets,
    resetToDefault,
  } = useAppStore();

  const [active, setActive] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [generatingOneMore, setGeneratingOneMore] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [timetableStartDate, setTimetableStartDate] = useState<string>('');
  const [timetableEndDate, setTimetableEndDate] = useState<string>('');
  const [shareCopied, setShareCopied] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const persistTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMobile = useMediaQuery('(max-width: 768px)');
  const generateStepIndex = Math.max(
    0,
    STEPS.findIndex((s) => s.label === 'Generate'),
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!indices) return;
    const save = () => {
      const base64 = getEncodedStateBase64();
      if (base64) localStorage.setItem('uoplan-state', base64);
    };
    const scheduleSave = () => {
      if (persistTimeoutRef.current) clearTimeout(persistTimeoutRef.current);
      persistTimeoutRef.current = setTimeout(save, 400);
    };
    const unsub = useAppStore.subscribe(scheduleSave);
    return () => {
      unsub();
      if (persistTimeoutRef.current) clearTimeout(persistTimeoutRef.current);
    };
  }, [indices, getEncodedStateBase64]);

  useEffect(() => {
    if (loading || !indices || localStorage.getItem('uoplan-tour-done')) return;
    const t = setTimeout(() => runTour(setActive), 400);
    return () => clearTimeout(t);
  }, [loading, indices]);

  const programs = catalogue?.programs ?? [];
  const hasTerms = (terms?.length ?? 0) > 0;
  const canProceedFromStep =
    active !== 0 || (hasTerms && Boolean(selectedTermId) && Boolean(cache));

  const handleGenerate = () => {
    setGenerating(true);
    setTimeout(() => {
      generateSchedules();
      setGenerating(false);
      setShowCalendar(true);
    }, 0);
  };

  const uniqueSelected = new Set(Object.values(selectedPerRequirement).flat()).size;

  useEffect(() => {
    if (!showCalendar || generatedSchedules.length === 0) return;
    const currentSchedule = generatedSchedules[selectedScheduleIndex] ?? generatedSchedules[0];

    let minStart: string | null = null;
    let maxEnd: string | null = null;

    for (const enrollment of currentSchedule.enrollments) {
      for (const { section } of Object.values(enrollment.sectionCombo)) {
        const md = section.meetingDates;
        if (!md || md.length < 2) continue;
        const start = md[0];
        const end = md[1];
        if (start && (!minStart || start < minStart)) minStart = start;
        if (end && (!maxEnd || end > maxEnd)) maxEnd = end;
      }
    }

    if (!timetableStartDate && minStart) setTimetableStartDate(minStart);
    if (!timetableEndDate && maxEnd) setTimetableEndDate(maxEnd);
  }, [generatedSchedules, selectedScheduleIndex, showCalendar, timetableEndDate, timetableStartDate]);

  const startOk =
    Boolean(timetableStartDate) &&
    !Number.isNaN(Date.parse(`${timetableStartDate}T00:00:00Z`));
  const endOk =
    Boolean(timetableEndDate) &&
    !Number.isNaN(Date.parse(`${timetableEndDate}T00:00:00Z`));
  const dateRangeOk = startOk && endOk && timetableStartDate <= timetableEndDate;

  if (loading) {
    return (
      <Box
        component="main"
        style={{
          minHeight: '100vh',
          padding: '60px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
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
          minHeight: '100vh',
          padding: '60px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Paper
          withBorder
          style={{
            border: '2px solid #2C2E33',
            padding: 32,
            maxWidth: 480,
            width: '100%',
            backgroundColor: '#1E1E20',
          }}
        >
          <Alert color="red" title="Error">
            {error}
          </Alert>
        </Paper>
      </Box>
    );
  }

  const StepList = () => {
    const stepItem = (step: (typeof STEPS)[number], idx: number) => {
      const isActive = idx === active;
      const isComplete = idx < active;
      return (
        <Box
          key={step.label}
          style={{
            display: 'flex',
            flexDirection: isMobile ? 'column' : 'row',
            alignItems: isMobile ? 'center' : 'flex-start',
            gap: 10,
            paddingBottom: !isMobile && idx < STEPS.length - 1 ? 16 : 0,
            cursor: idx < active ? 'pointer' : 'default',
            position: 'relative',
            zIndex: 1,
          }}
          onClick={() => {
            if (idx < active) setActive(idx);
          }}
        >
          <Box
            style={{
              width: 20,
              height: 20,
              flexShrink: 0,
              borderRadius: '50%',
              border: `2px solid ${isActive ? '#B197FC' : isComplete ? '#2F9E44' : '#2C2E33'}`,
              backgroundColor: isComplete ? '#2F9E44' : '#141517',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginTop: isMobile ? 0 : 1,
            }}
          >
            {isComplete && <IconCheck size={11} color="#fff" />}
            {isActive && !isComplete && (
              <Box
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: '#B197FC',
                }}
              />
            )}
          </Box>
          <Group gap={6} wrap="nowrap" align="center" style={{ paddingTop: isMobile ? 4 : 1 }}>
            <Text
              size="xs"
              fw={isActive ? 600 : 400}
              style={{
                color: isActive ? '#F8F9FA' : isComplete ? '#A6A7AB' : '#868E96',
                lineHeight: 1.3,
              }}
            >
              {step.label}
            </Text>
          </Group>
        </Box>
      );
    };
    if (isMobile) {
      return (
        <Box style={{ width: '100%' }}>
          <Text
            size="xs"
            fw={500}
            mb={10}
            style={{
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: '#A6A7AB',
            }}
          >
            Steps
          </Text>
          <Box style={{ position: 'relative', width: '100%' }}>
            {STEPS.length > 1 && (
              <Box
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: 10,
                  height: 1,
                  backgroundColor: '#2C2E33',
                  zIndex: 0,
                }}
              />
            )}
            <Group gap="md" wrap="nowrap" style={{ justifyContent: 'space-between', width: '100%', position: 'relative', zIndex: 1 }}>
              {STEPS.map((step, idx) => stepItem(step, idx))}
            </Group>
          </Box>
        </Box>
      );
    }
    return (
      <Box>
        <Text
          size="xs"
          fw={500}
          mb={14}
          style={{
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: '#A6A7AB',
          }}
        >
          Steps
        </Text>
        <Box style={{ position: 'relative' }}>
          {STEPS.length > 1 && (
            <Box
              style={{
                position: 'absolute',
                left: 9,
                top: 10,
                bottom: 10,
                width: 1,
                backgroundColor: '#2C2E33',
                zIndex: 0,
              }}
            />
          )}
          <Stack gap={0}>{STEPS.map((step, idx) => stepItem(step, idx))}</Stack>
        </Box>
      </Box>
    );
  };

  const resetConfirmModal = (
    <Modal
      opened={resetModalOpen}
      onClose={() => setResetModalOpen(false)}
      title="Reset planner?"
      size="sm"
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          This will clear your program, completed courses, requirement selections, and generated
          schedules. You cannot undo this.
        </Text>
        <Group justify="flex-end" gap="xs">
          <Button variant="default" onClick={() => setResetModalOpen(false)}>
            Cancel
          </Button>
          <Button
            color="red"
            variant="filled"
            onClick={() => {
              resetToDefault();
              setShowCalendar(false);
              setActive(0);
              setResetModalOpen(false);
            }}
          >
            Reset
          </Button>
        </Group>
      </Stack>
    </Modal>
  );

  if (showCalendar && generatedSchedules.length > 0) {
    const scheduleOptions = generatedSchedules.map((_, i) => ({
      value: String(i),
      label: `Schedule #${i + 1}`,
    }));
    const currentSchedule = generatedSchedules[selectedScheduleIndex] ?? generatedSchedules[0];
    const eventCount = currentSchedule.enrollments.reduce(
      (sum, e) => sum + e.times.length,
      0
    );

    return (
      <Box
        component="main"
        style={{
          width: '100%',
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'row',
          boxSizing: 'border-box',
        }}
      >
        {isMobile && sidebarOpen && (
          <Box
            aria-hidden
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.5)',
              zIndex: 199,
            }}
            onClick={() => setSidebarOpen(false)}
          />
        )}
        <Box
          style={{
            width: 320,
            flexShrink: 0,
            padding: '24px 20px',
            borderRight: '2px solid #2C2E33',
            backgroundColor: '#1E1E20',
            display: 'flex',
            flexDirection: 'column',
            gap: 24,
            overflowY: 'auto',
            ...(isMobile
              ? {
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  height: '100vh',
                  zIndex: 200,
                  transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
                  transition: 'transform 0.2s ease',
                  boxShadow: sidebarOpen ? '4px 0 24px rgba(0,0,0,0.3)' : 'none',
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
              style={{ border: 'none', alignSelf: 'flex-start', marginBottom: 8 }}
            >
              Close
            </Button>
          )}
          <Title
            order={1}
            style={{ fontFamily: '"DM Serif Display", serif', color: '#F8F9FA', marginBottom: 0 }}
          >
            Your weekly timetable
          </Title>
          <Text size="sm" style={{ color: '#ADB5BD', marginTop: -8 }}>
            Review your generated schedules. Click a block to swap courses.
          </Text>
          {swapHistory.length > 0 && (
            <Button
              variant="light"
              color="gray"
              size="sm"
              radius="sm"
              leftSection={<IconArrowBackUp size={14} />}
              onClick={() => undoLastSwap()}
            >
              {swapHistory.length === 1 ? 'Undo swap' : `Undo swap (${swapHistory.length})`}
            </Button>
          )}
          <Group gap="xs">
            {indices && (
              <Button
                variant="filled"
                color="dark"
                size="sm"
                radius="sm"
                leftSection={<IconShare size={14} />}
                onClick={() => setShareModalOpen(true)}
                style={{ backgroundColor: '#141517' }}
              >
                Share
              </Button>
            )}
            <Button
              variant="filled"
              color="dark"
              size="sm"
              radius="sm"
              leftSection={<IconRefresh size={14} />}
              onClick={() => setResetModalOpen(true)}
              style={{ backgroundColor: '#141517' }}
            >
              Reset
            </Button>
          </Group>
          {resetConfirmModal}
          <Select
            label="Schedule"
            data={scheduleOptions}
            value={String(Math.min(selectedScheduleIndex, generatedSchedules.length - 1))}
            onChange={(v) => setSelectedScheduleIndex(Number(v ?? 0))}
            size="md"
            radius="sm"
          />
          <Button
            variant="light"
            color="violet"
            size="sm"
            radius="sm"
            loading={generatingOneMore}
            disabled={generatingOneMore}
            onClick={() => {
              setGeneratingOneMore(true);
              setTimeout(() => {
                generateSchedules({ appendFirstOnly: true });
                setGeneratingOneMore(false);
              }, 0);
            }}
          >
            Generate new schedule
          </Button>
          {generationError && (
            <Alert color="red" variant="light" radius="sm" py="xs">
              {generationError}
            </Alert>
          )}
          <Button
            size="sm"
            color="violet"
            variant="filled"
            radius="sm"
            disabled={!dateRangeOk}
            onClick={() => {
              const ics = buildScheduleIcs({
                schedule: currentSchedule,
                cache,
                startDate: timetableStartDate,
                endDate: timetableEndDate,
              });
              const idx = (selectedScheduleIndex ?? 0) + 1;
              const filename = `uoplan-schedule-${idx}-${timetableStartDate}-to-${timetableEndDate}.ics`;
              downloadTextFile(filename, ics, 'text/calendar;charset=utf-8');
            }}
          >
            Download ICS
          </Button>
          <Stack gap={0}>
            <Text size="sm" c="dimmed">
              {generatedSchedules.length} total · click a block to swap
            </Text>
            <Text size="xs" c="dimmed">
              Showing {eventCount} course block{eventCount === 1 ? '' : 's'} this week
            </Text>
          </Stack>
          <Box style={{ flex: 1, minHeight: 24 }} />
          <Button
            variant="filled"
            color="dark"
            size="sm"
            radius="sm"
            onClick={() => {
              setShowCalendar(false);
              setActive(generateStepIndex);
            }}
            style={{ backgroundColor: '#141517', alignSelf: 'stretch' }}
          >
            Back to setup
          </Button>
          <Modal
            opened={shareModalOpen}
            onClose={() => setShareModalOpen(false)}
            title="Share timetable state"
            size="md"
          >
            <Stack gap="md">
              <Text size="sm" c="dimmed">
                Share this URL to let others load your program, completed courses, and selections. The code is the state embedded in the URL.
              </Text>
              <TextInput
                label="URL"
                value={getShareUrl() ?? ''}
                readOnly
                size="sm"
              />
              <Textarea
                label="State code"
                value={getEncodedStateBase64() ?? ''}
                readOnly
                minRows={3}
                size="sm"
              />
              <Button
                variant="filled"
                onClick={() => {
                  const url = getShareUrl();
                  if (url && navigator.clipboard?.writeText) {
                    navigator.clipboard.writeText(url);
                    setShareCopied(true);
                    setTimeout(() => setShareCopied(false), 2000);
                  }
                }}
              >
                {shareCopied ? 'Copied to clipboard' : 'Copy shareable link'}
              </Button>
            </Stack>
          </Modal>
        </Box>
        <Box
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            padding: isMobile ? 0 : 24,
            paddingBottom: isMobile ? 72 : 24,
            width: '100%',
            maxWidth: 1200,
          }}
        >
          <CalendarView
            schedules={generatedSchedules}
            selectedIndex={selectedScheduleIndex}
            onSelectIndex={setSelectedScheduleIndex}
            cache={cache}
            getSwapCandidates={getSwapCandidates}
            onSwap={swapCourseInSchedule}
          />
        </Box>
        {isMobile && (
          <Box
            component="nav"
            style={{
              position: 'fixed',
              bottom: 0,
              left: 0,
              right: 0,
              display: 'flex',
              gap: 0,
              backgroundColor: '#1E1E20',
              borderTop: '2px solid #2C2E33',
              paddingBottom: 'env(safe-area-inset-bottom, 0)',
              zIndex: 198,
            }}
          >
            <Button
              variant="subtle"
              color="gray"
              size="md"
              radius={0}
              style={{ flex: 1, border: 'none', height: 56 }}
              leftSection={<IconMenu2 size={22} />}
              onClick={() => setSidebarOpen(true)}
            >
              Menu
            </Button>
            <Button
              variant="subtle"
              color="gray"
              size="md"
              radius={0}
              style={{ flex: 1, border: 'none', height: 56 }}
              leftSection={<IconArrowLeft size={22} />}
              onClick={() => {
                setShowCalendar(false);
                setActive(generateStepIndex);
              }}
            >
              Back
            </Button>
          </Box>
        )}
      </Box>
    );
  }

  return (
    <Box
      component="main"
      style={{
        minHeight: '100vh',
        padding: isMobile ? '24px 16px 60px' : '40px 24px 60px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 24,
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      {resetConfirmModal}
      <Title
        order={1}
        style={{ fontFamily: '"DM Serif Display", serif', color: '#F8F9FA' }}
      >
        uoplan.party
      </Title>

      <Box
        style={{
          width: '100%',
          maxWidth: 1200,
          display: isMobile ? 'flex' : 'grid',
          flexDirection: isMobile ? 'column' : undefined,
          gridTemplateColumns: isMobile ? undefined : 'minmax(0, 260px) minmax(0, 1fr) minmax(0, 260px)',
          justifyContent: 'center',
          gap: isMobile ? 20 : 0,
        }}
      >
        <Box
          style={{
            display: 'flex',
            justifyContent: isMobile ? 'flex-start' : 'flex-end',
            paddingRight: isMobile ? 0 : 40,
            paddingTop: 4,
          }}
        >
          <StepList />
        </Box>

        <Box style={{ minWidth: 0 }}>
          <Box
            style={{
              backgroundColor: '#1E1E20',
              ...(isMobile
                ? { border: 'none', padding: 16 }
                : { border: '2px solid #2C2E33', padding: 40 }),
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
                <Group justify="space-between" mb={8}>
                  <Text
                    size="xs"
                    fw={500}
                    style={{
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      color: '#A6A7AB',
                    }}
                  >
                    STEP {active + 1} OF {STEPS.length} –{' '}
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
                        {shareCopied ? 'Link copied' : 'Share'}
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

                {active === 0 && (
                  <Stack gap="md">
                    {terms && (
                      <TermStep
                        terms={terms}
                        value={selectedTermId}
                        onChange={(termId) => {
                          setSelectedTermId(termId);
                        }}
                      />
                    )}
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
                      selectedOptionsPerRequirement={selectedOptionsPerRequirement}
                      onSelectOption={setSelectedOptionForRequirement}
                      prereqEligibleCourses={filteredPrereqEligibleCourses}
                      levelBuckets={levelBuckets}
                      languageBuckets={languageBuckets}
                      onChangeLevelBuckets={setLevelBuckets}
                      onChangeLanguageBuckets={setLanguageBuckets}
                      electiveLevelBuckets={electiveLevelBuckets}
                      onChangeElectiveLevelBuckets={setElectiveLevelBuckets}
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
                      onGenerate={handleGenerate}
                      generating={generating}
                      error={generationError}
                      disableGenerate={unassignedCompletedCourses.length > 0}
                      disableGenerateReason={`You still need to assign ${unassignedCompletedCourses.length} completed course${unassignedCompletedCourses.length === 1 ? '' : 's'} in Requirements before you can generate schedules.`}
                    />
                  </Stack>
                )}

                <Group justify="space-between" mt={30}>
                  <Button
                    variant="subtle"
                    color="gray"
                    radius={0}
                    onClick={() => setActive((current) => Math.max(0, current - 1))}
                    disabled={active === 0}
                    style={{ border: 'none' }}
                  >
                    Back
                  </Button>
                  <Button
                    color="constructBlack"
                    radius={0}
                    onClick={() => setActive((current) => Math.min(STEPS.length - 1, current + 1))}
                    disabled={active === STEPS.length - 1 || !canProceedFromStep}
                  >
                    Next
                  </Button>
                </Group>
              </motion.div>
            </AnimatePresence>
          </Box>
          <Box style={{ marginTop: 16, textAlign: 'center' }}>
            <Text size="xs" c="dimmed">
              {typeof __BUILD_TIME__ !== 'undefined' ? formatBuildVersion(__BUILD_TIME__) : 'vdev'}{' '}
              <Text span c="dimmed">
                •{' '}
              </Text>
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

        {!isMobile && <Box />}
      </Box>
    </Box>
  );
}

export default App;
