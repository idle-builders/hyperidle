/**
 * `@hyperidle/harness-registry/test-utils` barrel — dev-world (lives under
 * `__tests__/`), consumed only by other packages' real-harness integration
 * tests (never by production code).
 *
 * @lore Kept as a barrel rather than pointing `package.json`'s `test-utils`
 * export straight at `require-harness.ts` (the pre-existing single-file
 * shape) so a second dev-world test utility — `stopAllLiveHarnessSessions`,
 * the "stop everything now" afterEach safety net for a live-harness test
 * whose own finally block a vitest timeout would skip — has an obvious home
 * without either living inside `require-harness.ts` (a file about harness
 * availability and the locked test-model matrix, not session cleanup) or
 * requiring every consumer to import two separate subpaths.
 */

export { stopAllLiveHarnessSessions } from "../cli-harness-adapter.js";
export {
	HARNESS_TEST_MODELS,
	type HarnessName,
	requireHarness,
	type SupportedHarnessName,
} from "./require-harness.js";
