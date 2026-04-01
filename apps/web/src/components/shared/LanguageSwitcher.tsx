import { SegmentedControl } from "@mantine/core";
import { useLingui } from "@lingui/react";
import { dynamicActivate, tr, type AppLocale } from "../../i18n";

const OPTIONS = [
  { value: "en", label: "EN" },
  { value: "fr-CA", label: "FR-CA" },
];

interface LanguageSwitcherProps {
  onSwitch?: (locale: AppLocale) => void | Promise<void>;
}

export function LanguageSwitcher({ onSwitch }: LanguageSwitcherProps) {
  const { i18n } = useLingui();
  const locale = (i18n.locale || "en") as AppLocale;

  return (
    <SegmentedControl
      size="xs"
      radius={0}
      value={locale}
      onChange={(next) => {
        if (onSwitch) void onSwitch(next as AppLocale);
        else void dynamicActivate(next as AppLocale);
      }}
      data={OPTIONS}
      aria-label={tr("languageSwitcher.ariaLabel")}
    />
  );
}
