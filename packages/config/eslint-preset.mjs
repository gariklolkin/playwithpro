// @ts-check
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";

/** Shared Prettier integration for ESLint flat configs across apps. */
export const prettierPreset = [
  eslintPluginPrettierRecommended,
  {
    rules: {
      "prettier/prettier": ["error", { endOfLine: "auto" }],
    },
  },
];
