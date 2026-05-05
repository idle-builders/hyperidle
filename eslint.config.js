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

	// Track-L recurrence — `design/no-raw-actor-fetch` enforces that any
	// fetch('/api/...') in the web package goes through useRecoveryFetch (or a
	// sibling actor-aware helper in `packages/web/src/hooks/`). Detected on
	// L2/L4/L7 (X-Actor-Id silently dropped). Wired at warn-level for now;
	// promotes to error in the next track once the existing-offender baseline
	// is cleared. The rule itself allowlists `hooks/`, `__tests__/`, and `*.spec.*`.
	{
		files: ["packages/web/src/**/*.{ts,tsx}"],
		ignores: [
			"packages/web/src/**/*.stories.tsx",
			"packages/web/src/**/__tests__/**",
			"packages/web/src/**/*.spec.{ts,tsx}",
			"packages/web/src/**/*.test.{ts,tsx}",
			// Hooks ARE the actor-aware wrappers — they legitimately call fetch
			// and define the helper boundary the rule defends.
			"packages/web/src/hooks/**",
		],
		languageOptions: {
			parser: tsParser,
			parserOptions: {
				ecmaFeatures: { jsx: true },
			},
		},
		plugins: { design },
		rules: {
			"design/no-raw-actor-fetch": "warn",
		},
	},

	// K6 — Design lint rules for the web package. All warn-level: the wider
	// codebase still has documented backlog (see eslint-plugin-design/waivers.md).
	{
		files: ["packages/web/src/**/*.tsx"],
		ignores: ["packages/web/src/**/*.stories.tsx"],
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
			// K11 — density-aware drift prevention. `use-density-tokens` warns
			// in web because the density-aware web composites are still being
			// brought up; `no-density-tokens` warns at composite level but
			// errors at shell level (see separate block below for shells).
			"design/use-density-tokens": "warn",
			"design/no-density-tokens": "warn",
		},
	},

	// K11 — `design/no-density-tokens` errors for `packages/web/src/shell/**`
	// because IconRail (the canonical density-static shell, § 3.3.K1 + § 5.6)
	// must NEVER consume density tokens. This block layers on top of the
	// general web block above to upgrade the rule level for shell files.
	{
		files: ["packages/web/src/shell/**/*.tsx"],
		ignores: ["packages/web/src/shell/**/*.stories.tsx"],
		languageOptions: {
			parser: tsParser,
			parserOptions: {
				ecmaFeatures: { jsx: true },
			},
		},
		plugins: { design },
		rules: {
			"design/no-density-tokens": "error",
		},
	},

	// K8 — Design lint rules for the design-system package. Rules with zero
	// surviving warnings post-K7 are promoted to `error` here; the two rules
	// with documented designer-call exceptions remain `warn`. See
	// `packages/eslint-plugin-design/waivers.md` for the per-warning waiver
	// list.
	{
		files: ["packages/design-system/src/**/*.tsx"],
		ignores: ["packages/design-system/src/**/*.stories.tsx"],
		languageOptions: {
			parser: tsParser,
			parserOptions: {
				ecmaFeatures: { jsx: true },
			},
		},
		plugins: { design },
		rules: {
			// Promoted to error — clean post-K7 in design-system.
			"design/no-hardcoded-color": "error",
			"design/no-off-scale-radius": "error",
			"design/no-off-scale-font-size": "error",
			"design/no-raw-tailwind-color": "error",
			"design/require-ds-attribute": "error",
			"design/require-stories-sibling": "error",
			"design/require-focus-on-interactive": "error",
			// Stay at warn — see waivers.md for the surviving documented exceptions.
			"design/no-off-grid-spacing": "warn",
			"design/no-ai-aesthetic": "warn",
			// K11 — both density rules error in design-system per the spec
			// ("error for packages/design-system/src/**"). Density-static
			// primitives (StatusChip, Tag) MUST NOT consume density tokens;
			// density-aware primitives MUST consume them.
			"design/use-density-tokens": "error",
			"design/no-density-tokens": "error",
		},
	},

	// L16 AC-3: production code in packages/web/src/ must NOT import values
	// from any __fixtures__/ directory. Stories (*.stories.tsx) and tests
	// (*.test.ts, *.test.tsx) are exempt; they are whitelisted by file pattern
	// in the override below. The fixtures file itself is also exempt.
	{
		files: ["packages/web/src/**/*.{ts,tsx}"],
		ignores: [
			"packages/web/src/**/*.stories.tsx",
			"packages/web/src/**/*.test.ts",
			"packages/web/src/**/*.test.tsx",
			"packages/web/src/**/__fixtures__/**",
		],
		languageOptions: {
			parser: tsParser,
			parserOptions: {
				ecmaFeatures: { jsx: true },
			},
		},
		rules: {
			"no-restricted-imports": [
				"error",
				{
					patterns: [
						{
							group: ["**/__fixtures__/**", "**/__fixtures__"],
							message:
								"Production code must not import from __fixtures__/. Fixtures are stories/tests only (L16 AC-3). Use props (e.g. overrideBet) to inject test data.",
						},
					],
				},
			],
		},
	},
];
