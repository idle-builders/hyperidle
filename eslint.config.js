// ESLint covers ONLY what Biome cannot:
//   - React Compiler (no Biome equivalent)
//   - React hooks exhaustive-deps (Biome's version is partial)
//   - Drizzle ORM safety (no Biome equivalent)
//   - TypeScript type-safety escape hatches (api-typesafety workpackage)
//
// Biome remains primary for everything else (formatting, style, correctness, a11y, security).

import tsParser from "@typescript-eslint/parser";
import design from "eslint-plugin-design";
import drizzle from "eslint-plugin-drizzle";
import reactCompiler from "eslint-plugin-react-compiler";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

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

	// api-typesafety: TypeScript-ESLint rules that block type-safety bypass
	// escape hatches in the server and web packages.
	//
	// Rules enforced:
	//   @typescript-eslint/no-explicit-any     — ban `any` type
	//   @typescript-eslint/no-unsafe-assignment — ban assigning `any`-typed values
	//   @typescript-eslint/no-unsafe-return     — ban returning `any` from typed fns
	//   @typescript-eslint/no-unsafe-member-access — ban member access on `any`
	//
	// Warn-level so the baseline does not break during the migration window;
	// will promote to error once the remaining offenders are cleared.
	{
		files: ["packages/server/src/**/*.ts", "packages/web/src/**/*.{ts,tsx}"],
		ignores: [
			"packages/server/src/**/__tests__/**",
			"packages/server/src/**/*.test.ts",
			"packages/server/src/**/*.spec.ts",
			"packages/web/src/**/__tests__/**",
			"packages/web/src/**/*.test.{ts,tsx}",
			"packages/web/src/**/*.spec.{ts,tsx}",
		],
		languageOptions: {
			parser: tsParser,
		},
		plugins: {
			"@typescript-eslint": tseslint.plugin,
		},
		rules: {
			"@typescript-eslint/no-explicit-any": "warn",
			"@typescript-eslint/no-unsafe-assignment": "warn",
			"@typescript-eslint/no-unsafe-return": "warn",
			"@typescript-eslint/no-unsafe-member-access": "warn",
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

	// M1 — Mock-data guard (warn-level baseline). Promotion to error is M4.
	// Both rules share one block: same file set, same ignores.
	// The existing L16 no-restricted-imports block stays unchanged — it fires at
	// error for __fixtures__/ imports. This rule layers on top with broader
	// coverage (also catches fixtures/ without double-underscore) at warn.
	{
		files: ["packages/web/src/**/*.{ts,tsx}", "packages/server/src/**/*.ts"],
		ignores: [
			"packages/web/src/**/*.stories.tsx",
			"packages/web/src/**/__tests__/**",
			"packages/web/src/**/*.test.{ts,tsx}",
			"packages/web/src/**/*.spec.{ts,tsx}",
			"packages/web/src/**/__fixtures__/**",
			"packages/web/src/**/e2e/**",
			"packages/server/src/**/__tests__/**",
			"packages/server/src/**/*.test.ts",
			"packages/server/src/**/*.spec.ts",
			"packages/server/src/**/__fixtures__/**",
			"packages/server/src/**/e2e/**",
			"packages/server/src/**/seed*.ts",
		],
		languageOptions: {
			parser: tsParser,
			parserOptions: {
				ecmaFeatures: { jsx: true },
			},
		},
		plugins: { design },
		rules: {
			"design/no-mock-data-import": "error",
			"design/no-mock-data-symbol": "error",
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

	// api-typesafety Rule 3 (warn): Discourage imperative router.get/post/… pattern in route files.
	// Routes should use the Hono chaining pattern (.get().post()…) so the return type is
	// inferred as a union of typed routes — required for AppType / hono/client.
	{
		files: ["packages/server/src/routes/**/*.ts"],
		languageOptions: {
			parser: tsParser,
		},
		rules: {
			"no-restricted-syntax": [
				"warn",
				{
					selector:
						"CallExpression[callee.type='MemberExpression'][callee.property.name=/^(get|post|put|patch|delete|options|head|all|use)$/][callee.object.name='router']",
					message:
						"api-typesafety Rule 3: Use the Hono chaining pattern (new Hono().get()…) instead of router.get(). The chained form preserves typed route inference for AppType.",
				},
			],
		},
	},

	// api-typesafety Rule 4 (warn): Discourage importing the legacy services/api-fetch module
	// from web package code. Prefer the typed hono/client via packages/web/src/api/client.ts.
	{
		files: ["packages/web/src/**/*.{ts,tsx}"],
		ignores: [
			"packages/web/src/**/*.stories.tsx",
			"packages/web/src/**/*.test.ts",
			"packages/web/src/**/*.test.tsx",
		],
		languageOptions: {
			parser: tsParser,
			parserOptions: {
				ecmaFeatures: { jsx: true },
			},
		},
		rules: {
			"no-restricted-imports": [
				"warn",
				{
					patterns: [
						{
							group: ["**/services/api-fetch", "**/services/api-fetch/**"],
							message:
								"api-typesafety Rule 4: Import from @/api/client instead of services/api-fetch. The typed hono/client enforces contract safety.",
						},
					],
				},
			],
		},
	},

	// api-typesafety Rule 5 (error): Ban raw fetch('/api/…') calls in web package.
	// All API calls must go through the typed hono/client so TypeScript can verify
	// request/response shapes at compile time.
	{
		files: ["packages/web/src/**/*.{ts,tsx}"],
		ignores: [
			"packages/web/src/api/client.ts",
			"packages/web/src/**/*.test.ts",
			"packages/web/src/**/*.test.tsx",
		],
		languageOptions: {
			parser: tsParser,
			parserOptions: {
				ecmaFeatures: { jsx: true },
			},
		},
		rules: {
			"no-restricted-syntax": [
				"error",
				{
					selector: "CallExpression[callee.name='fetch'] > Literal[value=/^\\/api\\//]",
					message:
						"api-typesafety Rule 5: Use the typed hono/client from @/api/client instead of raw fetch('/api/…'). Raw fetch bypasses type-safety.",
				},
				{
					selector:
						"CallExpression[callee.name='fetch'] > TemplateLiteral > TemplateElement[value.raw=/^\\/api\\//]",
					message:
						"api-typesafety Rule 5: Use the typed hono/client from @/api/client instead of raw fetch('/api/…'). Raw fetch bypasses type-safety.",
				},
			],
		},
	},

	// api-typesafety Rule 6 (error): Ban zValidator from @hono/zod-validator in route files.
	// Use the internal validateBody() helper (packages/server/src/middleware/validate.ts) which
	// integrates with the response-validator middleware and error schema.
	{
		files: ["packages/server/src/routes/**/*.ts"],
		languageOptions: {
			parser: tsParser,
		},
		rules: {
			"no-restricted-imports": [
				"error",
				{
					paths: [
						{
							name: "@hono/zod-validator",
							message:
								"api-typesafety Rule 6: Use validateBody() from ../middleware/validate.js instead of zValidator. It integrates with the response-validator and error schema.",
						},
					],
				},
			],
		},
	},

	// api-typesafety Rule 7 (error): Ban importing @hyperidle/server from the web package
	// (except schema files). The web package must only consume the server via the typed
	// hono/client — not by importing server internals directly.
	//
	// The client.ts file is the ONLY file allowed to import from @hyperidle/server/schemas
	// (it uses AppType for hc<AppType>). All other web code must go through @/api/client.
	{
		files: ["packages/web/src/**/*.{ts,tsx}"],
		ignores: [
			// client.ts legitimately imports AppType from @hyperidle/server/schemas
			"packages/web/src/api/client.ts",
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
							// Ban any @hyperidle/server import (including subpaths like /schemas)
							// from general web code. Only client.ts (ignored above) may import /schemas.
							group: ["@hyperidle/server", "@hyperidle/server/**"],
							message:
								"api-typesafety Rule 7: The web package must not import @hyperidle/server internals directly. Use the typed hono/client from @/api/client. Only packages/web/src/api/client.ts may import @hyperidle/server/schemas.",
						},
					],
				},
			],
		},
	},

	// api-typesafety Rule 8 (error): Ban unsafe type casts in web package.
	// Patterns like `as Promise<`, `as any`, and `res.json() as` hide type errors
	// that the hono/client already prevents — using them defeats the purpose of typed API calls.
	{
		files: ["packages/web/src/**/*.{ts,tsx}"],
		ignores: ["packages/web/src/**/*.test.ts", "packages/web/src/**/*.test.tsx"],
		languageOptions: {
			parser: tsParser,
			parserOptions: {
				ecmaFeatures: { jsx: true },
			},
		},
		rules: {
			"no-restricted-syntax": [
				// warn-level: existing hooks still use `res.json() as Promise<T>` patterns
				// that predate the typed hono/client. Promote to error once the baseline is cleared.
				"warn",
				{
					selector: "TSAsExpression > TSTypeReference[typeName.name='Promise']",
					message:
						"api-typesafety Rule 8: Casting to Promise<T> hides async type errors. Use the typed hono/client — it returns correctly-typed promises.",
				},
				{
					selector: "TSAsExpression > TSAnyKeyword",
					message: "api-typesafety Rule 8: 'as any' defeats TypeScript. Prove the type instead.",
				},
			],
		},
	},
];
