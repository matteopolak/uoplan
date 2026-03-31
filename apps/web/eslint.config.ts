import { defineConfig } from "eslint/config";
import pluginLingui from "eslint-plugin-lingui";
import reactHooks from "eslint-plugin-react-hooks";
import { baseConfig } from "../../eslint.config.ts";

export default defineConfig([
  ...baseConfig,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: reactHooks.configs.recommended.rules,
  },
  pluginLingui.configs["flat/recommended"],
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "lingui/no-unlocalized-strings": "error",
      "lingui/no-expression-in-message": "off",
    },
  },
]);
