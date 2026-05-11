import { defineProject } from "vitest/config";

export default defineProject({
	test: {
		name: "scripts",
		include: ["__tests__/**/*.test.ts"],
	},
});
