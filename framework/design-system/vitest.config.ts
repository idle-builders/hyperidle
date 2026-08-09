import { defineProject } from "vitest/config";

export default defineProject({
	test: {
		name: "design-system",
		// Include the default `**/node_modules/**` exclusion alongside the
		// design-system-specific filters so a dependency that ships
		// `*.test.ts` files (e.g. zod) doesn't get picked up by the runner.
		// Vitest project-level `exclude` replaces the root's value rather
		// than extending it.
		exclude: ["**/node_modules/**", "**/dist/**", "**/*.integration.test.{ts,tsx}"],
		// Inline the framework packages this one imports so their transitive `zod` import
		// resolves under the project's node resolver.
		server: {
			deps: {
				inline: [
					"@hyperidle/block-derivation",
					"@hyperidle/domain-model",
					"@hyperidle/presentation-format",
				],
			},
		},
		// @lore R4: pool:'forks' required for design-system React tests.
		// Multiple test files mutate globalThis.IS_REACT_ACT_ENVIRONMENT and use
		// React.createRoot() in the same jsdom environment. With the default
		// 'threads' pool, async React scheduler work from one file (e.g.
		// CodePayload with useState) leaks into the next file's rendering,
		// causing "not wrapped in act()" warnings and empty container assertions.
		// 'forks' gives each file a completely separate process, preventing
		// cross-file React state contamination. Slower but reliable.
		pool: "forks",
		hookTimeout: 30_000,
		testTimeout: 30_000,
		// @lore AG4: jest-dom matchers needed for Breadcrumb + future component
		// tests that use @testing-library/react render/screen. Pre-existing DS
		// tests use createRoot directly and are unaffected.
		setupFiles: ["./src/__testing__/test-setup.ts"],
	},
});
