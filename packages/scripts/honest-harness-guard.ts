/**
 * Re-export shim for test imports.
 *
 * Tests in packages/server/src/harness/__tests__/ import from
 * "../../../../scripts/honest-harness-guard.js" which resolves to this file
 * (packages/scripts/honest-harness-guard.ts).
 *
 * The actual implementation lives at scripts/honest-harness-guard.ts (repo root).
 * This shim re-exports it.
 *
 * @lore AR1: The test files were written with a 4-level relative import path
 * which resolves to packages/scripts/ from packages/server/src/harness/__tests__/.
 * Rather than modifying the pre-written red-phase tests, we place this shim
 * at the expected location.
 */
export {
	isHarnessFacingIntegration,
	checkGuardRules,
	type GuardFile,
	type GuardResult,
} from "../../scripts/honest-harness-guard.js";
