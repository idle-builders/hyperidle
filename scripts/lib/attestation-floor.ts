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

/**
 * The narrow slice of the Vitest `--reporter=json` object the floor reads.
 *
 * AR2: `assertionResults[]` now also carries `ancestorTitles` (string[]) — the
 * reviewer empirically confirmed both fields exist in vitest-4's JSON reporter.
 * `[harness:X]` is parsed from ancestorTitles (the describe carry it, not the leaf
 * test title). Both `ancestorTitles` and `fullName` carry the token; we use
 * ancestorTitles because the tag is on the describe block, an ancestor.
 */
export interface VitestJsonResult {
	testResults: Array<{
		/** Absolute test-file path. */
		name: string;
		assertionResults: Array<{
			status: "passed" | "failed" | "skipped" | "pending" | "todo";
			/** AR2: ancestor describe titles (the `[harness:X]` tag lives here). Optional
			 * — vitest-4 always populates it, but older JSON reports may not. */
			ancestorTitles?: string[];
		}>;
	}>;
}

export interface AgenticCounts {
	agenticExecuted: number;
	agenticSkipped: number;
}

/**
 * AR2: Extended return type adding per-harness bucketing keyed by the
 * `[harness:<name>]` describe tag found in each assertion's ancestorTitles.
 *
 * The global fields are kept for back-compat with check-attestation's existing
 * `assertAgenticFloor` call.
 */
export interface AgenticCountsByHarness extends AgenticCounts {
	/** Per-harness executed/skipped tally, keyed by the [harness:<name>] tag. */
	byHarness: Record<string, { executed: number; skipped: number }>;
}

/**
 * Regex matching `[harness:X]` in a describe title (the mechanical tag the
 * per-harness floor reads). The captured group is the harness name.
 *
 * @lore AR2: The reviewer empirically ran vitest-4 --reporter=json with a
 * describe("[harness:codex] outer block") and confirmed both ancestorTitles and
 * fullName carry the token verbatim. Prefer ancestorTitles (the tag is on the
 * describe, an ancestor — not the leaf test title). HARNESS_TAG matches anywhere
 * in a joined ancestorTitles string.
 */
const HARNESS_TAG = /\[harness:([a-z-]+)\]/;

/**
 * Tally executed (passed|failed) and skipped (skipped|pending|todo) assertions
 * across only the files whose path the predicate accepts. Files the predicate
 * rejects are ignored entirely; a matched file with zero assertions contributes 0/0.
 *
 * AR2: Also buckets each assertion by its `[harness:X]` ancestorTitle tag.
 * An assertion with no tag contributes to the global tally only.
 */
export function extractAgenticCounts(
	json: VitestJsonResult,
	predicate: (path: string) => boolean,
): AgenticCountsByHarness {
	let agenticExecuted = 0;
	let agenticSkipped = 0;
	const byHarness: Record<string, { executed: number; skipped: number }> = {};

	for (const fileResult of json.testResults ?? []) {
		const normalized = fileResult.name.replace(/\\/g, "/");
		if (!predicate(normalized)) continue;
		for (const assertion of fileResult.assertionResults ?? []) {
			const executed = assertion.status === "passed" || assertion.status === "failed";
			if (executed) {
				agenticExecuted++;
			} else {
				agenticSkipped++;
			}

			// AR2: bucket by [harness:X] tag from ancestorTitles.
			const joinedAncestors = (assertion.ancestorTitles ?? []).join(" ");
			const match = HARNESS_TAG.exec(joinedAncestors);
			if (match) {
				const harness = match[1];
				if (!byHarness[harness]) {
					byHarness[harness] = { executed: 0, skipped: 0 };
				}
				if (executed) {
					byHarness[harness].executed++;
				} else {
					byHarness[harness].skipped++;
				}
			}
		}
	}

	return { agenticExecuted, agenticSkipped, byHarness };
}

/**
 * AR2: Fail if any supported harness has zero executed agentic assertions.
 *
 * @param byHarness  The per-harness map from extractAgenticCounts. `undefined`
 *                   means a legacy attestation (no AR2 field) → null (back-compat,
 *                   mirrors the `srcHash?`/`agenticExecuted?` optional pattern).
 * @param supported  The supported harness set (SUPPORTED_HARNESSES mirrored into
 *                   scripts/lib — no packages/ → scripts/ cycle).
 * @returns A violation string naming the empty harness(es), or null if all pass.
 */
export function assertPerHarnessFloor(
	byHarness: Record<string, { executed: number; skipped: number }> | undefined,
	supported: readonly string[],
): string | null {
	if (byHarness === undefined) return null; // legacy back-compat

	const empty = supported.filter((h) => (byHarness[h]?.executed ?? 0) === 0);
	if (empty.length > 0) {
		return (
			`per-harness agentic floor: ${empty.join(", ")} ran ZERO executed agentic assertion(s). ` +
			`Every supported harness must actually RUN a harness-facing integration test — a green ` +
			`cannot be minted while a supported harness's lane silently did not execute. ` +
			`(AR2: equal coverage across all supported harnesses; SUPPORTED_HARNESSES is the source of truth.)`
		);
	}
	return null;
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
