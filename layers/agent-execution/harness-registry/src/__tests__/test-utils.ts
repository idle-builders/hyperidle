/**
 * `@hyperidle/harness-registry/test-utils` barrel — dev-world (lives under
 * `__tests__/`), consumed only by other packages' real-harness integration
 * tests (never by production code).
 *
 * @lore barrel so stopAllLiveHarnessSessions has a home alongside requireHarness without living inside it (wrong file) or requiring two-subpath imports
 */

export { stopAllLiveHarnessSessions } from "../cli-harness-adapter.js";
export {
	HARNESS_TEST_MODELS,
	type HarnessName,
	requireHarness,
	type SupportedHarnessName,
} from "./require-harness.js";
