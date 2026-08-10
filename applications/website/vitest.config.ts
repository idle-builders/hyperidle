import { defineProject } from "vitest/config";

export default defineProject({
	test: {
		name: "website",
		include: ["src/**/*.test.ts"],
		exclude: ["**/*.integration.test.ts"],
	},
});
