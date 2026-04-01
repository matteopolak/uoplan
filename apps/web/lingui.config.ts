import type { defineConfig } from "@lingui/cli";
import { formatter } from "@lingui/format-po";

const linguiConfig: Parameters<typeof defineConfig>[0] = {
  sourceLocale: "en",
  locales: ["en", "fr-CA"],
  format: formatter({
    explicitIdAsDefault: true,
  }),
  catalogs: [
    {
      path: "<rootDir>/src/locales/{locale}/messages",
      include: ["src"],
      exclude: ["**/*.test.ts", "**/*.test.tsx"],
    },
  ],
};

export default linguiConfig;
