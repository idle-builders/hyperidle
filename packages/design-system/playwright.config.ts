import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "src/__tests__",
	testMatch: "visual-regression.test.ts",
	fullyParallel: false,
	workers: 1,
	reporter: [["html", { open: "never" }]],
	use: {
		viewport: { width: 1024, height: 900 },
		colorScheme: "dark",
	},
	projects: [{ name: "chromium", use: { browserName: "chromium" } }],
	webServer: {
		command: "bun run serve",
		port: 8098,
		reuseExistingServer: true,
	},
});
