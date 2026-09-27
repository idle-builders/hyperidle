import { globSync, readFileSync } from "node:fs";
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

// @lore harness-lane-by-convention: membership used to be a hand-maintained
// list of literal filenames plus a couple of directory globs — a file that
// forgot to update the list (or renamed away from a matched suffix) silently
// fell into the service lane, where it either passed for the wrong reason or
// hard-failed on a missing binary with no clue why. The convention is now
// structural: a `.integration.test.{ts,tsx}` file that calls `requireHarness(`
// (a real CLI harness) or `requireBinary(` (a non-harness real binary, e.g.
// `gh` — testing.md § Harness) belongs in the harness lane, full stop. A new
// real-binary file can never land in the service lane by omission — it only
// takes calling the right guard, which every real-binary test must call
// anyway to avoid silently skipping to green.
const CANDIDATE_INTEGRATION_TESTS = globSync(
	[
		"layers/**/*.integration.test.{ts,tsx}",
		"framework/**/*.integration.test.{ts,tsx}",
		"applications/**/*.integration.test.{ts,tsx}",
		"tools/**/*.integration.test.{ts,tsx}",
	],
	{ cwd: import.meta.dirname, exclude: SHARED_EXCLUDE },
);

const REAL_BINARY_MARKERS = ["requireHarness(", "requireBinary("];

const HARNESS_INCLUDE = CANDIDATE_INTEGRATION_TESTS.filter((relPath) => {
	const content = readFileSync(join(import.meta.dirname, relPath), "utf8");
	return REAL_BINARY_MARKERS.some((marker) => content.includes(marker));
}).sort();

// A scan that finds nothing reads as passing forever (architecture.md "scans,
// not lists") — hard-fail rather than silently run zero harness tests.
if (HARNESS_INCLUDE.length === 0) {
	throw new Error(
		"vitest.integration.config.ts: the requireHarness()/requireBinary() scan matched no " +
			"*.integration.test file. Either every real-binary test lost its guard call, or the " +
			"scan itself broke — fix before running the integration suite.",
	);
}

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
					setupFiles: [
						"framework/db/src/__testing__/vitest-integration-setup.ts",
						"layers/agent-execution/harness-registry/src/__testing__/harness-lane-cleanup.ts",
					],
				},
			},
		],
	},
});
