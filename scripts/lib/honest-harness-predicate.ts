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
 *   is one of the explicitly-listed exceptions in `EXPLICIT_HARNESS_INTEGRATION`
 *   (a file that genuinely drives the real CLI binary but lives outside the
 *   harness dir — e.g. it needs the `{db,app}`-shaped core-api composition).
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
 *
 * @lore AU27 sweep (review W8 follow-up): three entries that predate this WP
 * — `session-provisioning`/`minimal-strategy-session`/
 * `bet-decomposition-real-agent` `.integration.test.ts` — were removed here.
 * None of the three files exist anywhere in the tree (confirmed via `git log
 * --diff-filter=D`: all three were deleted in AU7, long before AU27). Dead
 * entries in this array are lower-severity than a `BUILTIN_ONLY_INTEGRATION`
 * dead entry (they only ever ADD coverage, so a stale one can't falsely
 * exempt a real file) but are still config cruft with no live effect —
 * removed while sweeping this same file for W8/N1.
 */
export const EXPLICIT_HARNESS_INTEGRATION: readonly string[] = [
	// AU27 Increment 8: the assistant-turn live reply proof — real 5-harness
	// matrix, outside harness/__tests__/ dir (needs the {db,app}-shaped
	// core-api composition, not just harness-registry).
	"__tests__/assistant-reply-live-harness.integration.test.ts",
];

/**
 * Files whose production path is GENUINELY builtin-only — the path under
 * test structurally cannot run a CLI harness (e.g. no sandbox cwd, no
 * `.mcp.json` bridge). Files listed here are exempted from the 4-harness
 * coverage rule but MUST still:
 *   (a) declare requireHarness("builtin")
 *   (b) contain zero stubs / vi.mock of harness seams
 *   (c) use no skipIf-on-absent gate
 * Do not add a file here unless its production path itself — not just the
 * test — cannot run the CLI harnesses; if it can, it must cover all four.
 *
 * @lore builtin-only-integration-empty: genuinely empty. The assistant turn
 * — the one path historically builtin-only — now flows through the same
 * shared poller as every other kind and runs on all five supported
 * harnesses (`assistant-reply-live-harness.integration.test.ts`), so no
 * production path qualifies for this carve-out today. Two dead entries that
 * previously sat here (a nonexistent file, and a path that never matched
 * its real location) were removed rather than repointed — see
 * `AU9-assistant-handoff-realbinary.integration.test.ts` (a genuinely
 * builtin-scoped real-binary proof of the durable-poller lifecycle, kept
 * single-harness by choice, not by structural necessity) and
 * `agent-request-custody.integration.test.ts`'s assistant_turn case (the
 * scripted-adapter service-lane proof of the same `running`→`completed`
 * transition).
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
