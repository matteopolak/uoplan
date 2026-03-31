import { defineConfig } from "eslint/config";
import { baseConfig } from "../../eslint.config.ts";

export default defineConfig([
  ...baseConfig,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
  },
]);
