/**
 * `@hyperidle/harness-registry/test-fixtures` — published real-harness test
 * support, the same shape as `@hyperidle/db/test-fixtures`: a package that
 * needs another package's dev-world helpers imports this subpath, never a
 * relative path into the owning package's own `__tests__/` directory (that
 * bypasses the package's declared face — governance can only see a crossing
 * at the `exports` map, not a raw relative specifier).
 *
 * Re-exports `../__tests__/harness-sandbox.ts` in full: the sandbox
 * directory, clean-env, and auth-probe helpers every real-binary test
 * (in this package and any cross-package caller) needs.
 */

export {
	buildCleanEnv,
	createHarnessSandbox,
	type HarnessSandbox,
	isHarnessAuthed,
	provisionClaudeSandbox,
	provisionCodexHome,
	requireHarnessAuthed,
} from "../__tests__/harness-sandbox.js";
