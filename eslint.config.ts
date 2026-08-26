// ESLint covers ONLY what Biome cannot:
//   - React Compiler (no Biome equivalent)
//   - React hooks exhaustive-deps (Biome's version is partial)
//   - Drizzle ORM safety (no Biome equivalent)
//   - TypeScript type-safety escape hatches (api-typesafety workpackage)
//
// Biome remains primary for everything else (formatting, style, correctness, a11y, security).

import tsParser from "@typescript-eslint/parser";
import authz from "eslint-plugin-authz";
import design from "eslint-plugin-design";
import { configs as designHearthConfigs } from "eslint-plugin-design/hearth-config";
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
			"**/.astro/**",
		],
	},

	// React Compiler + Hooks (web package)
	{
		files: ["layers/core-ui/src/**/*.{ts,tsx}"],
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
		files: ["framework/db/src/**/*.ts", "layers/core-api/src/**/*.ts"],
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
	// sibling actor-aware helper in `layers/core-ui/src/hooks/`). Detected on
	// L2/L4/L7 (X-Actor-Id silently dropped). Wired at warn-level for now;
	// promotes to error in the next track once the existing-offender baseline
	// is cleared. The rule itself allowlists `hooks/`, `__tests__/`, and `*.spec.*`.
	{
		files: ["layers/core-ui/src/**/*.{ts,tsx}"],
		ignores: [
			"layers/core-ui/src/**/*.stories.tsx",
			"layers/core-ui/src/**/__tests__/**",
			"layers/core-ui/src/**/*.test.{ts,tsx}",
			// Hooks ARE the actor-aware wrappers — they legitimately call fetch
			// and define the helper boundary the rule defends.
			"layers/core-ui/src/hooks/**",
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

	// AZ7: the K6 (core-ui) and K8 (design-system) design-lint blocks are
	// replaced by `eslint-plugin-design/hearth-config`'s `configs.hearth` — a
	// single severity table (`RULE_SEVERITY` in hearth-config.ts) that is total
	// over every rule the plugin exports, asserted by hearth-config.test.ts.
	// File globs and ignores are preserved verbatim from the blocks below (kept
	// here as historical reference — do not re-add them as a THIRD source of
	// truth for the same rules):
	//   K6 was `layers/core-ui/src/**/*.tsx` ignoring `*.stories.tsx`.
	//   K8 was `framework/design-system/src/**/*.tsx` ignoring `*.stories.tsx`.
	// @lore AF16 AC-2 (no-op-button) and AI2 AC-3/AC-5 (no-raw-overlay-z,
	// no-dialog-boilerplate) severities now live in hearth-config.ts's
	// RULE_SEVERITY table, same values as before this change.
	...designHearthConfigs.hearth,

	// K6-AC2 — Promote design/no-op-button to error for production pages and
	// components (excludes stories and test fixtures so false-positive test
	// <button>s don't pollute the gate). This makes AC-2 ("no button is a
	// no-op") an enforced gate: a future no-op in pages/** or components/**
	// fails lint, not just warns silently under --quiet.
	//
	// @lore AF16 AC-2: The K6 block above wires the rule at warn so it
	// surfaces backlog findings. This block promotes only the no-op-button
	// rule to error for the two highest-impact dirs (pages, components) while
	// exempting __tests__ and .stories.tsx — the rule's 13 false-positive
	// hits are all in test fixtures. Separate block so the promotion scope is
	// explicit and doesn't silently widen other warn-level rules.
	{
		files: ["layers/core-ui/src/pages/**/*.tsx", "layers/core-ui/src/components/**/*.tsx"],
		ignores: [
			"layers/core-ui/src/**/__tests__/**",
			"layers/core-ui/src/**/*.stories.tsx",
			"layers/core-ui/src/**/*.test.tsx",
		],
		languageOptions: {
			parser: tsParser,
			parserOptions: {
				ecmaFeatures: { jsx: true },
			},
		},
		plugins: { design },
		rules: {
			"design/no-op-button": "error",
		},
	},

	// AI7 — Page anatomy static gates (AC1 + AC3).
	//
	// no-undefined-font-heading (error on pages/**):
	//   ARM 1: `font-heading` — undefined Tailwind utility (defect anywhere; error here).
	//   ARM 2: `tracking-wider` — valid utility but a heading-scale deviation on pages/**;
	//          the rule's tracking-wider arm is internally self-gated to heading elements
	//          in pages/ paths, so this block never fires it on components or shell.
	//
	// no-handrolled-page-header (error on pages/**):
	//   Flags the inline page-title combo (text-[20px]+font-[600]+tracking-[-0.01em])
	//   on non-PageHeader elements. SettingsPage.tsx (AG7) and SetupFlow.tsx (onboarding)
	//   carry the combo but are NOT in AI7's migration scope — exempted via block ignores.
	//   Re-evaluate when AG7 / onboarding migrate.
	//   @lore AI7: ignore-vs-allowlist: a two-entry ignores is the minimal, explicit,
	//   greppable exemption that doesn't couple the rule scope to the migration list.
	//
	// no-handrolled-page-scaffold (error on pages/**, AZ2 AC5):
	//   Flags a hand-written scrolling page body (flex-1 + a scroll overflow, or
	//   flex-1 + overflow-hidden without flex-col). Unlike no-handrolled-page-header,
	//   this rule is NOT scoped to a migration subset — AZ2 Fork A1 migrated every
	//   page file onto <PageScaffold>, so the block's SettingsPage/SetupFlow
	//   ignores (page-header's own carve-out) simply never matter for this rule:
	//   neither file contains the flagged combo.
	{
		files: ["layers/core-ui/src/pages/**/*.tsx"],
		ignores: [
			"layers/core-ui/src/**/__tests__/**",
			"layers/core-ui/src/**/*.stories.tsx",
			"layers/core-ui/src/**/*.test.tsx",
			// AG7 + onboarding own these migrations — not in AI7 scope.
			"layers/core-ui/src/pages/SettingsPage.tsx",
			"layers/core-ui/src/pages/SetupFlow.tsx",
		],
		languageOptions: {
			parser: tsParser,
			parserOptions: {
				ecmaFeatures: { jsx: true },
			},
		},
		plugins: { design },
		rules: {
			"design/no-undefined-font-heading": "error",
			"design/no-handrolled-page-header": "error",
			"design/no-handrolled-page-scaffold": "error",
		},
	},

	// AI7 — no-undefined-font-heading at warn on the rest of layers/core-ui/src/**
	// (outside pages/**). The `font-heading` arm fires everywhere because it is
	// an undefined utility (defect). The `tracking-wider` arm is self-gated to
	// /pages/ path segments inside the rule, so this warn-level block never
	// triggers it for components, shell, or design-system files.
	// ~8 intentional tracking-wider usages in non-pages files are NOT flagged.
	{
		files: ["layers/core-ui/src/**/*.tsx"],
		ignores: [
			"layers/core-ui/src/pages/**",
			"layers/core-ui/src/**/__tests__/**",
			"layers/core-ui/src/**/*.stories.tsx",
			"layers/core-ui/src/**/*.test.tsx",
		],
		languageOptions: {
			parser: tsParser,
			parserOptions: {
				ecmaFeatures: { jsx: true },
			},
		},
		plugins: { design },
		rules: {
			"design/no-undefined-font-heading": "warn",
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
		files: ["layers/core-api/src/**/*.ts", "layers/core-ui/src/**/*.{ts,tsx}"],
		ignores: [
			"layers/core-api/src/**/__tests__/**",
			"layers/core-api/src/**/*.test.ts",
			"layers/core-ui/src/**/__tests__/**",
			"layers/core-ui/src/**/*.test.{ts,tsx}",
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

	// K8 (design-system's design-lint block) is folded into the AZ7
	// `designHearthConfigs.hearth` spread near the top of this file — see the
	// AZ7 comment above the K6/K8 replacement for what moved where. See
	// `tools/eslint-plugin-design/waivers.md` for the per-warning waiver list.

	// M1 — Mock-data guard (warn-level baseline). Promotion to error is M4.
	// Both rules share one block: same file set, same ignores.
	// The existing L16 no-restricted-imports block stays unchanged — it fires at
	// error for __fixtures__/ imports. This rule layers on top with broader
	// coverage (also catches fixtures/ without double-underscore) at warn.
	{
		files: ["layers/core-ui/src/**/*.{ts,tsx}", "layers/core-api/src/**/*.ts"],
		ignores: [
			"layers/core-ui/src/**/*.stories.tsx",
			"layers/core-ui/src/**/__tests__/**",
			"layers/core-ui/src/**/*.test.{ts,tsx}",
			"layers/core-ui/src/**/__fixtures__/**",
			"layers/core-api/src/**/__tests__/**",
			"layers/core-api/src/**/*.test.ts",
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

	// L16 AC-3: production code in layers/core-ui/src/ must NOT import values
	// from any __fixtures__/ directory. Stories (*.stories.tsx) and tests
	// (*.test.ts, *.test.tsx) are exempt; they are whitelisted by file pattern
	// in the override below. The fixtures file itself is also exempt.
	{
		files: ["layers/core-ui/src/**/*.{ts,tsx}"],
		ignores: [
			"layers/core-ui/src/**/*.stories.tsx",
			"layers/core-ui/src/**/*.test.ts",
			"layers/core-ui/src/**/*.test.tsx",
			"layers/core-ui/src/**/__fixtures__/**",
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
		files: ["layers/core-api/src/routes/**/*.ts"],
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
	// from web package code. Prefer the typed hono/client via layers/core-ui/src/api/client.ts.
	{
		files: ["layers/core-ui/src/**/*.{ts,tsx}"],
		ignores: [
			"layers/core-ui/src/**/*.stories.tsx",
			"layers/core-ui/src/**/*.test.ts",
			"layers/core-ui/src/**/*.test.tsx",
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
		files: ["layers/core-ui/src/**/*.{ts,tsx}"],
		ignores: ["layers/core-ui/src/**/*.test.ts", "layers/core-ui/src/**/*.test.tsx"],
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
	// Use the internal validateBody() helper (layers/core-api/src/middleware/validate.ts) which
	// integrates with the response-validator middleware and error schema.
	{
		files: ["layers/core-api/src/routes/**/*.ts"],
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

	// api-typesafety Rule 7 (error): Ban importing @hyperidle/core-api from the web package
	// (except schema files). The web package must only consume the server via the typed
	// hono/client — not by importing server internals directly.
	//
	// The client.ts file is the ONLY file allowed to import from @hyperidle/core-api/schemas
	// (it uses AppType for hc<AppType>). All other web code must go through @/api/client.
	{
		files: ["layers/core-ui/src/**/*.{ts,tsx}"],
		// @lore AU28 Ruling 4.1: the `layers/core-ui/src/api/client.ts` carve-out that used
		// to sit here is gone with the file. It was a dead Hono RPC client (zero call
		// sites, `AppType = Hono` with zero route inference) whose only remaining effect
		// was to require an exemption from this very rule.
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
							// Ban any @hyperidle/core-api import (including subpaths like /schemas)
							// from general web code. Only client.ts (ignored above) may import /schemas.
							group: ["@hyperidle/core-api", "@hyperidle/core-api/**"],
							message:
								"api-typesafety Rule 7: the web package must not import @hyperidle/core-api internals directly.",
						},
					],
				},
			],
		},
	},

	// AF11 — Authorization boundary enforcement (Hard Rules 2 + 6).
	// Scoped to route files only. Tests and utility files excluded.
	//   authz/no-header-identity-in-authz        — Hard Rule 2: no header in authz sink
	//   authz/no-raw-db-in-route-bypassing-policy — Hard Rule 6: enforced routes need authorizeRead/Write
	// @lore AU26 A1: the glob covers BOTH applications' route directories. AF11 is a
	// property of a route, not of a package — once requireBoundary lived in
	// `@hyperidle/http-middleware` an `agent-orchestration` route could declare a boundary.
	// requireBoundary is now deleted; the no-raw-db rule becomes a no-op until it is
	// rekeyed on authorizeRead/Write presence at A7.
	{
		files: [
			"layers/core-api/src/routes/**/*.ts",
			"layers/agent-orchestration/**/routes/**/*.ts",
			"layers/agent-execution/**/routes/**/*.ts",
		],
		ignores: [
			"layers/core-api/src/routes/**/__tests__/**",
			"layers/core-api/src/routes/**/*.test.ts",
			"layers/core-api/src/routes/**/*.integration.test.ts",
			"layers/agent-orchestration/**/routes/**/__tests__/**",
			"layers/agent-orchestration/**/routes/**/*.test.ts",
		],
		languageOptions: {
			parser: tsParser,
		},
		plugins: { authz },
		rules: {
			"authz/no-header-identity-in-authz": "error",
			"authz/no-raw-db-in-route-bypassing-policy": "error",
		},
	},

	// api-typesafety Rule 8 (error): Ban unsafe type casts in web package.
	// Patterns like `as Promise<`, `as any`, and `res.json() as` hide type errors
	// that the hono/client already prevents — using them defeats the purpose of typed API calls.
	{
		files: ["layers/core-ui/src/**/*.{ts,tsx}"],
		ignores: ["layers/core-ui/src/**/*.test.ts", "layers/core-ui/src/**/*.test.tsx"],
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

	// A route or tool handler composes no roster and hard-codes no persona.
	//
	// Two orthogonal mechanisms, neither substituting for the other:
	//
	// (a) no-restricted-imports bans `defaultRoster` from @hyperidle/factory-defaults in these
	//     surfaces. Roster composition belongs to `framework/factory-defaults/src/agent-scaffold.ts`,
	//     its one legitimate caller. Not vacuous: `teams-routes.ts` and `create-team.ts`
	//     genuinely imported it before the ban landed.
	//
	// (b) no-restricted-syntax bans an inline persona / system-prompt const
	//     (`*_SYSTEM_PROMPT`, `BUILTIN_*PROMPT`, `PERSONA*`). The import ban cannot see a
	//     module-local const, so this selector is what actually holds the line. Prompt
	//     content belongs in `docs/system-prompts/*.md`, read through
	//     `SYSTEM_PROMPT_TEMPLATE_FILES`; an inline copy silently drifts from it.
	//
	// @lore AU28 step 6: this guard used to be phrased as "the Kernel must not do X, the
	// Strategy owns X" and pointed callers at `getActiveStrategy().scaffoldAgents()`. The
	// Strategy concept is dead (founder, 2026-08-04) and that API no longer exists, so the
	// messages named a destination nobody could go to. The RULES are unchanged and still
	// match real files — only the justification was rewritten to the reason that survives:
	// one composition path, one home for prompt text. Rules retired outright in the same
	// pass — the AK2 strategy-port ban and the AU3 fabric/strategy import ban — were
	// deleted rather than rephrased because every package, symbol and exempted file they
	// named was already gone; they matched nothing and would have passed forever.
	{
		// @lore AU19 Increment 4: `layers/core-api/src/tools/**` (the domain-
		// touching tool bodies) moved to `agent-orchestration/tool-handlers` —
		// creation surfaces now live there, not under `packages/server`.
		files: [
			"layers/core-api/src/routes/**/*.ts",
			"layers/agent-orchestration/tool-handlers/src/**/*.ts",
		],
		ignores: [
			"layers/core-api/src/routes/**/__tests__/**",
			"layers/core-api/src/routes/**/*.test.ts",
			"layers/agent-orchestration/tool-handlers/src/__tests__/**",
			"layers/agent-orchestration/tool-handlers/src/**/*.test.ts",
		],
		languageOptions: {
			parser: tsParser,
		},
		rules: {
			"no-restricted-imports": [
				"error",
				{
					paths: [
						{
							name: "@hyperidle/domain-model",
							importNames: ["defaultRoster"],
							message:
								"A route or tool handler must not compose a roster. Roster composition belongs to the agent-scaffolding path (layers/core-api/org/src/resolve-scaffold-specs.ts) and to team setup (layers/core-ui/src/pages/SetupFlow.tsx) — the two legitimate callers of defaultRoster(). AU44: this rule named @hyperidle/factory-defaults until that package was dissolved; defaultRoster now lives in domain-model, which these surfaces already import, so the old spelling banned nothing.",
						},
					],
				},
			],
			"no-restricted-syntax": [
				"error",
				{
					// Catches: const BUILTIN_ASSISTANT_SYSTEM_PROMPT = "..."
					//          const MY_PERSONA = "..."
					//          const X_SYSTEM_PROMPT = "..."
					// initialized with a string literal — inline persona/roster const.
					selector:
						"VariableDeclarator[id.name=/_SYSTEM_PROMPT$|^BUILTIN_.*PROMPT$|PERSONA/i][init.type='Literal']",
					message:
						"No inline persona or system-prompt const. Prompt content lives in docs/system-prompts/*.md, read through SYSTEM_PROMPT_TEMPLATE_FILES — an inline copy drifts from the file everything else reads.",
				},
			],
		},
	},

	// AI3 — One-clock static gate (AC-2/AC-5).
	//
	// Bans two categories of local timestamp formatting in layers/core-ui/src + framework/design-system/src:
	//
	// 1. toLocale* calls on a Date receiver (new Date(...).toLocale*)
	//    Selector is pinned to the inline `new Date(…).toLocale*` construction to avoid
	//    false-positives on Number.prototype.toLocaleString (number formatting) and on the
	//    six exempt ms-arithmetic sites (sort comparators, window checks, UI timers, ID gen).
	//    The six exempt sites use Date.now()/getTime() for computation, not for rendering via
	//    toLocale* — they are NOT in scope of this rule.
	//    Allow-list: framework/presentation-format/src/format/time.ts is the one permitted formatting module.
	//
	// 2. Imports of the deleted utils/format-time or utils/relative-time paths (dead-import ban).
	//    Prevents resurrection of the deleted files under any import depth.
	//
	// @lore AI3: The arithmetic half of AC-2 ("no surface computes time for display locally")
	// is NOT statically expressible — Date-diff arithmetic and sort/group/timer arithmetic
	// share the same AST. The ban covers only what is architecturally distinguishable:
	// toLocale* rendering on a Date receiver. See plans/AI3/architecture.md §"AC-2/AC-5 static gate (split)".
	{
		files: ["layers/core-ui/src/**/*.{ts,tsx}"],
		ignores: [
			// The one module permitted to call toLocale* for formatting
			"layers/core-ui/src/utils/time.ts",
			// Stories and tests are exempt from the display-formatting gate
			"layers/core-ui/src/**/*.stories.tsx",
			"layers/core-ui/src/**/__tests__/**",
			"layers/core-ui/src/**/*.test.{ts,tsx}",
		],
		languageOptions: {
			parser: tsParser,
			parserOptions: {
				ecmaFeatures: { jsx: true },
			},
		},
		rules: {
			// Dead-import ban: the deleted file names must not resurrect
			"no-restricted-imports": [
				"error",
				{
					patterns: [
						{
							group: ["**/utils/format-time", "**/utils/format-time/**"],
							message:
								"AI3: utils/format-time is deleted. Use relativeShort/relativeLong/absoluteDate/absoluteDateTime/clockTime from @hyperidle/presentation-format.",
						},
						{
							group: ["**/utils/relative-time", "**/utils/relative-time/**"],
							message:
								"AI3: utils/relative-time is deleted. Use relativeShort/relativeLong from @hyperidle/presentation-format.",
						},
					],
				},
			],
			// toLocale* on inline new Date(...) receiver — display formatting ban.
			// Pinned to CallExpression with MemberExpression callee whose object is
			// a NewExpression constructing Date. This avoids false-positives on
			// Number.toLocaleString and on bare Date.now()/getTime() arithmetic.
			"no-restricted-syntax": [
				"error",
				{
					selector:
						"CallExpression[callee.type='MemberExpression'][callee.property.name=/^(toLocaleDateString|toLocaleTimeString|toLocaleString)$/][callee.object.type='NewExpression'][callee.object.callee.name='Date']",
					message:
						"AI3: Use the one time formatter (relativeShort/relativeLong/absoluteDate/absoluteDateTime/clockTime from @hyperidle/presentation-format) instead of new Date(...).toLocale*(). AC-2 one-clock gate.",
				},
			],
		},
	},

	// no-unknown-cast — ban `X as unknown as T` double-assertions across all
	// product source. Laundering a value through `unknown` defeats the type
	// checker (.claude/rules/typescript.md: "no unsafe `as` casts"); real bugs
	// have shipped behind it. A dedicated `design/no-unknown-cast` rule (not
	// `no-restricted-syntax`) is used so it does not clobber the other
	// no-restricted-syntax blocks above on overlapping files.
	//
	// Production-only: tests, stories, specs, fixtures, e2e, and _dev dirs are
	// exempt — mock/fixture construction legitimately fabricates partial shapes.
	{
		files: ["{layers,framework,applications,tools}/*/src/**/*.{ts,tsx}"],
		ignores: [
			"{layers,framework,applications,tools}/*/src/**/__tests__/**",
			"{layers,framework,applications,tools}/*/src/**/*.test.{ts,tsx}",
			"{layers,framework,applications,tools}/*/src/**/*.stories.tsx",
			"{layers,framework,applications,tools}/*/src/**/__fixtures__/**",
			"{layers,framework,applications,tools}/*/src/**/_dev/**",
		],
		languageOptions: {
			parser: tsParser,
			parserOptions: {
				ecmaFeatures: { jsx: true },
			},
		},
		plugins: { design },
		rules: {
			"design/no-unknown-cast": "error",
		},
	},

	// AJ3: the isolation harness (layers/core-ui/src/__preview__/**) is a dev/story/test
	// surface. It must NEVER reach a backend — importing @hyperidle/core-api or
	// @hyperidle/db would defeat the no-backend contract that lets a design mount
	// in jsdom with no server, db, or real data. Static "must not
	// import X" property → lint rule, not a test (CLAUDE.md). Shape copied from
	// the __fixtures__ no-restricted-imports block.
	//
	// @lore AJ3: placed LAST in the config array on purpose. ESLint flat config
	// REPLACES (does not merge) a rule's options when a later config object
	// re-sets the same rule for overlapping files. Several broader
	// `layers/core-ui/src/**` blocks set `no-restricted-imports` (fixtures ban,
	// api-typesafety server ban, format-time dead-import ban) — being last makes
	// THIS block authoritative for preview/**, so it must re-state the full
	// server+db ban itself rather than relying on any earlier block.
	{
		files: ["layers/core-ui/src/__preview__/**/*.{ts,tsx}"],
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
							group: [
								"@hyperidle/core-api",
								"@hyperidle/core-api/**",
								"@hyperidle/db",
								"@hyperidle/db/**",
							],
							message:
								"AJ3: the isolation harness (preview/**) must not import a backend. The no-backend contract lets a design mount with no server/db/real data. Use fixtures + thin mock providers.",
						},
					],
				},
			],
		},
	},

	// AM4 — Descriptor-driven contract guard (AC2 static half).
	//
	// The presentation layer (harness-presentation.ts, SettingsHarnesses.tsx)
	// must contain ZERO per-backend string literal
	// comparisons — the entire surface is descriptor-driven.
	//
	// The ONLY allowed type literal is "builtin" — it is the intentional
	// founder-rule exemption in showsToggle (NOT disableable) and is paired
	// with the select() hard-exemption in adapter-pool.ts (AM4 Seam 2).
	//
	// All other harness type strings (claude-code, codex, opencode, cursor-agent…)
	// are banned so a new backend can be added to the descriptor without touching
	// any presentation file.
	//
	// Scoped to production code only — stories and tests are exempt.
	// @lore AU1's decomposition guard — "decomposition may create an
	// AgentSessionRequest but must not select an AdapterPool or call
	// startSession" — lived here, scoped solely to
	// `layers/core-api/work/src/bet-decomposition.ts`. Bet decomposition was
	// deleted (AU21 Decision I; migration 0053 dropped the columns) and the
	// block was left behind matching no file, which ESLint treats as a silent
	// no-op. Removed rather than repointed: the boundary it protected belonged
	// to a feature that no longer exists.

	// AM1 W1 — the source-agnostic Part renderer boundary (AC5).
	// PartList.tsx + parts/** render ONLY the source-agnostic `Part`/`Embed`/
	// `OpenTarget` Part vocabulary. They must NEVER import a SOURCE type —
	// `Message`/`InlineRef`/`thread*` or any `harness` path — so a second
	// adapter (AM3's session adapter) can feed the SAME renderer with zero
	// change. A static "must not import X" property is a lint rule, not a test
	// (CLAUDE.md). The adapter (`layers/core-ui/src/components/parts/part.ts`)
	// is the ONLY place permitted to import `Message`/`InlineRef`.
	//
	// @lore AM1: placed LAST so this block is authoritative for these paths —
	// ESLint flat config REPLACES (does not merge) `no-restricted-imports` when a
	// later config re-sets it for overlapping files. The broad `layers/core-ui/src/**`
	// api-fetch ban (Rule 4) is restated here so it still applies.
	{
		files: [
			"layers/core-ui/src/components/PartList.tsx",
			"layers/core-ui/src/components/parts/**/*.{ts,tsx}",
		],
		ignores: [
			// part.ts is the adapter that legitimately imports Message/EntityRef — not the renderer
			"layers/core-ui/src/components/parts/part.ts",
			"layers/core-ui/src/components/parts/index.ts",
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
					paths: [
						{
							name: "@hyperidle/domain-model",
							importNames: ["Message", "InlineRef", "EntityRef", "BlockRef", "MentionRef"],
							message:
								"AM1 W1: the source-agnostic Part renderer must NOT import source types (Message/InlineRef/…). Render the `Part`/`Embed` vocabulary only — the adapter (framework/conversation-parts/src/part.ts) owns all knowledge of Message. This is the AM1↔AM3 reuse boundary (AC5).",
						},
					],
					patterns: [
						{
							group: [
								"**/thread",
								"**/thread.js",
								"**/thread.ts",
								"**/harness",
								"**/harness/**",
								"@hyperidle/harness-protocol",
								"@hyperidle/harness-capability",
							],
							message:
								"AM1 W1: the Part renderer must NOT import a source type (thread*/harness). Render the source-agnostic `Part`/`Embed` vocabulary only (AC5).",
						},
						{
							group: ["**/services/api-fetch", "**/services/api-fetch/**"],
							message:
								"api-typesafety Rule 4: Import from @/api/client instead of services/api-fetch.",
						},
					],
				},
			],
		},
	},

	// Classifying stream-drain lint guard (AC4 static).
	//
	// Every `for await` loop over a streamEvents() iterable must be classified
	// as one of:
	//   TURN-DRAIN:   must call gate.observe(event) + evaluateReturn in fn.
	//   RELAY:        annotated `// return-relay` — re-emits verbatim, no gate.
	//   EXEMPT:       annotated `// return-exempt: internal-extraction drain` — tools:[], no gate.
	//
	// The rule detects BOTH the direct `.streamEvents(...)` RHS and the one-hop
	// `const stream = adapter.streamEvents(...)` binding per the architecture
	// critique's binding builder note (sites B and C use the one-hop form).
	//
	// Scoped to: server services, harness utilities, and desktop worker client.
	// Test files are exempt — stubs and mocks legitimately drain streams without gates.
	//
	// @lore T9 static guard. This is a "static property → lint" enforcement
	// (CLAUDE.md). The rule prevents the "forgotten drain" blind spot: a future
	// unexempted turn drain that omits the gate is caught at lint time, not at
	// runtime. Forwarding relays (desktop-worker-client)
	// and the extraction drain (bet-decomposition) are classified by their markers
	// so the rule never requires eslint-disable on them.
	{
		// @lore AU19 Increment 4: `layers/core-api/src/harness/**` moved to
		// `agent-execution/harness-registry` — the stream-drain surfaces this
		// guard polices now live there, not under `packages/server`.
		// @lore AU19 Increment 5 (item 2): `packages/server` dissolved —
		// the composition-root services relocated to `layers/core-api/src/
		// services/**`, and `desktop-worker-client.ts` (a forwarding relay)
		// relocated to `applications/remote-worker/src/**`.
		files: [
			"layers/core-api/src/services/**/*.ts",
			"layers/agent-execution/harness-registry/src/**/*.ts",
			"applications/desktop/src/**/*.ts",
			"applications/remote-worker/src/**/*.ts",
		],
		ignores: [
			"layers/core-api/src/services/**/__tests__/**",
			"layers/core-api/src/services/**/*.test.ts",
			"layers/core-api/src/services/**/*.integration.test.ts",
			"layers/agent-execution/harness-registry/src/__tests__/**",
			"layers/agent-execution/harness-registry/src/**/*.test.ts",
			"layers/agent-execution/harness-registry/src/**/*.integration.test.ts",
		],
		languageOptions: {
			parser: tsParser,
		},
		plugins: { design },
		rules: {
			"design/no-ungated-stream-drain": "error",
		},
	},

	// AM5 H1 — no hand-rolled navigate to a viewer route outside the open contract.
	//
	// All route navigation must go through `createOpenHandler` (open-handler.ts).
	// Hand-rolling `navigate("/artifacts/" + id)` or `navigate("/work/artifact/...")` in
	// page/component code bypasses the unified open contract and creates a second
	// navigation path that diverges from the open-contract seam.
	//
	// The rule bans string-concat navigations to the known viewer route prefixes
	// (/artifacts/, /work/artifact/) in all web source except the open handler itself
	// (which IS the contract) + tests + stories.
	//
	// AST selector: navigate() call where the first argument is a BinaryExpression
	// whose leftmost operand is a Literal matching a known viewer route prefix.
	// This covers the common `navigate("/artifacts/" + id)` pattern.
	//
	// @lore AM5 H1: purposely narrow (BinaryExpression only) — a plain literal call
	// like `navigate("/artifacts/123")` in a component is rare and caught by code
	// review; the common violation is concatenation. Expand to TemplateLiteral if
	// template-concat violations appear. The open-handler.ts exemption is intentional
	// (it IS the only allowed site). open-handler.test.ts + stories are also exempt.
	{
		files: ["layers/core-ui/src/**/*.{ts,tsx}"],
		ignores: [
			"layers/core-ui/src/services/open-handler.ts",
			"layers/core-ui/src/**/__tests__/**",
			"layers/core-ui/src/**/*.test.{ts,tsx}",
			"layers/core-ui/src/**/*.stories.tsx",
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
					// navigate("/artifacts/" + id) — the most common hand-roll pattern.
					selector:
						"CallExpression[callee.name='navigate'] > BinaryExpression[operator='+'] > Literal[value=/^\\/(artifacts|work\\/artifact)\\//]",
					message:
						"AM5 H1: do not navigate to a viewer route directly. Use createOpenHandler (open-handler.ts) — the unified open contract. Direct navigate() calls to /artifacts/ or /work/artifact/ bypass the open contract seam.",
				},
			],
		},
	},

	// Descriptor-driven presentation: a screen renders from the harness
	// descriptor and never learns WHICH harness it is looking at, so a new
	// backend can be added without touching any presentation file.
	//
	// @lore This block MUST stay after the `layers/core-ui/src/**` block above.
	// ESLint flat config does NOT merge `rules` across blocks — for one rule
	// name the LAST matching block wins outright. This ban previously sat before
	// that block and was silently replaced by it, so it never fired on any file
	// it claimed to cover, while the docs described it as enforced. Break-tested
	// on 2026-08-25: a bare `"codex"` literal in `SettingsHarnesses.tsx` produced
	// no diagnostic at all before the move, and errors after it.
	//
	// It therefore restates the AM5 navigate selector, because taking over the
	// rule name for these files would otherwise drop it.
	//
	// @lore A `files:` pattern that matches nothing is a silent no-op, so a dead
	// entry reads as coverage the rule does not have. `HarnessCard.tsx` was
	// listed here until it was absorbed into `SettingsHarnesses.tsx`.
	{
		files: [
			"layers/core-ui/src/settings/harness-presentation.ts",
			"layers/core-ui/src/settings/SettingsHarnesses.tsx",
			// The agent editor renders per-model options straight from the
			// descriptor, so it must not learn which harness it is looking at.
			"layers/core-ui/src/settings/AgentEditor.tsx",
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
					// Ban any string literal that is a known harness type EXCEPT "builtin".
					selector:
						"Literal[value=/^(claude-code|codex|opencode|cursor-agent|aider|goose|cline|continue|avante)$/]",
					message:
						'AM4 descriptor-driven contract: harness-type string literals (other than "builtin") are banned in presentation files. Add a field to HarnessCapabilityDescriptor and use that instead. The ONLY allowed type literal is "builtin" (showsToggle exemption — founder rule).',
				},
				{
					// Restated from the core-ui block above, which this one overrides
					// for these files.
					selector:
						"CallExpression[callee.name='navigate'] > BinaryExpression[operator='+'] > Literal[value=/^\\/(artifacts|work\\/artifact)\\//]",
					message:
						"AM5 H1: do not navigate to a viewer route directly. Use createOpenHandler (open-handler.ts) — the unified open contract. Direct navigate() calls to /artifacts/ or /work/artifact/ bypass the open contract seam.",
				},
			],
		},
	},

	// AU28: no governance rule may perform its own file discovery.
	//
	// "One census, many rules" is only real if a rule structurally CANNOT go and look for itself.
	// Twenty inherited guards each carried their own scan scope; two of them scanned a directory
	// deleted two tracks earlier and printed PASS over zero files for months. A rule receives the
	// census or it has nothing. This is the one thing ESLint is genuinely good at here — a per-file
	// import restriction — and it is the only part of the governance stack that lives in ESLint.
	{
		files: ["tools/governance/src/rules/**/*.ts"],
		languageOptions: {
			parser: tsParser,
		},
		rules: {
			"no-restricted-imports": [
				"error",
				{
					paths: [
						{
							name: "node:fs",
							message: "AU28: a governance rule may not read the filesystem. Use the census.",
						},
						{
							name: "fs",
							message: "AU28: a governance rule may not read the filesystem. Use the census.",
						},
						{
							name: "node:fs/promises",
							message: "AU28: a governance rule may not read the filesystem.",
						},
						{
							name: "node:child_process",
							message: "AU28: a governance rule may not spawn a process.",
						},
						{ name: "child_process", message: "AU28: a governance rule may not spawn a process." },
						{
							name: "node:path",
							message:
								"AU28: a governance rule works on repo-relative census paths, not filesystem paths.",
						},
						{ name: "glob", message: "AU28: a governance rule may not glob. Use the census." },
						{ name: "fast-glob", message: "AU28: a governance rule may not glob. Use the census." },
						{
							name: "tinyglobby",
							message: "AU28: a governance rule may not glob. Use the census.",
						},
					],
					patterns: [
						{
							group: ["**/governance-lint*"],
							message:
								"AU28: a rule may not reach back into the runner. Dependencies point rule -> lib only.",
						},
					],
				},
			],
		},
	},
	// The browser bundle must never reach a Node builtin. `domain-model/http` carries
	// `node:crypto`; it is kept off domain-model's barrel so Vite cannot follow it, but a
	// direct import would re-break the app the same way — the page goes blank and every
	// e2e test times out while check, lint and both unit lanes stay green. That cost 297
	// e2e failures once. This rule is the guard the barrel comment alone was not.
	{
		files: ["layers/core-ui/src/**/*.{ts,tsx}"],
		ignores: [
			"layers/core-ui/src/**/__tests__/**",
			"layers/core-ui/src/**/*.test.{ts,tsx}",
			"layers/core-ui/src/**/*.stories.tsx",
			"layers/core-ui/src/**/__testing__/**",
		],
		languageOptions: { parser: tsParser },
		rules: {
			"no-restricted-imports": [
				"error",
				{
					paths: [
						{
							name: "@hyperidle/domain-model/http",
							message:
								"Server-only: this module imports node:crypto, which Vite externalizes and the browser cannot resolve. Importing it here makes the whole app fail to load.",
						},
					],
					patterns: [
						{
							group: ["node:*"],
							message:
								"Node builtins do not exist in the browser. Use a browser-safe equivalent — block derivation uses @noble/hashes in place of node:crypto.",
						},
					],
				},
			],
		},
	},
];
