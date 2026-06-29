/**
 * AR1 — attestation executed-count floor (pure logic). (architecture.md
 * Mechanism 4 + Decision 4.)
 *
 * The floor is the regression backstop behind requireHarness + the guard: a green
 * attestation can never be minted while EVERY agentic (harness-facing) test silently
 * skipped. verify-attest records `agenticExecuted`/`agenticSkipped` in the signed
 * payload; check-attestation fails when the agentic set ran zero executed assertions.
 *
 * These two pure fns read ONLY the Vitest `--reporter=json` shape:
 *   json.testResults[]            — one entry per file; `name` = absolute file path.
 *   …[i].assertionResults[].status ∈ "passed"|"failed"|"skipped"|"pending"|"todo".
 *
 * @lore AR1: paths in the vitest json reporter are ABSOLUTE; the predicate is
 *   path-only and matches repo-relative or absolute, but we still normalize `\`→`/`
 *   so the same code works on any platform's reporter output.
 */

/** The narrow slice of the Vitest `--reporter=json` object the floor reads. */
export interface VitestJsonResult {
	testResults: Array<{
		/** Absolute test-file path. */
		name: string;
		assertionResults: Array<{
			status: "passed" | "failed" | "skipped" | "pending" | "todo";
		}>;
	}>;
}

export interface AgenticCounts {
	agenticExecuted: number;
	agenticSkipped: number;
}

/**
 * Tally executed (passed|failed) and skipped (skipped|pending|todo) assertions
 * across only the files whose path the predicate accepts. Files the predicate
 * rejects are ignored entirely; a matched file with zero assertions contributes 0/0.
 */
export function extractAgenticCounts(
	json: VitestJsonResult,
	predicate: (path: string) => boolean,
): AgenticCounts {
	let agenticExecuted = 0;
	let agenticSkipped = 0;

	for (const fileResult of json.testResults ?? []) {
		const normalized = fileResult.name.replace(/\\/g, "/");
		if (!predicate(normalized)) continue;
		for (const assertion of fileResult.assertionResults ?? []) {
			if (assertion.status === "passed" || assertion.status === "failed") {
				agenticExecuted++;
			} else {
				agenticSkipped++;
			}
		}
	}

	return { agenticExecuted, agenticSkipped };
}

/**
 * Return a violation string when the agentic surface ran nothing, or null when it
 * is healthy. Legacy attestations minted before AR1 carry no agentic fields
 * (`undefined`/`undefined`) ⇒ null (back-compat — never fail a pre-AR1 green).
 */
export function assertAgenticFloor(counts: {
	agenticExecuted?: number;
	agenticSkipped?: number;
}): string | null {
	const { agenticExecuted, agenticSkipped } = counts;

	// Back-compat: a legacy attestation with neither field validates.
	if (agenticExecuted === undefined && agenticSkipped === undefined) return null;

	const executed = agenticExecuted ?? 0;
	const skipped = agenticSkipped ?? 0;

	if (executed + skipped === 0) {
		return (
			"agentic floor: the harness-facing integration set is EMPTY — zero agentic " +
			"assertions were collected. The agentic surface must run; check the predicate " +
			"and the integration suite."
		);
	}
	if (executed === 0) {
		return (
			`agentic floor: ${skipped} agentic assertion(s) collected but ZERO executed — ` +
			"every harness-facing integration test skipped. A green cannot be minted on a " +
			"fully-skipped agentic surface (AR1: requireHarness, never skipIf to green)."
		);
	}
	return null;
}
