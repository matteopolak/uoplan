import { describe, expect, it } from "vitest";
import {
  detectPreferredLocale,
  normalizeLocale,
  type AppLocale,
} from "./index";

describe("normalizeLocale", () => {
  it("maps fr and fr-* to fr-CA", () => {
    expect(normalizeLocale("fr")).toBe("fr-CA");
    expect(normalizeLocale("fr-CA")).toBe("fr-CA");
    expect(normalizeLocale("fr-FR")).toBe("fr-CA");
  });

  it("maps english and unknown locales to en", () => {
    expect(normalizeLocale("en")).toBe("en");
    expect(normalizeLocale("en-US")).toBe("en");
    expect(normalizeLocale("es-MX")).toBe("en");
    expect(normalizeLocale("")).toBe("en");
  });
});

describe("detectPreferredLocale", () => {
  it("prefers stored locale when available", () => {
    const stored: AppLocale = "fr-CA";
    expect(
      detectPreferredLocale({
        storedLocale: stored,
        navigatorLocales: ["en-CA"],
      }),
    ).toBe("fr-CA");
  });

  it("falls back to navigator locales when storage is missing", () => {
    expect(
      detectPreferredLocale({
        navigatorLocales: ["fr-FR", "en-CA"],
      }),
    ).toBe("fr-CA");
  });

  it("falls back to english when nothing matches", () => {
    expect(
      detectPreferredLocale({
        navigatorLocales: ["es-MX", "de-DE"],
      }),
    ).toBe("en");
  });
});
