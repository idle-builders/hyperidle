// ESLint covers ONLY what Biome cannot:
//   - React Compiler (no Biome equivalent)
//   - React hooks exhaustive-deps (Biome's version is partial)
//   - Drizzle ORM safety (no Biome equivalent)
//
// Biome remains primary for everything else (formatting, style, correctness, a11y, security).

import tsParser from "@typescript-eslint/parser";
import design from "eslint-plugin-design";
import drizzle from "eslint-plugin-drizzle";
import reactCompiler from "eslint-plugin-react-compiler";
import reactHooks from "eslint-plugin-react-hooks";

export default [
	{
		ignores: [
			"**/node_modules/**",
			"**/dist/**",
			"**/.worktrees/**",
			"**/.claude/**",
			"**/coverage/**",
		],
	},

	// React Compiler + Hooks (web package)
	{
		files: ["packages/web/src/**/*.{ts,tsx}"],
		languageOptions: {
			parser: tsParser,
			parserOptions: {
				ecmaFeatures: { jsx: true },
			},
		},
		plugins: {
			"react-hooks": reactHooks,
			"react-compiler": reactCompiler,
		},
		rules: {
			"react-hooks/rules-of-hooks": "error",
			"react-hooks/exhaustive-deps": "warn",
			"react-compiler/react-compiler": "warn",
		},
	},

	// Drizzle ORM safety (db + server packages)
	{
		files: ["packages/db/src/**/*.ts", "packages/server/src/**/*.ts"],
		languageOptions: {
			parser: tsParser,
		},
		plugins: {
			drizzle,
		},
		rules: {
			"drizzle/enforce-delete-with-where": ["error", { drizzleObjectName: "db" }],
			"drizzle/enforce-update-with-where": ["error", { drizzleObjectName: "db" }],
		},
	},

	// K6 — Design lint rules. All warn-level for now; K8 promotes to error
	// once the codebase is clean. Source of truth for every value: AESTHETICS.md
	// + tokens.css.
	{
		files: ["packages/web/src/**/*.tsx", "packages/design-system/src/**/*.tsx"],
		ignores: [
			"packages/design-system/src/**/*.stories.tsx",
			"packages/web/src/**/*.stories.tsx",
		],
		languageOptions: {
			parser: tsParser,
			parserOptions: {
				ecmaFeatures: { jsx: true },
			},
		},
		plugins: { design },
		rules: {
			"design/no-hardcoded-color": "warn",
			"design/no-off-grid-spacing": "warn",
			"design/no-off-scale-radius": "warn",
			"design/no-off-scale-font-size": "warn",
			"design/no-ai-aesthetic": "warn",
			"design/no-raw-tailwind-color": "warn",
			"design/require-ds-attribute": "warn",
			"design/require-stories-sibling": "warn",
			"design/require-focus-on-interactive": "warn",
		},
	},
];
