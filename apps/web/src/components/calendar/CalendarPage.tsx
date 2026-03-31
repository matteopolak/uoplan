import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Group,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
  Modal,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import {
  IconArrowBackUp,
  IconMenu2,
  IconRefresh,
  IconShare,
  IconX,
} from "@tabler/icons-react";
import { useAppStore } from "../../store/appStore";
import { useShallow } from "zustand/react/shallow";
import { CalendarView, type CalendarViewHandle } from "./CalendarView";
import { ResetModal } from "../shared/ResetModal";
import { GenerationErrorDetailBlocks } from "../GenerationErrorDetailBlocks";
import { buildScheduleIcs, downloadTextFile } from "schedule";
import { useShareUrl } from "../../hooks/useShareUrl";

interface CalendarPageProps {
  onBack: () => void;
}

export function CalendarPage({ onBack }: CalendarPageProps) {
  const {
    generatedSchedules,
    selectedScheduleIndex,
    swapHistory,
    indices,
    generationError,
    cache,
    professorRatings,
    scheduleColorMaps,
  } = useAppStore(
    useShallow((s) => ({
      generatedSchedules: s.generatedSchedules,
      selectedScheduleIndex: s.selectedScheduleIndex,
      swapHistory: s.swapHistory,
      indices: s.indices,
      generationError: s.generationError,
      cache: s.cache,
      professorRatings: s.professorRatings,
      scheduleColorMaps: s.scheduleColorMaps,
    })),
  );

  const setSelectedScheduleIndex = useAppStore((s) => s.setSelectedScheduleIndex);
  const undoLastSwap = useAppStore((s) => s.undoLastSwap);
  const getShareUrl = useAppStore((s) => s.getShareUrl);
  const getEncodedStateBase64 = useAppStore((s) => s.getEncodedStateBase64);
  const generateSchedules = useAppStore((s) => s.generateSchedules);
  const getSwapCandidates = useAppStore((s) => s.getSwapCandidates);
  const swapCourseInSchedule = useAppStore((s) => s.swapCourseInSchedule);
  const resetToDefault = useAppStore((s) => s.resetToDefault);

  const morphRef = useRef<CalendarViewHandle>(null);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [generatingOneMore, setGeneratingOneMore] = useState(false);
  const [timetableStartDate, setTimetableStartDate] = useState("");
  const [timetableEndDate, setTimetableEndDate] = useState("");

  const { shareCopied, handleCopyShare } = useShareUrl(getShareUrl);

  const isMobile = useMediaQuery("(max-width: 768px)");

  // Auto-detect date range from the selected schedule's meeting dates.
  useEffect(() => {
    if (generatedSchedules.length === 0) return;
    const currentSchedule =
      generatedSchedules[selectedScheduleIndex] ?? generatedSchedules[0];
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
  }, [
    generatedSchedules,
    selectedScheduleIndex,
    timetableStartDate,
    timetableEndDate,
  ]);

  const scheduleOptions = generatedSchedules.map((_, i) => ({
    value: String(i),
    label: `Schedule #${i + 1}`,
  }));
  const currentSchedule =
    generatedSchedules[selectedScheduleIndex] ?? generatedSchedules[0];
  const eventCount = currentSchedule.enrollments.reduce(
    (sum, e) => sum + e.times.length,
    0,
  );

  const startOk =
    Boolean(timetableStartDate) &&
    !Number.isNaN(Date.parse(`${timetableStartDate}T00:00:00Z`));
  const endOk =
    Boolean(timetableEndDate) &&
    !Number.isNaN(Date.parse(`${timetableEndDate}T00:00:00Z`));
  const dateRangeOk = startOk && endOk && timetableStartDate <= timetableEndDate;

  const genErrDetails = generationError?.details ?? null;
  const summarizeEmptyPoolsInGenError =
    genErrDetails &&
    genErrDetails.emptyPools.length > 4 &&
    genErrDetails.totalAvailable < genErrDetails.totalNeeded;

  const handleGenerateOneMore = () => {
    setGeneratingOneMore(true);
    generateSchedules({ appendFirstOnly: true }).then(() => {
      setGeneratingOneMore(false);
      // Trigger animation to the newly appended schedule
      const newIdx = useAppStore.getState().selectedScheduleIndex;
      morphRef.current?.animate(newIdx);
    });
  };

  const handleDownloadIcs = () => {
    const ics = buildScheduleIcs({
      schedule: currentSchedule,
      cache,
      startDate: timetableStartDate,
      endDate: timetableEndDate,
    });
    const idx = (selectedScheduleIndex ?? 0) + 1;
    const filename = `uoplan-schedule-${idx}-${timetableStartDate}-to-${timetableEndDate}.ics`;
    downloadTextFile(filename, ics, "text/calendar;charset=utf-8");
  };

  return (
    <Box
      component="main"
      style={{
        width: "100%",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "row",
        boxSizing: "border-box",
      }}
    >
      {/* Mobile sidebar backdrop */}
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

      {/* Sidebar */}
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
            Close
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
          Your weekly timetable
        </Title>
        <Text size="sm" style={{ color: "#ADB5BD", marginTop: -8 }}>
          Review your generated schedules. Click a block to swap courses.
        </Text>

        {swapHistory.length > 0 && (
          <Button
            variant="light"
            color="gray"
            size="sm"
            radius={0}
            leftSection={<IconArrowBackUp size={14} />}
            onClick={() => undoLastSwap()}
          >
            {swapHistory.length === 1
              ? "Undo swap"
              : `Undo swap (${swapHistory.length})`}
          </Button>
        )}

        <Group gap="xs">
          {indices && (
            <Button
              variant="filled"
              color="dark"
              size="sm"
              radius={0}
              leftSection={<IconShare size={14} />}
              onClick={() => setShareModalOpen(true)}
              style={{ backgroundColor: "#141517" }}
            >
              Share
            </Button>
          )}
          <Button
            variant="filled"
            color="dark"
            size="sm"
            radius={0}
            leftSection={<IconRefresh size={14} />}
            onClick={() => setResetModalOpen(true)}
            style={{ backgroundColor: "#141517" }}
          >
            Reset
          </Button>
        </Group>

        <ResetModal
          opened={resetModalOpen}
          onClose={() => setResetModalOpen(false)}
          onConfirm={() => {
            resetToDefault();
            setResetModalOpen(false);
            onBack();
          }}
        />

        <Select
          label="Schedule"
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
          variant="light"
          color="violet"
          size="sm"
          radius={0}
          loading={generatingOneMore}
          disabled={generatingOneMore}
          onClick={handleGenerateOneMore}
        >
          Generate new schedule
        </Button>

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
              summarizeEmptyPools={!!summarizeEmptyPoolsInGenError}
            />
          </Alert>
        )}

        <Stack gap={4}>
          <TextInput
            label="Start date"
            placeholder="YYYY-MM-DD"
            value={timetableStartDate}
            onChange={(e) => setTimetableStartDate(e.currentTarget.value)}
            size="sm"
          />
          <TextInput
            label="End date"
            placeholder="YYYY-MM-DD"
            value={timetableEndDate}
            onChange={(e) => setTimetableEndDate(e.currentTarget.value)}
            size="sm"
          />
        </Stack>

        <Button
          size="sm"
          color="violet"
          variant="filled"
          radius={0}
          disabled={!dateRangeOk}
          onClick={handleDownloadIcs}
        >
          Download ICS
        </Button>

        <Stack gap={0}>
          <Text size="sm" c="dimmed">
            {generatedSchedules.length} total · click a block to swap
          </Text>
          <Text size="xs" c="dimmed">
            Showing {eventCount} course block{eventCount === 1 ? "" : "s"} this
            week
          </Text>
        </Stack>

        <Box style={{ flex: 1, minHeight: 24 }} />

        <Button
          variant="filled"
          color="dark"
          size="sm"
          radius={0}
          onClick={onBack}
          style={{ backgroundColor: "#141517", alignSelf: "stretch" }}
        >
          Back to setup
        </Button>

        {/* Share modal */}
        <Modal
          opened={shareModalOpen}
          onClose={() => setShareModalOpen(false)}
          title="Share timetable state"
          size="md"
        >
          <Stack gap="md">
            <Text size="sm" c="dimmed">
              Share this URL to let others load your program, completed courses,
              and selections. The code is the state embedded in the URL.
            </Text>
            <TextInput
              label="URL"
              value={getShareUrl() ?? ""}
              readOnly
              size="sm"
            />
            <Textarea
              label="State code"
              value={getEncodedStateBase64() ?? ""}
              readOnly
              minRows={3}
              size="sm"
            />
            <Button variant="filled" onClick={handleCopyShare}>
              {shareCopied ? "Copied to clipboard" : "Copy shareable link"}
            </Button>
          </Stack>
        </Modal>
      </Box>

      {/* Calendar area */}
      <Box
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          padding: isMobile ? 0 : 24,
          paddingBottom: isMobile ? 72 : 24,
          width: "100%",
          maxWidth: 1200,
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
            Menu
          </Button>
          <Button
            variant="subtle"
            color="gray"
            size="md"
            radius={0}
            style={{ flex: 1, border: "none", height: 56 }}
            leftSection={<IconRefresh size={22} />}
            loading={generatingOneMore}
            disabled={generatingOneMore}
            onClick={handleGenerateOneMore}
          >
            Try another
          </Button>
        </Box>
      )}
    </Box>
  );
}
