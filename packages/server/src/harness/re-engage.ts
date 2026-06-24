/**
 * AL6 v4-final: re-engage.ts stub.
 *
 * The v3 `rewriteSandboxForcing` export is DELETED. This file intentionally
 * exports nothing — it exists only to satisfy TypeScript's static module
 * resolution for the AL6 guard test that asserts the function is gone.
 *
 * @lore AL6 v4-final: The v3 re-prompt loop used `rewriteSandboxForcing` to
 * append AL6_FORCE_RETURN_MESSAGE to the sandbox instruction file before each
 * re-engage startSession. v4 deletes the outer loop entirely and provisions
 * enforcement per-harness via provisionReturnHook (provision-return-hook.ts).
 * This stub ensures the TypeScript import path resolves (avoiding TS2307) while
 * correctly NOT exporting the function the guard test checks for.
 *
 * @see AL6-reprompt-loop.integration.test.ts "re-engage.ts no longer exports rewriteSandboxForcing"
 */

// Intentionally empty — no exports. The guard test checks `"rewriteSandboxForcing" in mod`.
export {};
