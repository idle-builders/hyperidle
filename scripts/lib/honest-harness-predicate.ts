/**
 * Single-sourced PATH-ONLY predicate for "is this a harness-facing
 * integration test?", plus the canonical agent-harness matrix constant.
 * SUPPORTED_HARNESSES is the single source of truth for the coverage check
 * in honest-harness-guard.ts and the per-harness floor in verify-attest.ts /
 * check-attestation.ts.)
 *
 * Two consumers share this one source of truth:
 *   1. scripts/honest-harness-guard.ts — selects which files to static-check.
 *   2. scripts/verify-attest.ts attestation floor — selects which vitest JSON
 *      file-results count toward the agentic executed/skipped tally.
 *
 * Path-only because the floor only ever sees file PATHS from the vitest
 * `--reporter=json` output (no source). A source-import predicate cannot work
 * for the floor, so both consumers must agree on a path-only rule.
 *
 * @lore harness-integration-path: A file is harness-facing integration iff it lives in a
 *   `harness/__tests__/` directory with the `.integration.test.ts` suffix, OR it
 *   is one of the explicitly-listed exceptions (session-provisioning lives in
 *   `server/src/__tests__/`, not the harness dir, yet drives the real CLI binary).
 *   The `.integration.test.ts` suffix (not `.test.ts`) is load-bearing: it excludes
 *   the legitimately-stubbing `*.test.ts` units that share the harness dir.
 */

/**
 * The agent-harness matrix every harness-facing integration test MUST cover.
 * Single source of truth shared by: the coverage check in honest-harness-guard.ts,
 * the SUPPORTED_HARNESS_LANES table in provision-real-session.ts, and (mirrored —
 * see require-harness.ts) requireHarness. `gh` is a TOOL not an agent harness.
 *
 * @lore supported-harnesses-source: Defined in the predicate lib (the shared path that both the guard
 * AND the attestation floor already import without a package-graph cycle).
 * `packages/` must not import `scripts/` — require-harness.ts mirrors this as a
 * compile-time-checked literal (bidirectional type assert).
 */
export const SUPPORTED_HARNESSES = [
	"builtin",
	"claude",
	"codex",
	"opencode",
	"cursor-agent",
] as const;
export type SupportedHarness = (typeof SUPPORTED_HARNESSES)[number];

/**
 * Files that are harness-facing integration tests but do NOT live under a
 * `harness/__tests__/` directory. Matched by `path.endsWith(suffix)`.
 */
export const EXPLICIT_HARNESS_INTEGRATION: readonly string[] = [
	"__tests__/session-provisioning.integration.test.ts",
	// converted to real-harness (4-lane matrix) — outside harness/__tests__/ dir
	"__tests__/minimal-strategy-session.integration.test.ts",
	"__tests__/bet-decomposition-real-agent.integration.test.ts",
];

/**
 * Files whose production path is GENUINELY builtin-only — the assistant turn
 * cannot run a CLI harness (no sandbox cwd, no .mcp.json bridge).
 * Files listed here are exempted from the 4-harness coverage rule but MUST still:
 *   (a) declare requireHarness("builtin")
 *   (b) contain zero stubs / vi.mock of harness seams
 *   (c) use no skipIf-on-absent gate
 *
 * @lore builtin-only-integration-empty: The builtin-only real files were removed during harness-suite
 * consolidation. Service behavior stays in deterministic service/unit tests, and
 * harness capability is proven by `conversational-reply-row.integration.test.ts`,
 * which drives the conversational path through all four supported harnesses.
 *
 * @lore builtin-only-integration-history: Previously contained assistant-turn files (the assistant-turn path was builtin-only
 * before conversational mode). Removed when the 4-lane reply-row test (conversational-reply-row)
 * went green on all 4 harnesses, proving the shared path works end-to-end.
 *
 * @lore AV1: AV1-assistant-ready is registered here because `runAssistantTurn` is
 * structurally builtin-only (no sandbox cwd, no .mcp.json bridge). The test proves the
 * onboarding assistant stub opens READY (no missing_key/missing_harness notice) via the
 * real builtin path — it cannot use CLI harnesses regardless of test configuration.
 */
export const BUILTIN_ONLY_INTEGRATION: readonly string[] = [
	"__tests__/AV1-assistant-ready.integration.test.ts",
];

/** Harness-dir integration suffix: `…/harness/__tests__/<anything>.integration.test.ts`. */
const HARNESS_DIR_INTEGRATION = /\/harness\/__tests__\/[^/]*\.integration\.test\.ts$/;

/**
 * True iff `filePath` is a harness-facing integration test (real installed
 * binary under test). Path-only — accepts absolute, repo-relative, or `./`-led
 * POSIX paths; normalizes `\` → `/` so Windows-style paths also match.
 */
export function isHarnessIntegrationPath(filePath: string): boolean {
	if (!filePath) return false;
	const p = filePath.replace(/\\/g, "/");
	if (HARNESS_DIR_INTEGRATION.test(p)) return true;
	return EXPLICIT_HARNESS_INTEGRATION.some((suffix) => p.endsWith(suffix));
}
