import { Box, Stack, Text, Tooltip } from "@mantine/core";
import type { DataCache } from "schedule";
import type { CourseEnrollment } from "schedule";
import {
  getRatingsForInstructors,
  getRatingDetailsForInstructors,
  type ProfessorRatingsMap,
} from "schedule";
import {
  COURSE_COLORS,
  COURSE_COLOR_HEX,
  hexToRgb,
  ratingToColor,
  ratingColorToCssVar,
} from "schedule";

interface EventStyleCardProps {
  enrollment: CourseEnrollment;
  enrollmentIndex: number;
  cache: DataCache | null;
  professorRatings: ProfessorRatingsMap | null;
}

function RatingTooltipLabel({
  details,
}: {
  details?: Array<{ id?: string; legacyId?: number; name: string; rating: number; numRatings: number }>;
}) {
  if (!details?.length) return null;
  return (
    <Stack gap={4}>
      <Text size="xs" fw={600} c="dimmed">RateMyProfessors</Text>
      {details.map((d) => (
        <Text key={d.name} size="xs">
          {d.name} · {d.numRatings > 0 ? `${d.rating.toFixed(1).replace(/\.0$/, '')}/5` : 'N/A'}
          {d.numRatings > 0 ? ` (${d.numRatings} ratings)` : ''}
        </Text>
      ))}
    </Stack>
  );
}

/**
 * Renders a single enrollment in the same style as calendar events.
 * Used in the swap modal to show the current course.
 */
export function EventStyleCard({
  enrollment,
  enrollmentIndex,
  cache,
  professorRatings,
}: EventStyleCardProps) {
  const courseTitle = cache?.getCourse(enrollment.courseCode)?.title ?? "";
  const heading = courseTitle
    ? `${enrollment.courseCode} — ${courseTitle}`
    : enrollment.courseCode;

  const firstEntry = Object.entries(enrollment.sectionCombo)[0];
  const componentSection = firstEntry
    ? `${firstEntry[0]} - ${firstEntry[1].section.sectionCode ?? firstEntry[1].section.section ?? ""}`
    : "—";
  const professor = firstEntry
    ? [...new Set(firstEntry[1].section.instructors ?? [])]
        .filter(Boolean)
        .join(", ") || "—"
    : "—";

  const ratings = firstEntry
    ? getRatingsForInstructors(
        firstEntry[1].section.instructors ?? [],
        professorRatings
      )
    : [];
  const ratingValue =
    ratings.length > 0
      ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) /
        10
      : null;
  const ratingDetails = firstEntry
    ? getRatingDetailsForInstructors(
        firstEntry[1].section.instructors ?? [],
        professorRatings
      )
    : [];

  const colorName = COURSE_COLORS[enrollmentIndex % COURSE_COLORS.length];
  const hex = COURSE_COLOR_HEX[colorName];
  const { r, g, b } = hexToRgb(hex);

  return (
    <div
      className="fc-uoplan-event"
      style={{
        borderLeft: `4px solid ${hex}`,
        backgroundColor: `rgba(${r}, ${g}, ${b}, 0.38)`,
        padding: "10px 12px",
      }}
    >
      <div
        className="fc-uoplan-event-body"
        style={{ display: "flex", flexDirection: "column", gap: 2 }}
      >
        <span
          className="fc-uoplan-event-code"
          title={heading}
          style={{ fontWeight: 600 }}
        >
          {heading}
        </span>
        <span
          className="fc-uoplan-event-type"
          style={{ fontSize: "0.85em", opacity: 0.9 }}
        >
          {componentSection}
        </span>
        <span
          className="fc-uoplan-event-professor"
          style={{
            fontSize: "0.8em",
            opacity: 0.85,
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexWrap: "nowrap",
            minWidth: 0,
            maxWidth: "100%",
          }}
        >
          <span
            style={{
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={professor}
          >
            {professor}
          </span>
          {ratingDetails && ratingDetails.length > 0 && (() => {
            const legacyId = ratingDetails?.find((d) => d.legacyId)?.legacyId;
            return (
              <Tooltip
                label={<RatingTooltipLabel details={ratingDetails} />}
                withArrow
                position="top"
                withinPortal
                color="dark"
              >
                <Box
                  component="a"
                  href={legacyId ? `https://www.ratemyprofessors.com/professor/${legacyId}` : undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    padding: 4,
                    flexShrink: 0,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Box
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 0,
                      backgroundColor: ratingColorToCssVar(ratingToColor(ratingValue ?? null)),
                      border: "1px solid rgba(0,0,0,0.45)",
                      boxShadow: "0 0 0 1px rgba(255,255,255,0.08) inset",
                    }}
                  />
                </Box>
              </Tooltip>
            );
          })()}
        </span>
      </div>
    </div>
  );
}
