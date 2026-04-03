import { List, Stack, Text } from "@mantine/core";
import type { GenerationErrorDetails } from "../store/types";

function formatCourseList(courses: string[]): string {
  if (courses.length === 0) return "";
  if (courses.length === 1) return courses[0];
  if (courses.length === 2) return `${courses[0]} or ${courses[1]}`;
  if (courses.length > 5) {
    return `${courses.slice(0, 5).join(", ")}, or ${courses.length - 5} more`;
  }
  const last = courses[courses.length - 1];
  const rest = courses.slice(0, -1);
  return `${rest.join(", ")}, or ${last}`;
}

function hasDetailContent(errorDetails: GenerationErrorDetails): boolean {
  if (errorDetails.totalAvailable < errorDetails.totalNeeded) return true;
  if (errorDetails.emptyPools.length > 0) return true;
  const tf = errorDetails.timetableFailure;
  if (!tf) return false;
  if (tf.coursesWithNoCombo.length > 0) return true;
  if (tf.suggestions.length > 0) return true;
  return false;
}

export function GenerationErrorDetailBlocks({
  errorDetails,
  summarizeEmptyPools,
}: {
  errorDetails: GenerationErrorDetails | null | undefined;
  summarizeEmptyPools: boolean;
}) {
  if (!errorDetails || !hasDetailContent(errorDetails)) return null;

  const tf = errorDetails.timetableFailure;

  const genericPools = errorDetails.emptyPools.filter(
    (p) => p.label === "course" || p.label === "or_course"
  );
  const otherPools = errorDetails.emptyPools.filter(
    (p) => p.label !== "course" && p.label !== "or_course"
  );

  const formattedEmptyPools: React.ReactNode[] = [];

  if (genericPools.length > 0) {
    const combinedCandidates = new Set<string>();
    for (const p of genericPools) {
      if (p.candidateCourses) {
        for (const c of p.candidateCourses) {
          combinedCandidates.add(c);
        }
      }
    }
    const candidates = Array.from(combinedCandidates).sort();
    if (candidates.length > 0) {
      formattedEmptyPools.push(
        <List.Item key="generic">{formatCourseList(candidates)}</List.Item>
      );
    } else {
      formattedEmptyPools.push(<List.Item key="generic">Requirement</List.Item>);
    }
  }

  for (const p of otherPools) {
    let text = p.label;
    if (p.candidateCourses && p.candidateCourses.length > 0) {
      text += ` ${formatCourseList(p.candidateCourses)}`;
    }
    formattedEmptyPools.push(
      <List.Item key={p.requirementId ?? p.label}>{text}</List.Item>
    );
  }

  return (
    <Stack gap="sm" pt="xs">
      {errorDetails.totalAvailable < errorDetails.totalNeeded && (
        <Text size="xs" c="dimmed">
          Only {errorDetails.totalAvailable} of {errorDetails.totalNeeded} course
          slots can be filled with your current filters.
        </Text>
      )}
      {errorDetails.emptyPools.length > 0 && summarizeEmptyPools && (
        <Text size="xs" c="dimmed">
          {errorDetails.emptyPools.length} other requirements have no eligible
          courses (often future-term sections not posted yet).
        </Text>
      )}
      {errorDetails.emptyPools.length > 0 && !summarizeEmptyPools && (
        <>
          <Text size="xs" fw={600}>
            No eligible courses this term
          </Text>
          <List size="xs" spacing={4} withPadding>
            {formattedEmptyPools}
          </List>
        </>
      )}
      {tf && tf.coursesWithNoCombo.length > 0 && (
        <>
          <Text size="xs" fw={600}>
            No matching sections (filters / timetable)
          </Text>
          <Text size="xs" c="dimmed" style={{ fontFamily: "monospace" }}>
            {tf.coursesWithNoCombo.join(", ")}
          </Text>
        </>
      )}
      {tf && tf.suggestions.length > 0 && (
        <>
          <Text size="xs" fw={600}>
            Quick fixes
          </Text>
          <List size="xs" spacing={4} withPadding>
            {tf.suggestions.map((s, i) => (
              <List.Item key={i}>{s}</List.Item>
            ))}
          </List>
        </>
      )}
    </Stack>
  );
}
