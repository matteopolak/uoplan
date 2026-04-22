import { Badge, Group, Select, Stack, Text } from "@mantine/core";
import type { SwapCandidateOption, SwapModalState, SwapResult } from "../../hooks/useSwapModal";

export function SwapCourseDropdown({
  modalState,
  loading,
  result,
  candidateOptions,
  query,
  setQuery,
  closeModal,
  onSwap,
}: {
  modalState: SwapModalState | null;
  loading: boolean;
  result: SwapResult;
  candidateOptions: SwapCandidateOption[];
  query: string;
  setQuery: (q: string) => void;
  closeModal: () => void;
  onSwap: (enrollmentIndex: number, newCourseCode: string) => void;
}) {
  if (loading) {
    return (
      <Text size="sm" c="dimmed">
        Finding swap options…
      </Text>
    );
  }

  const hasRejected = (result.rejectedWithConflict?.length ?? 0) > 0;
  if (result.candidates.length === 0 && !hasRejected) {
    const pool = result.poolCourses;
    const poolPreview =
      pool.length > 0
        ? ` Pool had ${pool.length} course(s): ${pool.slice(0, 20).sort().join(", ")}${
            pool.length > 20 ? "…" : ""
          }.`
        : " Pool was empty.";

    return (
      <Stack gap="xs">
        <Text size="sm" c="dimmed">
          No alternative courses available that fit your schedule.
        </Text>
        {pool.length > 0 && (
          <Text size="xs" c="dimmed" style={{ fontFamily: "monospace" }}>
            {poolPreview}
          </Text>
        )}
      </Stack>
    );
  }

  return (
    <Select
      label="Swap with"
      placeholder="Search courses…"
      searchable
      data={candidateOptions}
      value={null}
      searchValue={query}
      onSearchChange={setQuery}
      nothingFoundMessage="No matches"
      maxDropdownHeight={260}
      onChange={(val) => {
        if (!val) return;
        const original = modalState!.enrollmentIndex;
        onSwap(original, val);
        closeModal();
      }}
      renderOption={({ option }) => {
        const typed = option as SwapCandidateOption;
        const rejected = Boolean(typed.conflictsWith);
        if (rejected) {
          return (
            <Group gap="xs" wrap="nowrap">
              <Badge size="sm" color="red" variant="light" style={{ flexShrink: 0 }}>
                {typed.conflictsWith}
              </Badge>
              <Text size="sm" span style={{ opacity: 0.85 }}>
                {typed.label}
              </Text>
            </Group>
          );
        }
        return <>{typed.label}</>;
      }}
      styles={{
        option: { paddingTop: 6, paddingBottom: 6 },
        dropdown: { padding: 4 },
      }}
    />
  );
}

