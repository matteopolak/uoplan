import { useMemo } from "react";
import { Box, Tooltip } from "@mantine/core";
import type { DataCache } from "schedule";
import { COURSE_COLORS, COURSE_COLOR_HEX, hexToRgb, ratingColorToCssVar, ratingToColor } from "schedule";
import type { CalendarEvent } from "../../hooks/useCalendarEvents";
import { ProfessorRatingTooltipLabel } from "./ProfessorRatingTooltipLabel";

/**
 * Formats time range from minutes since midnight to 24-hour format string.
 * @param startMinutes - Start time in minutes since midnight
 * @param endMinutes - End time in minutes since midnight
 * @returns Formatted time range string (e.g., "08:30 - 10:00")
 */
function formatTimeRange(startMinutes: number, endMinutes: number): string {
  const formatTime = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
  };
  
  return `${formatTime(startMinutes)} - ${formatTime(endMinutes)}`;
}

export function CalendarEventContent({
  ext,
  cache,
  colorMap,
}: {
  ext: CalendarEvent;
  cache: DataCache | null;
  colorMap: Record<string, number>;
}) {
  const courseTitle = useMemo(
    () => cache?.getCourse(ext.courseCode)?.title ?? "",
    [cache, ext.courseCode],
  );
  const heading = courseTitle
    ? `${ext.courseCode} — ${courseTitle}`
    : ext.courseCode;

  const colorIdx = colorMap[ext.courseCode] ?? ext.enrollmentIndex;
  const colorName = COURSE_COLORS[colorIdx % COURSE_COLORS.length];
  const hex = COURSE_COLOR_HEX[colorName];
  const { r, g, b } = useMemo(() => hexToRgb(hex), [hex]);

  const legacyId = useMemo(
    () => ext.professorRatingDetails?.find((d) => d.legacyId)?.legacyId,
    [ext.professorRatingDetails],
  );
  const markerColor = useMemo(
    () => ratingColorToCssVar(ratingToColor(ext.professorRatingValue ?? null)),
    [ext.professorRatingValue],
  );

  const timeRange = useMemo(
    () => formatTimeRange(ext.startMinutes, ext.endMinutes),
    [ext.startMinutes, ext.endMinutes],
  );

  return (
    <div
      className="fc-uoplan-event"
      data-course-code={ext.courseCode}
      data-color-hex={hex}
      style={{
        cursor: "pointer",
        borderLeft: `4px solid ${hex}`,
        backgroundColor: `rgba(${r}, ${g}, ${b}, 0.38)`,
      }}
    >
      <div className="fc-uoplan-event-body">
        <span className="fc-uoplan-event-code" title={heading}>
          {heading}
        </span>
        <span className="fc-uoplan-event-type">{ext.componentSection}</span>
        <span className="fc-uoplan-event-time">{timeRange}</span>
        <span
          className="fc-uoplan-event-professor"
          style={{
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
            title={ext.professor}
          >
            {ext.professor}
          </span>

          {ext.professorRatingDetails && ext.professorRatingDetails.length > 0 && (
            <Tooltip
              label={<ProfessorRatingTooltipLabel details={ext.professorRatingDetails} />}
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
                    backgroundColor: markerColor,
                    border: "1px solid rgba(0,0,0,0.45)",
                    boxShadow: "0 0 0 1px rgba(255,255,255,0.08) inset",
                  }}
                />
              </Box>
            </Tooltip>
          )}
        </span>
      </div>
    </div>
  );
}

