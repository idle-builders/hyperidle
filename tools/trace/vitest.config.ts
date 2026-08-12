import { defineProject } from "vitest/config";

export default defineProject({
	test: {
		name: "trace",
		include: ["*.test.ts"],
		exclude: ["**/*.integration.test.{ts,tsx}"],
	},
});
