import { defineProject } from "vitest/config";

export default defineProject({
	test: {
		name: "setup",
		// No unit tests today — the relocated factory suites are all
		// *.integration.test.ts, picked up by vitest.integration.config.ts's
		// "service" project (its include glob already covers `tools/**`).
		include: ["src/**/*.test.{ts,tsx}"],
		exclude: ["**/*.integration.test.{ts,tsx}"],
	},
});
