import { useState } from "react";
import { Button, Group, Tooltip } from "@mantine/core";
import { IconRefresh, IconShare } from "@tabler/icons-react";
import { useAppStore } from "../../store/appStore";
import { useShareUrl } from "../../hooks/useShareUrl";
import { tr } from "../../i18n";
import { LanguageSwitcher } from "../shared/LanguageSwitcher";
import { ResetModal } from "../shared/ResetModal";

export function BasicCalendarHeaderActions({ onBack }: { onBack: () => void }) {
  const indices = useAppStore((s) => s.indices);
  const getShareUrl = useAppStore((s) => s.getShareUrl);
  const resetToDefault = useAppStore((s) => s.resetToDefault);

  const [resetModalOpen, setResetModalOpen] = useState(false);
  const { shareCopied, handleCopyShare } = useShareUrl(getShareUrl);

  return (
    <>
      <Group gap="xs" wrap="wrap">
        <LanguageSwitcher />
        {indices && (
          <Tooltip label="Copied to clipboard!" opened={shareCopied} position="bottom" withArrow color="dark">
            <Button
              variant="filled"
              color="dark"
              size="sm"
              radius={0}
              leftSection={<IconShare size={14} />}
              onClick={handleCopyShare}
              style={{ backgroundColor: "#141517" }}
            >
              {tr("calendarPage.share")}
            </Button>
          </Tooltip>
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
          {tr("calendarPage.reset")}
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
    </>
  );
}
