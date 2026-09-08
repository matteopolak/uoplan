import { useRef, useState } from "react";
import { Alert, Button, FileButton, List, Modal, Stack, Text } from "@mantine/core";
import { IconAlertCircle, IconCircleCheck, IconFileUpload } from "@tabler/icons-react";
import { useDataCache, useScheduleGeneration } from "@uoplan/store/hooks";
import { useAnalytics } from "../../lib/analytics";
import { parseUoZoneScheduleHtml, resolveUoZoneSchedule } from "../../lib/importFromUoZone";
import type { UoZoneResolveResult } from "../../lib/importFromUoZone";
import { tr, useTr } from "../../i18n";

interface UoZoneScheduleImportModalProps {
  opened: boolean;
  onClose: () => void;
}

type ImportState =
  | { status: "idle" }
  | { status: "ready"; fileName: string; resolved: UoZoneResolveResult }
  | { status: "error" };

export function UoZoneScheduleImportModal({ opened, onClose }: UoZoneScheduleImportModalProps) {
  useTr();
  const cache = useDataCache();
  const { importSchedule } = useScheduleGeneration();
  const analytics = useAnalytics();
  const resetFile = useRef<() => void>(null);
  const [state, setState] = useState<ImportState>({ status: "idle" });
  const [reading, setReading] = useState(false);

  async function handleFile(file: File | null) {
    if (!file || !cache) return;
    setReading(true);
    try {
      const courses = parseUoZoneScheduleHtml(await file.text());
      setState({
        status: "ready",
        fileName: file.name,
        resolved: resolveUoZoneSchedule(courses, cache),
      });
    } catch {
      setState({ status: "error" });
      analytics.capture("uozone_schedule_imported", { ok: false });
    } finally {
      setReading(false);
    }
  }

  function resetAndClose() {
    resetFile.current?.();
    setState({ status: "idle" });
    onClose();
  }

  function handleImport() {
    if (state.status !== "ready" || !state.resolved.ok) return;
    importSchedule(state.resolved.schedule);
    analytics.capture("uozone_schedule_imported", {
      ok: true,
      courseCount: state.resolved.schedule.enrollments.length,
      skippedCount: state.resolved.skippedCount + state.resolved.warnings.length,
    });
    resetAndClose();
  }

  const resolved = state.status === "ready" ? state.resolved : null;

  return (
    <Modal
      opened={opened}
      onClose={resetAndClose}
      title={tr("uozoneImport.modal.title")}
      size="lg"
      centered
      radius="md"
    >
      <Stack gap="md">
        <Text size="sm">{tr("uozoneImport.modal.description")}</Text>
        <List type="ordered" size="sm" spacing="xs">
          <List.Item>{tr("uozoneImport.modal.stepOpen")}</List.Item>
          <List.Item>{tr("uozoneImport.modal.stepList")}</List.Item>
          <List.Item>{tr("uozoneImport.modal.stepSave")}</List.Item>
          <List.Item>{tr("uozoneImport.modal.stepChoose")}</List.Item>
        </List>
        <Alert color="blue" radius="md">
          <Text size="sm">{tr("uozoneImport.modal.privacy")}</Text>
        </Alert>

        <FileButton
          resetRef={resetFile}
          onChange={(file) => void handleFile(file)}
          accept="text/html,.html,.htm"
        >
          {(props) => (
            <Button
              {...props}
              variant="light"
              leftSection={<IconFileUpload size={16} />}
              loading={reading}
              disabled={!cache}
              radius="md"
              fullWidth
            >
              {tr("uozoneImport.modal.chooseFile")}
            </Button>
          )}
        </FileButton>

        {state.status === "error" ? (
          <Alert
            icon={<IconAlertCircle size={16} />}
            color="red"
            title={tr("uozoneImport.modal.invalid")}
            radius="md"
          >
            <Text size="sm">{tr("uozoneImport.modal.invalidDescription")}</Text>
          </Alert>
        ) : null}

        {state.status === "ready" && resolved?.ok ? (
          <Stack gap="xs">
            <Alert
              icon={<IconCircleCheck size={16} />}
              color="teal"
              title={tr("uozoneImport.modal.recognized", {
                fileName: state.fileName,
                count: resolved.schedule.enrollments.length,
              })}
              radius="md"
            >
              <List size="sm" spacing={2}>
                {resolved.schedule.enrollments.map((enrollment) => (
                  <List.Item key={enrollment.courseCode}>{enrollment.courseCode}</List.Item>
                ))}
              </List>
            </Alert>
            {resolved.warnings.length > 0 || resolved.skippedCount > 0 ? (
              <Alert
                icon={<IconAlertCircle size={16} />}
                color="yellow"
                title={tr("uozoneImport.modal.warnings")}
                radius="md"
              >
                <Text size="sm">
                  {tr("uozoneImport.modal.warningsDescription", {
                    courses: resolved.warnings.join(", ") || tr("uozoneImport.modal.none"),
                    count: resolved.skippedCount,
                  })}
                </Text>
              </Alert>
            ) : null}
          </Stack>
        ) : null}

        {state.status === "ready" && resolved && !resolved.ok ? (
          <Alert
            icon={<IconAlertCircle size={16} />}
            color="red"
            title={tr("uozoneImport.modal.noMatches")}
            radius="md"
          >
            <Text size="sm">{tr("uozoneImport.modal.noMatchesDescription")}</Text>
          </Alert>
        ) : null}

        <Button
          color="accentBlue"
          radius="md"
          disabled={!resolved?.ok}
          onClick={handleImport}
          fullWidth
        >
          {tr("uozoneImport.modal.confirm")}
        </Button>
      </Stack>
    </Modal>
  );
}
