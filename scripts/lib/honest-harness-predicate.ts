/**
 * AR1/AR2 — single-sourced PATH-ONLY predicate for "is this a harness-facing
 * integration test?", plus the canonical agent-harness matrix constant. (AR1:
 * architecture.md Decision 2 — option B; the import-seam predicate was REJECTED.
 * AR2: SUPPORTED_HARNESSES is the single source of truth for the coverage check
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
 * @lore AR1: A file is harness-facing integration iff it lives in a
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
 * see require-harness.ts §0) requireHarness. `gh` is a TOOL not an agent harness;
 * `cursor-agent` is inert/not-spawnable — neither is in the matrix.
 *
 * @lore AR2: Defined in the predicate lib (the shared path that both the guard
 * AND the attestation floor already import without a package-graph cycle).
 * `packages/` must not import `scripts/` — require-harness.ts mirrors this as a
 * compile-time-checked literal (bidirectional type assert, §0).
 */
export const SUPPORTED_HARNESSES = ["builtin", "claude", "codex", "opencode"] as const;
export type SupportedHarness = (typeof SUPPORTED_HARNESSES)[number];

/**
 * Files that are harness-facing integration tests but do NOT live under a
 * `harness/__tests__/` directory. Matched by `path.endsWith(suffix)`.
 */
export const EXPLICIT_HARNESS_INTEGRATION: readonly string[] = [
	"__tests__/session-provisioning.integration.test.ts",
	// AR4 — real-harness converted files (4-harness matrix: AD2 + R1)
	"__tests__/AD2-task-dispatcher-real.integration.test.ts",
	"__tests__/R1-wire-agent-execution-real.integration.test.ts",
	// AR4a — service-level assistant-turn tests (builtin only; 4-harness coverage
	// lives in harness/__tests__/AR4a-conversational-reply-row.integration.test.ts)
	"routes/__tests__/AH3-assistant-turn-real.integration.test.ts",
	"routes/__tests__/AK4-assistant-draft-real.integration.test.ts",
	"__tests__/AH6-lane-gates-broken-turn-real.integration.test.ts",
];

/**
 * Files whose production path is GENUINELY builtin-only — the assistant turn
 * cannot run a CLI harness (no sandbox cwd, no .mcp.json bridge, Q2 in AR4 plan).
 * Files listed here are exempted from the 4-harness coverage rule but MUST still:
 *   (a) declare requireHarness("builtin")
 *   (b) contain zero stubs / vi.mock of harness seams
 *   (c) use no skipIf-on-absent gate
 *
 * @lore AR4a: EMPTY — The `runAssistantTurn` path has been rewritten (AR4a) to
 * delegate to `provisionSession(conversational mode)`, which runs all 4 harnesses.
 * The 4-harness obligation is proven in `AR4a-conversational-reply-row.integration.test.ts`.
 * The service-level tests (AH3/AK4/AH6) are in `coverage-debt.allowlist.json` because
 * they test service behavior (route wiring, error surfaces), not harness capability —
 * they only cover builtin, which is correct for their purpose. The carve-out is now empty.
 *
 * @lore AR4a: Previously contained AH3/AK4/AH6 (assistant-turn path was builtin-only
 * before AR4a). Removed when the 4-lane reply-row test (AR4a-conversational-reply-row)
 * went green on all 4 harnesses, proving the shared path works end-to-end.
 */
export const BUILTIN_ONLY_INTEGRATION: readonly string[] = [];

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
