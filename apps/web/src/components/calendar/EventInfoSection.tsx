import { Fragment, useMemo } from "react";
import type { MouseEvent } from "react";
import { Anchor, Badge, Box, Divider, Group, HoverCard, Stack, Text } from "@mantine/core";
import { Link } from "@tanstack/react-router";
import { DAY_LABELS } from "@uoplan/calendar";
import { pickCanonicalProfessorName, slugifyProfessor } from "@uoplan/core";
import type { CanonicalProfessorName } from "@uoplan/core";
import type { CalendarEvent } from "../../hooks/useCalendarEvents";
import { tr } from "../../i18n";
import { GradeDistributionExpanded } from "./GradeDistributionViz";
import { formatTimeRange } from "./calendarEventDisplayUtils";
import { formatUtcDateRange } from "./calendarDateRange";

interface EventInfoSectionProps {
  event: CalendarEvent;
}

/** A professor name linked to its explore page by kebab-case slug (derived from
 * the name; the route resolves it via the professor match key). Rendered in
 * the app text colour (not the default anchor colour) so it reads as a normal
 * name, and stops click propagation so following the link doesn't toggle the
 * swap overlay it lives inside. */
function ProfessorLink({ name }: { name: CanonicalProfessorName }) {
  return (
    <Anchor
      size="xs"
      fw={500}
      c="var(--app-text)"
      onClick={(e: MouseEvent) => e.stopPropagation()}
      renderRoot={(props) => (
        <Link to="/explore/professor/$slug" params={{ slug: slugifyProfessor(name) }} {...props} />
      )}
    >
      {name}
    </Anchor>
  );
}

function RmpRatingValue({ legacyId, value }: { legacyId?: number | null; value: string }) {
  return legacyId ? (
    <Anchor
      href={`https://www.ratemyprofessors.com/professor/${legacyId}`}
      target="_blank"
      rel="noopener noreferrer"
      size="xs"
      fw={600}
      c="var(--app-text)"
      style={{
        whiteSpace: "nowrap",
        flexShrink: 0,
        fontVariantNumeric: "tabular-nums",
      }}
      onClick={(e: MouseEvent) => e.stopPropagation()}
    >
      {value}
    </Anchor>
  ) : (
    <Text
      size="xs"
      fw={600}
      style={{
        whiteSpace: "nowrap",
        flexShrink: 0,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {value}
    </Text>
  );
}

/** Read-only details for a calendar event (section, time, instructor, ratings,
 * grade distribution). Shown inside the swap overlay (popover on desktop,
 * drawer on mobile) above the list of swap candidates. */
export function EventInfoSection({ event }: EventInfoSectionProps) {
  const timeRange = useMemo(
    () => formatTimeRange(event.startMinutes, event.endMinutes),
    [event.startMinutes, event.endMinutes],
  );
  const dayLabel = DAY_LABELS[event.day];
  const dateRange = useMemo(
    () => (event.meetingDates ? formatUtcDateRange(...event.meetingDates, "") : ""),
    [event.meetingDates],
  );

  const ratingDetails = event.professorRatingDetails ?? [];
  const hasProfessor = event.professor.trim() !== "" && event.professor !== "—";
  const instructors =
    ratingDetails.length > 0
      ? ratingDetails.map((d) => ({ name: d.name, legacyId: d.legacyId }))
      : event.professor
          .split(", ")
          .map((name) => ({ name: pickCanonicalProfessorName([name]), legacyId: undefined }));
  const ratedInstructors = ratingDetails.filter((d) => d.numRatings > 0);
  // RMP detail for a *single* predicted instructor — a multi-candidate average
  // would be misleading, so we only surface a rating when there is one guess.
  const predictedRating =
    (event.predictedInstructors?.length ?? 0) === 1
      ? (event.predictedRatingDetails?.find((d) => d.numRatings > 0) ?? null)
      : null;

  return (
    <Stack gap={8}>
      <Stack gap={4}>
        <Group gap={6} wrap="nowrap" justify="space-between">
          <Text size="xs" c="dimmed">
            {tr("calendar.hover.section")}
          </Text>
          <Text size="xs" fw={500}>
            {event.componentSection}
          </Text>
        </Group>
        <Group gap={6} wrap="nowrap" justify="space-between">
          <Text size="xs" c="dimmed">
            {tr("calendar.hover.when")}
          </Text>
          <Text size="xs" fw={500}>
            {dayLabel} · {timeRange}
          </Text>
        </Group>
        {dateRange ? (
          <Group gap={6} wrap="nowrap" justify="space-between">
            <Text size="xs" c="dimmed">
              {tr("calendar.hover.dates")}
            </Text>
            <Text size="xs" fw={500}>
              {dateRange}
            </Text>
          </Group>
        ) : null}
        {event.location ? (
          <Group gap={6} wrap="nowrap" justify="space-between" align="flex-start">
            <Text size="xs" c="dimmed">
              {tr("calendar.hover.location")}
            </Text>
            <Text size="xs" fw={500} ta="right">
              {event.location}
            </Text>
          </Group>
        ) : null}
      </Stack>

      {event.courseSentiment != null || event.professorSentiment != null ? (
        <>
          <Divider />
          <Stack gap={4}>
            <Text size="xs" c="dimmed" fw={600}>
              {tr("calendar.hover.satisfaction")}
            </Text>
            {event.courseSentiment != null ? (
              <Group gap={6} wrap="nowrap" justify="space-between" align="baseline">
                <Text size="xs" c="dimmed">
                  {tr("calendar.hover.satisfactionCourse")}
                </Text>
                <Text size="xs" fw={600} style={{ fontVariantNumeric: "tabular-nums" }}>
                  {tr("calendar.hover.satisfactionValue", {
                    value: event.courseSentiment.toFixed(1),
                  })}
                </Text>
              </Group>
            ) : null}
            {event.professorSentiment != null ? (
              <Group gap={6} wrap="nowrap" justify="space-between" align="baseline">
                <Text size="xs" c="dimmed">
                  {tr("calendar.hover.satisfactionProfessor")}
                </Text>
                <Text size="xs" fw={600} style={{ fontVariantNumeric: "tabular-nums" }}>
                  {tr("calendar.hover.satisfactionValue", {
                    value: event.professorSentiment.toFixed(1),
                  })}
                </Text>
              </Group>
            ) : null}
          </Stack>
        </>
      ) : null}

      {ratedInstructors.length > 0 ? (
        <>
          <Divider />
          <Stack gap={4}>
            <Text size="xs" c="dimmed" fw={600}>
              {tr("calendar.hover.rmp")}
            </Text>
            {ratedInstructors.map((d, _i, arr) => {
              const value = tr("calendar.hover.rmpValue", {
                rating: d.rating.toFixed(1).replace(/\.0$/, ""),
                count: d.numRatings,
              });
              return (
                <Group key={d.name} gap={6} wrap="nowrap" justify="space-between" align="baseline">
                  <Text size="xs" c="dimmed" style={{ minWidth: 0 }}>
                    {arr.length > 1 ? d.name : tr("calendar.hover.satisfactionProfessor")}
                  </Text>
                  <RmpRatingValue legacyId={d.legacyId} value={value} />
                </Group>
              );
            })}
          </Stack>
        </>
      ) : null}

      {hasProfessor ? (
        <>
          <Divider />
          <Group gap={6} wrap="nowrap" justify="space-between" align="baseline">
            <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
              {tr("calendar.hover.instructor")}
            </Text>
            <Box
              style={{
                flex: 1,
                minWidth: 0,
                overflow: "hidden",
                whiteSpace: "nowrap",
                textAlign: "right",
              }}
            >
              {instructors.map((p, i, arr) => (
                <Fragment key={p.name}>
                  <ProfessorLink name={p.name} />
                  {i < arr.length - 1 ? (
                    <Text span size="xs" c="dimmed">
                      {", "}
                    </Text>
                  ) : null}
                </Fragment>
              ))}
            </Box>
          </Group>
        </>
      ) : null}

      {!hasProfessor && predictedRating ? (
        <>
          <Divider />
          <Stack gap={4}>
            <Text size="xs" c="dimmed" fw={600}>
              {tr("calendar.hover.rmp")}
            </Text>
            <Group gap={6} wrap="nowrap" justify="space-between" align="baseline">
              <Text size="xs" c="dimmed" style={{ minWidth: 0 }}>
                {tr("calendar.hover.satisfactionProfessor")}
              </Text>
              {(() => {
                const value = tr("calendar.hover.rmpValue", {
                  rating: predictedRating.rating.toFixed(1).replace(/\.0$/, ""),
                  count: predictedRating.numRatings,
                });
                return <RmpRatingValue legacyId={predictedRating.legacyId} value={value} />;
              })()}
            </Group>
          </Stack>
        </>
      ) : null}

      {!hasProfessor && (event.predictedInstructors?.length ?? 0) > 0
        ? (() => {
            const predicted = event.predictedInstructors ?? [];
            const [first, ...rest] = predicted;
            return (
              <>
                <Divider />
                <Group gap={6} wrap="nowrap" justify="space-between" align="baseline">
                  <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
                    {tr("calendar.hover.instructorPredicted")}
                  </Text>
                  <Group
                    gap={6}
                    wrap="nowrap"
                    align="baseline"
                    justify="flex-end"
                    style={{ minWidth: 0, flex: 1 }}
                  >
                    <Box
                      style={{
                        minWidth: 0,
                        overflow: "hidden",
                        whiteSpace: "nowrap",
                        textAlign: "right",
                      }}
                    >
                      <ProfessorLink name={first.name} />
                    </Box>
                    {rest.length > 0 ? (
                      <HoverCard
                        width={200}
                        shadow="md"
                        radius="var(--app-radius-sm)"
                        openDelay={80}
                        withinPortal
                        position="top"
                      >
                        <HoverCard.Target>
                          <Badge
                            size="xs"
                            variant="light"
                            color="gray"
                            radius="sm"
                            style={{ textTransform: "none", cursor: "help", flexShrink: 0 }}
                          >
                            {tr("calendar.hover.instructorPredictedMore", { count: rest.length })}
                          </Badge>
                        </HoverCard.Target>
                        <HoverCard.Dropdown>
                          <Stack gap={4}>
                            <Text size="xs" c="dimmed">
                              {tr("calendar.hover.instructorPredictedOthers")}
                            </Text>
                            {rest.map((p) => (
                              <ProfessorLink key={`${p.name}-${p.legacyId ?? "x"}`} name={p.name} />
                            ))}
                          </Stack>
                        </HoverCard.Dropdown>
                      </HoverCard>
                    ) : null}
                  </Group>
                </Group>
              </>
            );
          })()
        : null}

      {event.gradeViz && event.gradeViz.total > 0 ? (
        <>
          <Divider />
          <Box>
            <Text size="xs" c="dimmed" fw={600} mb={6}>
              {tr("calendar.grade.distribution")}
            </Text>
            <GradeDistributionExpanded gradeViz={event.gradeViz} />
          </Box>
        </>
      ) : null}
    </Stack>
  );
}
