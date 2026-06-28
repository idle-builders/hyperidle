/**
 * Attestation floor — pure functions for the agentic harness test count floor.
 *
 * AR1: Provides the building blocks for the attestation executed-count floor:
 *   - extractAgenticCounts: counts executed/skipped from vitest JSON reporter output
 *     for files matching the harness-facing predicate.
 *   - assertAgenticFloor: the floor assertion logic (W5 non-empty + zero-executed).
 *
 * Both functions are pure (no I/O) — unit-testable via attestation-floor.test.ts.
 * verify-attest.ts imports these and wires them into the attestation payload.
 *
 * @lore AR1: Single-sourced with isHarnessFacingIntegration from honest-harness-guard.ts.
 * The predicate feeding the counts is the same one the guard uses for static checks.
 * A regression in the predicate fails is-harness-facing-integration.test.ts (W3/W5).
 *
 * @lore AR1: Vitest 4 json reporter shape (verified against node_modules source):
 *   top-level: testResults[] (one per file)
 *   each file: { name: string (= file path), assertionResults: [...] }
 *   assertion status: "passed" | "failed" | "skipped" | "pending" | "todo"
 *   "pending" and "todo" count as skipped; "passed" and "failed" count as executed.
 */

/** Vitest 4 JSON reporter output shape (top-level). */
export interface VitestJsonResult {
	testResults: VitestFileResult[];
}

/** One file's entry in the JSON reporter output. */
export interface VitestFileResult {
	/** File path (= assertionResult's parent file path). */
	name: string;
	assertionResults: VitestAssertionResult[];
}

/** One test assertion's result. */
export interface VitestAssertionResult {
	status: "passed" | "failed" | "skipped" | "pending" | "todo";
}

/** Aggregated executed/skipped counts for the agentic (harness-facing) test set. */
export interface AgenticCounts {
	agenticExecuted: number;
	agenticSkipped: number;
}

/**
 * Extract executed/skipped counts from a vitest JSON reporter output,
 * for files that match the given harness-facing predicate.
 *
 * "executed" = status is "passed" or "failed" (the test actually ran).
 * "skipped"  = status is "skipped", "pending", or "todo".
 */
export function extractAgenticCounts(
	results: VitestJsonResult,
	predicate: (filePath: string) => boolean,
): AgenticCounts {
	let agenticExecuted = 0;
	let agenticSkipped = 0;

	for (const fileResult of results.testResults) {
		if (!predicate(fileResult.name)) continue;

		for (const assertion of fileResult.assertionResults) {
			if (assertion.status === "passed" || assertion.status === "failed") {
				agenticExecuted++;
			} else {
				// "skipped" | "pending" | "todo" all count as skipped
				agenticSkipped++;
			}
		}
	}

	return { agenticExecuted, agenticSkipped };
}

/**
 * Assert the agentic floor: non-empty set AND at least one executed.
 *
 * Returns a violation string if the floor is breached, or null if it passes.
 *
 * Back-compat: if agenticExecuted is undefined (legacy attestation without
 * counts), the floor is skipped (returns null). Matches the srcHash? optional
 * field precedent in check-attestation.ts.
 *
 * Order matters: W5 non-empty fires first (a predicate selecting zero files
 * is a deeper failure than "all skipped" — it means the floor is vacuously satisfied).
 */
export function assertAgenticFloor(counts: AgenticCounts): string | null {
	// Back-compat: legacy attestation without counts → skip the floor
	if (typeof counts.agenticExecuted !== "number") return null;

	const total = counts.agenticExecuted + (counts.agenticSkipped ?? 0);

	// W5: non-empty floor — the agentic set itself must not be empty
	if (total === 0) {
		return (
			"agentic harness integration set is EMPTY (zero agentic tests collected) — " +
			"the executed-count floor cannot be vacuously satisfied (AR1 floor / W5). " +
			"Check that isHarnessFacingIntegration is selecting files correctly."
		);
	}

	// Zero-executed floor — all agentic tests skipped
	if (counts.agenticExecuted === 0) {
		return (
			"agentic harness integration tests reported ZERO executed — " +
			"a green cannot be minted on a 100%-skipped agentic surface (AR1 floor). " +
			"Use requireHarness() so absence throws RED, not skipIf to green."
		);
	}

	return null;
}
