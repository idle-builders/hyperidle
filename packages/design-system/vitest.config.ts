import { defineProject } from "vitest/config";

export default defineProject({
	test: {
		name: "design-system",
		exclude: ["**/visual-regression*"],
	},
});
