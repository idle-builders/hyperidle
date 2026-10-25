import { defineProject } from "vitest/config";

export default defineProject({
	test: {
		name: "core-ui",
		include: ["src/**/*.test.{ts,tsx}"],
	},
});
