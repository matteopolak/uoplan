import { useEffect, useRef, useState } from 'react';
import { Box, Stack, Title, Alert, Loader, Text, Paper, Group, Button, Select, TextInput, Modal, Textarea } from '@mantine/core';
import { AnimatePresence, motion } from 'framer-motion';
import { IconCheck, IconRefresh, IconShare } from '@tabler/icons-react';
import { useAppStore } from './store/appStore';
import { ProgramStep } from './components/ProgramStep';
import { CompletedCoursesStep } from './components/CompletedCoursesStep';
import { RequirementsStep } from './components/RequirementsStep';
import { ScheduleCountStep } from './components/ScheduleCountStep';
import { CalendarView } from './components/CalendarView';
import { buildScheduleIcs, downloadTextFile } from './lib/ics';

const STEPS = [
  { label: 'Program', description: 'Choose your program' },
  { label: 'Completed', description: 'Mark completed courses' },
  { label: 'Requirements', description: 'Select courses' },
  { label: 'Generate', description: 'Choose count and generate' },
] as const;

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
    program,
    completedCourses,
    remainingRequirements,
    requirementTreeWithStatus,
    completedRequirementsList,
    unassignedCompletedCourses,
    selectedPerRequirement,
    selectedOptionsPerRequirement,
    coursesThisSemester,
    generatedSchedules,
    selectedScheduleIndex,
    setProgram,
    setCompletedCourses,
    setSelectedForRequirement,
    setCoursesThisSemester,
    setSelectedOptionForRequirement,
    generateSchedules,
    setSelectedScheduleIndex,
    swapCourseInSchedule,
    getSwapCandidates,
    generationError,
    prereqEligibleCourses,
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
  const [showCalendar, setShowCalendar] = useState(false);
  const [timetableStartDate, setTimetableStartDate] = useState<string>('');
  const [timetableEndDate, setTimetableEndDate] = useState<string>('');
  const [shareCopied, setShareCopied] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const persistTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!indices) return;
    const save = () => {
      const base64 = getEncodedStateBase64();
      if (base64) localStorage.setItem('uschedule-state', base64);
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

  const programs = catalogue?.programs ?? [];

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

  const StepList = () => (
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
        <Stack gap={0}>
          {STEPS.map((step, idx) => {
            const isActive = idx === active;
            const isComplete = idx < active;

            return (
              <Box
                key={step.label}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  paddingBottom: idx < STEPS.length - 1 ? 16 : 0,
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
                    marginTop: 1,
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

                <Group gap={6} wrap="nowrap" align="center" style={{ paddingTop: 1 }}>
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
          })}
        </Stack>
      </Box>
    </Box>
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
        <Box
          style={{
            width: 260,
            flexShrink: 0,
            padding: '24px 20px',
            borderRight: '2px solid #2C2E33',
            backgroundColor: '#1E1E20',
            display: 'flex',
            flexDirection: 'column',
            gap: 24,
          }}
        >
          <Title
            order={1}
            style={{ fontFamily: '"DM Serif Display", serif', color: '#F8F9FA', marginBottom: 0 }}
          >
            Your weekly timetable
          </Title>
          <Text size="sm" style={{ color: '#ADB5BD', marginTop: -8 }}>
            Review your generated schedules. Click a block to swap courses.
          </Text>
          <Button
            variant="subtle"
            color="gray"
            size="sm"
            radius={0}
            onClick={() => {
              setShowCalendar(false);
              setActive(3);
            }}
            style={{ border: 'none', alignSelf: 'flex-start' }}
          >
            Back to setup
          </Button>
          <Group gap="xs">
            {indices && (
              <Button
                variant="subtle"
                color="gray"
                size="sm"
                radius={0}
                leftSection={<IconShare size={14} />}
                onClick={() => setShareModalOpen(true)}
                style={{ border: 'none', alignSelf: 'flex-start' }}
              >
                Share
              </Button>
            )}
            <Button
              variant="subtle"
              color="gray"
              size="sm"
              radius={0}
              leftSection={<IconRefresh size={14} />}
              onClick={() => {
                resetToDefault();
                setShowCalendar(false);
                setActive(0);
              }}
              style={{ border: 'none', alignSelf: 'flex-start' }}
            >
              Reset
            </Button>
          </Group>
          <Select
            label="Schedule"
            data={scheduleOptions}
            value={String(Math.min(selectedScheduleIndex, generatedSchedules.length - 1))}
            onChange={(v) => setSelectedScheduleIndex(Number(v ?? 0))}
            size="md"
            radius="sm"
          />
          <Stack gap="xs">
            <TextInput
              label="Start date"
              type="date"
              value={timetableStartDate}
              onChange={(e) => setTimetableStartDate(e.currentTarget.value)}
              size="sm"
              radius="sm"
            />
            <TextInput
              label="End date"
              type="date"
              value={timetableEndDate}
              onChange={(e) => setTimetableEndDate(e.currentTarget.value)}
              size="sm"
              radius="sm"
            />
            <Button
              size="sm"
              color="violet"
              variant="filled"
              radius={0}
              style={{ border: '2px solid black' }}
              disabled={!dateRangeOk}
              onClick={() => {
                const ics = buildScheduleIcs({
                  schedule: currentSchedule,
                  cache,
                  startDate: timetableStartDate,
                  endDate: timetableEndDate,
                });
                const idx = (selectedScheduleIndex ?? 0) + 1;
                const filename = `uschedule-schedule-${idx}-${timetableStartDate}-to-${timetableEndDate}.ics`;
                downloadTextFile(filename, ics, 'text/calendar;charset=utf-8');
              }}
            >
              Download iCalendar (.ics)
            </Button>
            {!dateRangeOk && (
              <Text size="xs" c="dimmed">
                Choose a valid date range to enable export.
              </Text>
            )}
          </Stack>
          <Stack gap={0}>
            <Text size="sm" c="dimmed">
              {generatedSchedules.length} total · click a block to swap
            </Text>
            <Text size="xs" c="dimmed">
              Showing {eventCount} meeting block{eventCount === 1 ? '' : 's'} this week
            </Text>
          </Stack>
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
            padding: 24,
            maxWidth: '66.67%',
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
      </Box>
    );
  }

  return (
    <Box
      component="main"
      style={{
        minHeight: '100vh',
        padding: '40px 24px 60px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 24,
      }}
    >
      <Title
        order={1}
        style={{ fontFamily: '"DM Serif Display", serif', color: '#F8F9FA' }}
      >
        uOttawa Course Selection
      </Title>

      <Box
        style={{
          width: '100%',
          maxWidth: 1320,
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 260px) minmax(0, 760px) minmax(0, 260px)',
          justifyContent: 'center',
        }}
      >
        <Box
          style={{ display: 'flex', justifyContent: 'flex-end', paddingRight: 40, paddingTop: 4 }}
        >
          <StepList />
        </Box>

        <Box style={{ minWidth: 0 }}>
          <Box
            style={{
              border: '2px solid #2C2E33',
              padding: 40,
              backgroundColor: '#1E1E20',
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
                      leftSection={<IconRefresh size={14} />}
                      onClick={() => {
                        resetToDefault();
                        setActive(0);
                        setShowCalendar(false);
                      }}
                    >
                      Reset
                    </Button>
                  </Group>
                </Group>

                {active === 0 && (
                  <Stack gap="md">
                    <ProgramStep
                      programs={programs}
                      value={program?.url ?? null}
                      onChange={setProgram}
                    />
                  </Stack>
                )}
                {active === 1 && (
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
                {active === 2 && (
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
                {active === 3 && (
                  <Stack gap="md">
                    <ScheduleCountStep
                      coursesThisSemester={coursesThisSemester}
                      onCoursesChange={setCoursesThisSemester}
                      selectedCount={uniqueSelected}
                      onGenerate={handleGenerate}
                      generating={generating}
                      error={generationError}
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
                    disabled={active === STEPS.length - 1}
                  >
                    Next
                  </Button>
                </Group>
              </motion.div>
            </AnimatePresence>
          </Box>
        </Box>

        <Box />
      </Box>
    </Box>
  );
}

export default App;
