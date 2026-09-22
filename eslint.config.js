import tseslint from "typescript-eslint";

export default [
  { ignores: ["dist/**", "node_modules/**", ".strategy/**", "public/**", ".strategy-work/**"] },
  ...tseslint.configs.recommended,
];
