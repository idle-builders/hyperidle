import { defineProject } from "vitest/config";

export default defineProject({
	test: {
		name: "setup",
		// This project covers src/**/*.test.{ts,tsx} (e.g. setup-cli.test.ts).
		// The relocated factory suites are all *.integration.test.ts, picked up
		// by vitest.integration.config.ts's "service" project instead (its
		// include glob already covers `tools/**`).
		include: ["src/**/*.test.{ts,tsx}"],
		exclude: ["**/*.integration.test.{ts,tsx}"],
	},
});
