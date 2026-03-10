import { useEffect, useState } from 'react';
import { Box, Stack, Title, Alert, Loader, Text, Paper, Group, Button } from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';
import { useAppStore } from './store/appStore';
import { ProgramStep } from './components/ProgramStep';
import { CompletedCoursesStep } from './components/CompletedCoursesStep';
import { RequirementsStep } from './components/RequirementsStep';
import { ScheduleCountStep } from './components/ScheduleCountStep';
import { CalendarView } from './components/CalendarView';

const STEPS = [
  { label: 'Program', description: 'Choose your program' },
  { label: 'Completed', description: 'Mark completed courses' },
  { label: 'Requirements', description: 'Select courses' },
  { label: 'Generate', description: 'Choose count and generate' },
  { label: 'Calendar', description: 'View schedules' },
] as const;

function App() {
  const {
    loadData,
    catalogue,
    cache,
    loading,
    error,
    program,
    completedCourses,
    remainingRequirements,
    requirementTreeWithStatus,
    completedRequirementsList,
    selectedPerRequirement,
    coursesThisSemester,
    generatedSchedules,
    selectedScheduleIndex,
    setProgram,
    setCompletedCourses,
    setSelectedForRequirement,
    setCoursesThisSemester,
    generateSchedules,
    setSelectedScheduleIndex,
    swapCourseInSchedule,
  } = useAppStore();

  const [active, setActive] = useState(0);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const programs = catalogue?.programs ?? [];

  const handleGenerate = () => {
    setGenerating(true);
    setTimeout(() => {
      generateSchedules();
      setGenerating(false);
      setActive(4);
    }, 0);
  };

  const uniqueSelected = new Set(Object.values(selectedPerRequirement).flat()).size;

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
                    {idx + 1}. {step.label}
                  </Text>
                </Group>
              </Box>
            );
          })}
        </Stack>
      </Box>
    </Box>
  );

  return (
    <Box
      component="main"
      style={{
        minHeight: '100vh',
        padding: '60px 24px',
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 260px) minmax(0, 760px) minmax(0, 260px)',
      }}
    >
      <Box style={{ display: 'flex', justifyContent: 'flex-end', paddingRight: 40, paddingTop: 4 }}>
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
          <Group justify="space-between" mb={8}>
            <Text
              size="xs"
              fw={500}
              style={{ textTransform: 'uppercase', letterSpacing: '0.08em', color: '#A6A7AB' }}
            >
              Step {active + 1} of {STEPS.length}
            </Text>
            <Text size="xs" style={{ color: '#868E96' }}>
              {STEPS[active].label}
            </Text>
          </Group>

          <Title
            order={1}
            mb={16}
            style={{ fontFamily: '"DM Serif Display", serif', color: '#F8F9FA' }}
          >
            uOttawa Course Selection
          </Title>

          <Title
            order={3}
            mb={12}
            style={{ fontFamily: '"DM Serif Display", serif', color: '#F1F3F5' }}
          >
            {STEPS[active].label}
          </Title>
          <Text size="sm" style={{ color: '#ADB5BD' }} mb={24}>
            {STEPS[active].description}
          </Text>

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
                selectedPerRequirement={selectedPerRequirement}
                onSelect={setSelectedForRequirement}
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
              />
            </Stack>
          )}
          {active === 4 && (
            <Stack gap="md">
              <CalendarView
                schedules={generatedSchedules}
                selectedIndex={selectedScheduleIndex}
                onSelectIndex={setSelectedScheduleIndex}
                cache={cache}
                selectedPerRequirement={selectedPerRequirement}
                onSwap={swapCourseInSchedule}
              />
            </Stack>
          )}

          <Group justify="space-between" mt={30}>
            <Button
              variant="subtle"
              color="gray"
              onClick={() => setActive((current) => Math.max(0, current - 1))}
              disabled={active === 0}
              style={{ border: 'none' }}
            >
              Back
            </Button>
            <Button
              color="constructBlack"
              onClick={() => setActive((current) => Math.min(STEPS.length - 1, current + 1))}
              disabled={active === STEPS.length - 1}
            >
              Next
            </Button>
          </Group>
        </Box>
      </Box>

      <Box />
    </Box>
  );
}

export default App;
