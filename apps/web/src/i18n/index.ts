import { i18n } from "@lingui/core";
import { detect, fromNavigator, fromStorage } from "@lingui/detect-locale";

const LOCALE_STORAGE_KEY = "uoplan.lang";
export const APP_LOCALES = ["en", "fr-CA"] as const;
export type AppLocale = (typeof APP_LOCALES)[number];

const DEFAULT_LOCALE: AppLocale = "en";

function toSupportedLocale(raw: string | null | undefined): AppLocale | null {
  if (!raw) return null;
  const locale = raw.trim().toLowerCase();
  if (locale === "fr" || locale.startsWith("fr-")) return "fr-CA";
  if (locale === "en" || locale.startsWith("en-")) return "en";
  return null;
}

export function normalizeLocale(raw: string | null | undefined): AppLocale {
  return toSupportedLocale(raw) ?? DEFAULT_LOCALE;
}

export function detectPreferredLocale(input: {
  storedLocale?: string | null;
  navigatorLocales?: readonly string[];
}): AppLocale {
  const stored = toSupportedLocale(input.storedLocale);
  if (stored) return stored;

  for (const locale of input.navigatorLocales ?? []) {
    const supported = toSupportedLocale(locale);
    if (supported) return supported;
  }

  return DEFAULT_LOCALE;
}

function readStoredLocale(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(LOCALE_STORAGE_KEY);
}

function readNavigatorLocales(): string[] {
  if (typeof window === "undefined") return [];

  const detected = detect(
    fromStorage(LOCALE_STORAGE_KEY),
    fromNavigator(),
    () => DEFAULT_LOCALE,
  );

  const browserLocales = window.navigator.languages?.length
    ? window.navigator.languages
    : [window.navigator.language];

  return [detected, ...browserLocales].filter(
    (v): v is string => typeof v === "string" && v.length > 0,
  );
}

async function loadCatalog(locale: AppLocale) {
  switch (locale) {
    case "fr-CA": {
      return import("../locales/fr-CA/messages.po");
    }
    case "en":
    default: {
      return import("../locales/en/messages.po");
    }
  }
}

export async function dynamicActivate(locale: AppLocale) {
  const { messages } = await loadCatalog(locale);
  i18n.load(locale, messages);
  i18n.activate(locale);

  if (typeof window !== "undefined") {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  }
}

export async function initializeI18n() {
  const locale = detectPreferredLocale({
    storedLocale: readStoredLocale(),
    navigatorLocales: readNavigatorLocales(),
  });
  await dynamicActivate(locale);
}

export function tr(
  id: string,
  values?: Record<string, unknown>,
): string {
  return i18n._({
    id,
    values,
  });
}

export { i18n };
