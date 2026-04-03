import { Box, Button, Stack, Text } from "@mantine/core";
import type { DataCache, GeneratedSchedule, ProfessorRatingsMap } from "schedule";
import type { SwapCandidateOption, SwapModalState, SwapResult } from "../../hooks/useSwapModal";
import { EventStyleCard } from "./EventStyleCard";
import { SwapCourseDropdown } from "./SwapCourseDropdown";

export function SwapModalContent({
  schedule,
  scheduleIndex,
  modalState,
  result,
  loading,
  candidateOptions,
  query,
  setQuery,
  closeModal,
  cache,
  professorRatings,
  onSwap,
}: {
  schedule: GeneratedSchedule | null;
  scheduleIndex: number;
  modalState: SwapModalState;
  result: SwapResult;
  loading: boolean;
  candidateOptions: SwapCandidateOption[];
  query: string;
  setQuery: (q: string) => void;
  closeModal: () => void;
  cache: DataCache | null;
  professorRatings: ProfessorRatingsMap | null;
  onSwap: (scheduleIndex: number, enrollmentIndex: number, newCourseCode: string) => void;
}) {
  const enrollment = schedule?.enrollments[modalState.enrollmentIndex];

  return (
    <Stack gap="md" mt="md">
      {result.requirementTitle && (
        <Box
          px="sm"
          py="sm"
          style={{
            backgroundColor: "var(--mantine-color-dark-6)",
          }}
        >
          <Text
            size="xs"
            c="dimmed"
            tt="uppercase"
            fw={600}
            mb={6}
            style={{ letterSpacing: "0.05em" }}
          >
            Satisfying requirement
          </Text>
          <Text size="sm" lh={1.45} style={{ color: "var(--mantine-color-gray-3)" }}>
            {result.requirementTitle}
          </Text>
        </Box>
      )}

      <div>
        <Text size="xs" c="dimmed" tt="uppercase" fw={600} mb={6}>
          Current course
        </Text>
        {enrollment ? (
          <EventStyleCard
            enrollment={enrollment}
            enrollmentIndex={modalState.enrollmentIndex}
            cache={cache}
            professorRatings={professorRatings}
            componentSection={modalState.componentSection}
            virtual={modalState.virtual}
          />
        ) : (
          <Text size="sm" c="dimmed">
            {modalState.courseCode}
          </Text>
        )}
      </div>

      <div>
        <Text size="sm" c="dimmed" mb="xs">
          Choose a course to replace it:
        </Text>
        <SwapCourseDropdown
          scheduleIndex={scheduleIndex}
          modalState={modalState}
          loading={loading}
          result={result}
          candidateOptions={candidateOptions}
          query={query}
          setQuery={setQuery}
          closeModal={closeModal}
          onSwap={onSwap}
        />
      </div>

      <Button variant="default" onClick={closeModal}>
        Cancel
      </Button>
    </Stack>
  );
}

