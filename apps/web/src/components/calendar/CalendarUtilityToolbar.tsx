import { ActionIcon, Group, Tooltip } from "@mantine/core";
import {
  IconArrowsShuffle,
  IconCalendarDown,
  IconEraser,
  IconFileImport,
  IconTerminal,
  IconUpload,
} from "@tabler/icons-react";
import { tr, useTr } from "../../i18n";
import { SaveStatusIndicator } from "./SaveStatusIndicator";
import { CalendarShareAction } from "./CalendarShareAction";

export interface CalendarUtilityToolbarProps {
  downloadDisabled: boolean;
  onDownloadIcs: () => void;
  shareShow: boolean;
  shareCopied: boolean;
  onCopyShare: () => void;
  randomizeDisabled: boolean;
  onRandomize: () => void;
  onClear: () => void;
  onImport: () => void;
  onUploadSchedule: () => void;
  uploadScheduleShow: boolean;
  cliDisabled: boolean;
  onEnrolCli: () => void;
  /** Tooltip side. Sidebar uses "right"; the embedded header uses "bottom". */
  tooltipPosition?: "right" | "bottom";
}

/**
 * The advanced-calendar utility cluster (download ICS, save status, share,
 * randomize, clear, uEnroll import, enrol CLI). Extracted from the calendar
 * sidebar so the graph planner's floating calendar card can surface the same
 * actions in its header without duplicating markup.
 */
export function CalendarUtilityToolbar({
  downloadDisabled,
  onDownloadIcs,
  shareShow,
  shareCopied,
  onCopyShare,
  randomizeDisabled,
  onRandomize,
  onClear,
  onImport,
  onUploadSchedule,
  uploadScheduleShow,
  cliDisabled,
  onEnrolCli,
  tooltipPosition = "right",
}: CalendarUtilityToolbarProps) {
  useTr();
  return (
    <Group gap={4}>
      <Tooltip label={tr("calendarPage.downloadIcs")} withArrow position={tooltipPosition}>
        <ActionIcon
          variant="subtle"
          color="gray"
          size="md"
          radius="md"
          disabled={downloadDisabled}
          onClick={onDownloadIcs}
          aria-label={tr("calendarPage.downloadIcs")}
        >
          <IconCalendarDown size={16} />
        </ActionIcon>
      </Tooltip>
      <SaveStatusIndicator />
      <CalendarShareAction show={shareShow} copied={shareCopied} onCopy={onCopyShare} />
      <Tooltip label={tr("calendarPage.randomize")} withArrow position={tooltipPosition}>
        <ActionIcon
          variant="subtle"
          color="gray"
          size="md"
          radius="md"
          disabled={randomizeDisabled}
          onClick={onRandomize}
          aria-label={tr("calendarPage.randomize")}
        >
          <IconArrowsShuffle size={16} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label={tr("calendarPage.clear")} withArrow position={tooltipPosition}>
        <ActionIcon
          variant="subtle"
          color="gray"
          size="md"
          radius="md"
          onClick={onClear}
          aria-label={tr("calendarPage.clear")}
        >
          <IconEraser size={16} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label={tr("uenrollImport.button")} withArrow position={tooltipPosition}>
        <ActionIcon
          variant="subtle"
          color="gray"
          size="md"
          radius="md"
          onClick={onImport}
          aria-label={tr("uenrollImport.button")}
        >
          <IconFileImport size={16} />
        </ActionIcon>
      </Tooltip>
      {uploadScheduleShow ? (
        <Tooltip label={tr("uozoneImport.button")} withArrow position={tooltipPosition}>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="md"
            radius="md"
            onClick={onUploadSchedule}
            aria-label={tr("uozoneImport.button")}
          >
            <IconUpload size={16} />
          </ActionIcon>
        </Tooltip>
      ) : null}
      <Tooltip label={tr("enrolCli.button")} withArrow position={tooltipPosition}>
        <ActionIcon
          variant="subtle"
          color="green"
          size="md"
          radius="md"
          disabled={cliDisabled}
          onClick={onEnrolCli}
          aria-label={tr("enrolCli.button")}
          style={{ marginLeft: "auto" }}
        >
          <IconTerminal size={16} />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}
