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
export declare function extractAgenticCounts(json: VitestJsonResult, predicate: (path: string) => boolean): AgenticCounts;
/**
 * Return a violation string when the agentic surface ran nothing, or null when it
 * is healthy. Legacy attestations minted before AR1 carry no agentic fields
 * (`undefined`/`undefined`) ⇒ null (back-compat — never fail a pre-AR1 green).
 */
export declare function assertAgenticFloor(counts: {
    agenticExecuted?: number;
    agenticSkipped?: number;
}): string | null;
//# sourceMappingURL=attestation-floor.d.ts.map