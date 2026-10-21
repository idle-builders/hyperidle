// ESLint covers ONLY what Biome cannot:
//   - React Compiler (no Biome equivalent)
//   - React hooks exhaustive-deps (Biome's version is partial)
//   - Drizzle ORM safety (no Biome equivalent)
//   - Custom api-typesafety / authz / design guards
//
// Biome remains primary for everything else (formatting, style, correctness, a11y, security).
// @lore the former @typescript-eslint/no-unsafe-* + no-explicit-any block is gone —
// those rules need typed linting (parserOptions.project) and crashed ESLint without --quiet;
// Biome noExplicitAny (error) already bans `any`.

import { globSync } from "node:fs";
import tsParser from "@typescript-eslint/parser";
import vitest from "@vitest/eslint-plugin";
import authz from "eslint-plugin-authz";
import design from "eslint-plugin-design";
import drizzle from "eslint-plugin-drizzle";
import playwright from "eslint-plugin-playwright";
import reactCompiler from "eslint-plugin-react-compiler";
import reactHooks from "eslint-plugin-react-hooks";

// testing.md-enforcement blocks below scan by test-file glob, never a maintained
// list (architecture.md "scans, not lists") — a glob that matches zero files is
// the same silent failure a stale list would be, so each one is asserted non-empty
// once at config-load time.
function assertGlobMatchesFiles(label: string, patterns: string[]): void {
	const matches = globSync(patterns, {
		exclude: ["**/node_modules/**", "**/dist/**", "**/.worktrees/**", "**/coverage/**"],
	});
	if (matches.length === 0) {
		throw new Error(
			`eslint.config.ts: ${label} pattern(s) ${JSON.stringify(patterns)} matched no files. ` +
				"A rename or move silently drops every test file out of this rule's coverage — fix the pattern.",
		);
	}
}

assertGlobMatchesFiles("vitest test-file rules", ["**/*.test.ts", "**/*.test.tsx"]);

export default [
	{
		ignores: [
			"**/node_modules/**",
			"**/dist/**",
			"**/.worktrees/**",
			"**/.claude/**",
			// The pipeline plugin's component viewer copies itself to <root>/viewer/
			// on launch (see .pipeline/rules/visual-regression.md). Not our code.
			"viewer/**",
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
			"react-hooks/exhaustive-deps": "error",
			"react-compiler/react-compiler": "error",
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

	// M1/M4 — Mock-data guard, at error. Server routes must not import or use mock data.
	{
		files: ["layers/core-api/src/**/*.ts"],
		ignores: ["layers/core-api/src/**/__tests__/**", "layers/core-api/src/**/*.test.ts"],
		languageOptions: {
			parser: tsParser,
		},
		plugins: { design },
		rules: {
			"design/no-mock-data-import": "error",
			"design/no-mock-data-symbol": "error",
		},
	},

	// api-typesafety Rule 3 (error): Ban imperative router.get/post/… pattern in route files.
	// Routes should use the Hono chaining pattern (.get().post()…) so the return type is
	// inferred as a union of typed routes — required for AppType / hono/client.
	{
		files: ["layers/core-api/src/routes/**/*.ts"],
		languageOptions: {
			parser: tsParser,
		},
		rules: {
			"no-restricted-syntax": [
				"error",
				{
					selector:
						"CallExpression[callee.type='MemberExpression'][callee.property.name=/^(get|post|put|patch|delete|options|head|all|use)$/][callee.object.name='router']",
					message:
						"api-typesafety Rule 3: Use the Hono chaining pattern (new Hono().get()…) instead of router.get(). The chained form preserves typed route inference for AppType.",
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

	// AF11 — Authorization boundary enforcement (Hard Rule 6).
	// Scoped to route files only. Tests and utility files excluded.
	//   authz/no-raw-db-in-route-bypassing-policy — Hard Rule 6: enforced routes need authorizeRead/Write
	// @lore BC3 architecture.md §5 B13: `authz/no-header-identity-in-authz`
	// (Hard Rule 2) is DELETED — its sink (`canRead`/`canWrite`/
	// `authorizeRead`/`authorizeWrite`) is gone with `routes/threads.ts`, its
	// only production caller. The property is structural now: the actions
	// router reads `c.get("userId")` and nothing else.
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
			"authz/no-raw-db-in-route-bypassing-policy": "error",
		},
	},

	// A route or tool handler composes no roster and hard-codes no persona.
	//
	// Two orthogonal mechanisms, neither substituting for the other:
	//
	// (a) [removed in BA9g — `defaultRoster` no longer exists]
	//     surfaces. Roster composition belongs to `framework/factory-defaults/src/agent-scaffold.ts`,
	//     its one legitimate caller. Not vacuous: `teams-routes.ts` and `create-team.ts`
	//     genuinely imported it before the ban landed.
	//
	// (b) no-restricted-syntax bans an inline persona / system-prompt const
	//     (`*_SYSTEM_PROMPT`, `BUILTIN_*PROMPT`, `PERSONA*`). The import ban cannot see a
	//     module-local const, so this selector is what actually holds the line. Prompt
	//     text arrives from a plugin or from the person — never from a const in a route
	//     or tool handler.
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
			// @lore BA9g: the `no-restricted-imports` clause banning `defaultRoster`
			// is DELETED with the function. You cannot restrict an import of a symbol
			// that does not exist: the rule would match nothing and pass forever —
			// which is exactly the failure plans/AK6/retro.md records this repo being
			// burned by. There is no roster to compose any more.
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
						"No inline persona or system-prompt const. Prompt text arrives from a plugin or from the person, never from a const in a route or tool handler.",
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

	// testing.md § lint enforcement — vitest rules on every unit/component/
	// integration test file (all end in *.test.ts(x); a plain glob covers all
	// three lanes at once, no separate integration block needed).
	{
		files: ["**/*.test.ts", "**/*.test.tsx"],
		ignores: ["**/node_modules/**"],
		languageOptions: {
			parser: tsParser,
			parserOptions: { ecmaFeatures: { jsx: true } },
		},
		plugins: { vitest },
		rules: {
			// A conditional assert can silently never run.
			"vitest/no-conditional-expect": "error",
			// A test with no assert proves nothing. `assertFunctionNames` widens past
			// the bare `expect` call to this repo's real assertion shapes: a
			// `*.findBy*` Testing Library query throws on its own when nothing
			// matches; `*.run` is RuleTester's own assertion entry point; the
			// remaining two are named local helpers (assertOutline,
			// assertNoFabrication, assertAllCovered) that throw instead of calling
			// `expect` — real checks the plugin cannot see through a wrapper call.
			"vitest/expect-expect": [
				"error",
				{
					assertFunctionNames: [
						"expect",
						"expectTypeOf",
						"assertType",
						"*.findBy*",
						"*.run",
						"assertOutline",
						"assertNoFabrication",
						"assertAllCovered",
						"settleIgnoredSessionEnded",
						"settleIgnoredReaction",
					],
				},
			],
		},
	},

	// testing.md § Never a test: "an assert that can't fail" — a test whose
	// ONLY assertions are existence-only (toBeDefined/toBeTruthy/not.toBeNull/
	// not.toBeUndefined/not.toThrow) proves nothing. Narrower than banning the
	// matchers outright (`vitest/no-restricted-matchers` would flag hundreds of
	// legitimate sites that pair one with a real assertion) — this only fires
	// when a test has no real assertion anywhere in its body.
	{
		files: ["**/*.test.ts", "**/*.test.tsx"],
		languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true } } },
		plugins: { design },
		rules: {
			"design/no-existence-only-test": "error",
		},
	},

	// Lore skill + comments.md: every @lore is one line, no planning id, no history.
	{
		files: [
			"layers/**/*.{ts,tsx}",
			"framework/**/*.{ts,tsx}",
			"applications/**/*.{ts,tsx}",
			"**/*.test.ts",
			"**/*.test.tsx",
			"**/*.spec.ts",
			"**/*.spec.tsx",
		],
		languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true } } },
		plugins: { design },
		rules: {
			"design/lore-format": "error",
		},
	},

	// testing.md § lint enforcement — Playwright rules on every e2e spec.
	{
		files: ["**/*.spec.ts", "**/*.spec.tsx"],
		ignores: ["**/node_modules/**"],
		languageOptions: {
			parser: tsParser,
			parserOptions: { ecmaFeatures: { jsx: true } },
		},
		plugins: { playwright },
		rules: {
			"playwright/no-conditional-expect": "error",
			// Local helpers (proveHeader, expectEllipsis, expectNoHorizontalCollision)
			// hold the real `expect()` calls the plugin cannot see through a wrapper.
			"playwright/expect-expect": ["error", { assertFunctionPatterns: ["^expect", "^prove"] }],
			"playwright/no-restricted-matchers": [
				"error",
				{
					toBeDefined:
						"existence-only assert (testing.md): assert the actual value, not that it exists.",
					toBeTruthy:
						"existence-only assert (testing.md): use a specific/web-first matcher instead.",
					"not.toBeNull":
						"existence-only assert (testing.md): assert the actual value, not that it is non-null.",
					"not.toThrow":
						"existence-only assert (testing.md): assert the actual success value, not merely that nothing threw.",
				},
			],
			// testing.md § UI: "No screenshots inside a spec."
			"no-restricted-syntax": [
				"error",
				{
					selector:
						"CallExpression[callee.type='MemberExpression'][callee.property.name='screenshot'][callee.object.name='page']",
					message:
						"testing.md § UI: no screenshots inside a Playwright spec. A failing e2e test gets fixed or deleted, never hidden behind a captured image.",
				},
			],
		},
	},

	// testing.md § Never a test — reading the repo's own source/config, or
	// shelling out to a scan command, in place of a real test.
	{
		files: ["**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts", "**/*.spec.tsx"],
		languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true } } },
		plugins: { design },
		rules: {
			"design/no-repo-introspection-in-test": "error",
		},
	},

	// testing.md § Structure — "Test names say the behavior. No planning
	// labels (track letters, work-item ids)." Covers both the file name and
	// every describe/test/it title.
	{
		files: ["**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts", "**/*.spec.tsx"],
		languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true } } },
		plugins: { design },
		rules: {
			"design/no-planning-id-in-test": "error",
		},
	},

	// testing.md § UI — component tests assert what the user sees, never a
	// data-ds-* marker's own existence.
	{
		files: ["**/*.test.tsx"],
		languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true } } },
		plugins: { design },
		rules: {
			"design/no-dom-marker-assert": "error",
		},
	},
];
