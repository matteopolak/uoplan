import { defineConfig } from "eslint/config";
import pluginLingui from "eslint-plugin-lingui";
import reactHooks from "eslint-plugin-react-hooks";
import { baseConfig } from "../../eslint.config.ts";

export default defineConfig([
  ...baseConfig,
  reactHooks.configs.flat.recommended,
  pluginLingui.configs["flat/recommended"],
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "lingui/no-expression-in-message": "off",
      "@typescript-eslint/no-misused-promises": [
        "error",
        {
          checksVoidReturn: {
            attributes: false,
            arguments: false,
          },
        },
      ],
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/require-await": "off",
    },
  },
  {
    files: ["src/**/*.test.{ts,tsx}"],
    rules: {
      "@typescript-eslint/consistent-type-imports": "off",
    },
  },
]);
