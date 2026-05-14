import { defineProject } from "vitest/config";

export default defineProject({
	test: {
		name: "server",
		// Scope to source tests; `dist/**/*.test.js` are stale tsc artifacts.
		// Vitest project-level `include` replaces the default — keep in sync
		// with the test layout under `src/`.
		include: ["src/**/*.test.{ts,tsx}"],
		coverage: {
			// api-typesafety S5: enforce minimum coverage on new middleware/schema
			// code. The thresholds are set conservatively to not break the build on
			// existing under-covered code — they apply to the server package as a
			// whole. Ratchet upward as coverage improves.
			//
			// Targets: response-validator.ts (100%), validate.ts (existing),
			// schemas/bet.schema.ts (existing). All new code in this workpackage
			// must be fully covered by unit or integration tests.
			provider: "v8",
			include: ["src/**/*.ts"],
			exclude: [
				"src/**/*.test.ts",
				"src/**/__tests__/**",
				"src/index.ts",
				"src/routes/test-routes.ts",
			],
			thresholds: {
				// @lore api-typesafety S5: Start at 60/60/60/60 to not break the
				// build on existing gaps. The response-validator middleware itself
				// hits 100% via its dedicated unit test. Raise these as the test
				// suite matures.
				lines: 60,
				functions: 60,
				branches: 60,
				statements: 60,
			},
		},
	},
});
