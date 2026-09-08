import { useState } from "react";
import { ActionIcon, Group, Tooltip } from "@mantine/core";
import {
  IconCalendarDown,
  IconEraser,
  IconFileImport,
  IconTerminal,
  IconUpload,
} from "@tabler/icons-react";
import { useGetShareUrl, useIndices } from "@uoplan/store/hooks";
import { useShareUrl } from "../../hooks/useShareUrl";
import { tr } from "../../i18n";
import { SaveStatusIndicator } from "./SaveStatusIndicator";
import { UEnrollImportModal } from "./UEnrollImportModal";
import { UoZoneScheduleImportModal } from "./UoZoneScheduleImportModal";
import { useSchoolFeature } from "../../hooks/useSchool";
import { CalendarShareAction } from "./CalendarShareAction";

interface BasicCalendarHeaderActionsProps {
  cliCommand?: string | null;
  onEnrolCli?: () => void;
  onClearOptions: () => void;
  onDownloadIcs: () => void;
  downloadDisabled?: boolean;
}

export function BasicCalendarHeaderActions({
  cliCommand,
  onEnrolCli,
  onClearOptions,
  onDownloadIcs,
  downloadDisabled,
}: BasicCalendarHeaderActionsProps) {
  const indices = useIndices();
  const getShareUrl = useGetShareUrl();
  const hasOfficialScheduleImport = useSchoolFeature("officialScheduleImport");

  const [uenrollImportOpen, setUenrollImportOpen] = useState(false);
  const [uozoneImportOpen, setUozoneImportOpen] = useState(false);
  const { shareCopied, handleCopyShare } = useShareUrl(getShareUrl);

  return (
    <>
      <Group gap={4} wrap="nowrap">
        <Tooltip label={tr("calendarPage.downloadIcs")} position="right" withArrow>
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
        <CalendarShareAction
          show={Boolean(indices)}
          copied={shareCopied}
          onCopy={handleCopyShare}
        />
        <Tooltip label={tr("basicCalendar.clear")} position="right" withArrow>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="md"
            radius="md"
            onClick={onClearOptions}
            aria-label={tr("basicCalendar.clear")}
          >
            <IconEraser size={16} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label={tr("uenrollImport.button")} position="right" withArrow>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="md"
            radius="md"
            onClick={() => setUenrollImportOpen(true)}
            aria-label={tr("uenrollImport.button")}
          >
            <IconFileImport size={16} />
          </ActionIcon>
        </Tooltip>
        {hasOfficialScheduleImport ? (
          <Tooltip label={tr("uozoneImport.button")} position="right" withArrow>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="md"
              radius="md"
              onClick={() => setUozoneImportOpen(true)}
              aria-label={tr("uozoneImport.button")}
            >
              <IconUpload size={16} />
            </ActionIcon>
          </Tooltip>
        ) : null}
        {onEnrolCli && (
          <Tooltip label={tr("enrolCli.button")} position="right" withArrow>
            <ActionIcon
              variant="subtle"
              color="green"
              size="md"
              radius="md"
              disabled={!cliCommand}
              onClick={onEnrolCli}
              aria-label={tr("enrolCli.button")}
              style={{ marginLeft: 4 }}
            >
              <IconTerminal size={16} />
            </ActionIcon>
          </Tooltip>
        )}
      </Group>

      <UEnrollImportModal opened={uenrollImportOpen} onClose={() => setUenrollImportOpen(false)} />
      <UoZoneScheduleImportModal
        opened={uozoneImportOpen}
        onClose={() => setUozoneImportOpen(false)}
      />
    </>
  );
}
