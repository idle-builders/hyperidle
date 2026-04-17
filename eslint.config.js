// ESLint covers ONLY what Biome cannot:
//   - React Compiler (no Biome equivalent)
//   - React hooks exhaustive-deps (Biome's version is partial)
//   - Drizzle ORM safety (no Biome equivalent)
//
// Biome remains primary for everything else (formatting, style, correctness, a11y, security).

import tsParser from "@typescript-eslint/parser";
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
];
