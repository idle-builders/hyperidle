import { join } from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Integration test config — two projects in one invocation (`npm run test:integration`).
 *
 *   service: fast deterministic service-integration (real PGlite + Hono app), parallel.
 *   harness: harness-facing integration that drives the REAL installed binary +
 *            REAL LLM. Runs SERIALLY (fileParallelism:false) so concurrent real-LLM
 *            calls never race on rate limits / auth contention.
 *
 * @lore harness-lane-collapse: the `.real-harness.test.ts` lane was collapsed into `.integration.test.ts`.
 *   The serial real-LLM requirement that justified the dead lane is now met by the
 *   `harness` project's `fileParallelism:false` — the vitest-4 supported per-project
 *   serial knob (`poolOptions.threads.singleThread` is deprecated in v4). The harness
 *   project also carries the PGlite setup because session-provisioning uses {db,app}.
 */

const SHARED_EXCLUDE = ["**/node_modules/**", "**/.git/**", "**/dist/**", "**/.worktrees/**"];

const HARNESS_INCLUDE = [
	// @lore AU19 Increment 4: `packages/server/src/harness/__tests__/` moved to
	// `layers/agent-execution/harness-registry/src/__tests__/` (harness-registry
	// finalize). Four cross-package tests (spanning harness+mcp+tools, or needing
	// `{db,app,eventBus}` fixtures) stayed behind in `packages/server/src/__tests__/`
	// — listed explicitly below (they don't match the generic `*-real.integration.test.ts`
	// pattern, same as the harness-lane-collapse precedent this file already documents).
	//
	// @lore AU19 Increment 5 (item 2): `packages/server` dissolved — these files
	// (and the composition root itself) relocated to `layers/core-api/src/`.
	"layers/agent-execution/harness-registry/src/__tests__/**/*.integration.test.ts",
	// @lore AU36: the AN1 real-harness inherited-reach pin moved with the probes
	// into the connections package. Explicit entry required — the list is
	// explicit, and without it the file matches the service lane's
	// `layers/**` include and hard-fails CI where the binaries are absent.
	"layers/agent-orchestration/connections/src/__tests__/AN1-real-harness-inherited.integration.test.ts",
	"layers/core-api/src/__tests__/real-harness-return-enforcement-realbinary.integration.test.ts",
	"layers/core-api/src/__tests__/AU9-assistant-handoff-realbinary.integration.test.ts",
	"layers/core-api/src/__tests__/thread-turn-live-harness.integration.test.ts",
	"layers/core-api/src/__tests__/document-tools-live-harness.integration.test.ts",
	"layers/core-api/src/__tests__/subscription-wake-live-harness.integration.test.ts",
	// @lore real-harness serial: *-real.integration.test.ts files in src/__tests__ and
	// routes/__tests__ drive real CLI harnesses (codex/claude/opencode). They must run
	// SERIALLY (harness project, fileParallelism:false) — concurrent codex sessions
	// collide on .codex-home/.tmp/plugins-clone dirs → ENOTEMPTY teardown errors.
	// The service project's 4-worker parallel pool caused this regression when real route-dispatch tests added
	// route-dispatch real tests alongside the existing real-session/cli-adapter harness tests.
	"layers/core-api/src/__tests__/*-real.integration.test.ts",
	"layers/core-api/src/routes/__tests__/*-real.integration.test.ts",
];

export default defineConfig({
	test: {
		// @lore affected-determinism (see vitest.config.ts): absolute literal triggers,
		// never `**` globs — picomatch's `**` won't cross dot-directories (`.worktrees`),
		// so glob triggers fire in CI/dot-free checkouts but not in worktrees, making
		// `--changed` selection depend on checkout location. The integration setup file
		// is loaded outside the import graph, so the affected dep-walk never sees it.
		forceRerunTriggers: [
			join(import.meta.dirname, "package-lock.json"),
			join(import.meta.dirname, "vitest.integration.config.ts"),
			join(import.meta.dirname, "framework/db/src/__testing__/vitest-integration-setup.ts"),
		],
		hookTimeout: 120_000,
		testTimeout: 120_000,
		reporters: ["dot"],
		projects: [
			{
				extends: true,
				test: {
					name: "service",
					hookTimeout: 120_000,
					testTimeout: 120_000,
					maxWorkers: 4,
					minWorkers: 4,
					include: [
						"layers/**/*.integration.test.{ts,tsx}",
						"framework/**/*.integration.test.{ts,tsx}",
						"applications/**/*.integration.test.{ts,tsx}",
						"tools/**/*.integration.test.{ts,tsx}",
					],
					exclude: [...SHARED_EXCLUDE, ...HARNESS_INCLUDE],
					pool: "threads",
					unstubEnvs: true,
					// @lore integration-isolation: service files share one module context per worker so
					// the PGlite pool survives across files. Tests must dispose background owners and
					// remove file-local mocks; per-test database truncation remains unchanged.
					isolate: false,
					setupFiles: ["framework/db/src/__testing__/vitest-integration-setup.ts"],
				},
			},
			{
				extends: true,
				test: {
					name: "harness",
					// @lore harness-timeout-ceiling: 240s ceiling — the session-provisioning real claude run can
					// hit the return-enforcement re-prompt loop (the MCP-namespace return-action bug delays
					// gate recognition), pushing a single honest run past 120s. Per-test args
					// can lower this; the project default must not cap below the slowest honest run.
					hookTimeout: 240_000,
					testTimeout: 240_000,
					// Real-LLM serial: never run two real-binary harness files in parallel.
					fileParallelism: false,
					// @lore harness-retry: retry:2 (3 attempts) on the HARNESS project ONLY. Real-LLM
					// agentic-loop tests are nondeterministic — a multi-turn model run can
					// transiently fail to complete a tool action (e.g. "proof.txt not written"
					// in session 2) and pass on re-run. Lane-level retry absorbs that transient
					// model nondeterminism so the attested gate isn't a coin-flip, WITHOUT masking
					// a real break (a genuine logic/contract failure fails all 3 attempts). The
					// SERVICE project is deliberately NOT retried: its tests are deterministic
					// DB+app tests, and a retry there would hide real flakiness / race bugs.
					retry: 2,
					include: HARNESS_INCLUDE,
					exclude: SHARED_EXCLUDE,
					pool: "threads",
					isolate: true,
					setupFiles: ["framework/db/src/__testing__/vitest-integration-setup.ts"],
				},
			},
		],
	},
});
