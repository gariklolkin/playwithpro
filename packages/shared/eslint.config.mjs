// @ts-check
import eslint from "@eslint/js";
import { prettierPreset } from "@topspin/config/eslint-preset";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  ...prettierPreset,
);
