/**
 * E2E against the real server on a freshly seeded demo world — no mocked API. The server and
 * vite run on their own ports so a `npm run dev` beside it is never the one under test, and
 * each run seeds a new database in a temp folder. Local only.
 *
 * First start needs a fresh install: a second server on an empty database, run the way the
 * desktop app runs it — looking for the agent programs on this computer, so at least one of
 * them must be installed and signed in here.
 */
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, defineConfig, devices } from "@playwright/test";

const SERVER_PORT = 3102;
const WEB_PORT = 5182;
const FRESH_SERVER_PORT = 3103;
const FRESH_WEB_PORT = 5183;
const dbPath = join(mkdtempSync(join(tmpdir(), "hyperidle-e2e-")), "db");
const freshDbPath = join(mkdtempSync(join(tmpdir(), "hyperidle-e2e-fresh-")), "db");
const repoRoot = join(import.meta.dirname, "../..");
const browser = {
	...devices["Desktop Chrome"],
	// The installed Chrome stands in when Playwright's own browser was never downloaded.
	...(existsSync(chromium.executablePath()) ? {} : { channel: "chrome" as const }),
};

export default defineConfig({
	testDir: "./__e2e__",
	fullyParallel: false,
	workers: 1,
	timeout: 30_000,
	expect: { timeout: 10_000 },
	reporter: "list",
	use: {
		baseURL: `http://localhost:${WEB_PORT}`,
		trace: "retain-on-failure",
	},
	projects: [
		{
			name: "chromium",
			testIgnore: /(review|document|people|plugins|find|start)\.spec\.ts$/,
			use: browser,
		},
		// Deciding reviews, writing in documents, asking and changing plugins change what the other specs
		// read, so they run after them on the same world.
		{
			name: "after-the-rest",
			testMatch: /(review|document|people|plugins|find)\.spec\.ts$/,
			dependencies: ["chromium"],
			use: browser,
		},
		{
			name: "first-start",
			testMatch: /start\.spec\.ts$/,
			use: { ...browser, baseURL: `http://localhost:${FRESH_WEB_PORT}` },
		},
	],
	webServer: [
		{
			command: `npm run setup -- --profile laptop --db-path ${dbPath} --demo && npm run -w @hyperidle/remote-server start`,
			cwd: repoRoot,
			url: `http://localhost:${SERVER_PORT}/health`,
			reuseExistingServer: false,
			timeout: 180_000,
			// No agent ever runs: a dispatch waits in the queue, so starting a task again starts nothing real.
			env: { DATABASE_URL: dbPath, PORT: String(SERVER_PORT), HYPERIDLE_LOCAL_MAX_CONCURRENT: "0" },
		},
		{
			command: `npm run setup -- --profile laptop --db-path ${freshDbPath} && node --import tsx --input-type=module -e "await (await import('@hyperidle/remote-server/create-server')).createServer(${FRESH_SERVER_PORT}, { topology: 'local' })"`,
			cwd: repoRoot,
			url: `http://localhost:${FRESH_SERVER_PORT}/health`,
			reuseExistingServer: false,
			timeout: 180_000,
			env: {
				DATABASE_URL: freshDbPath,
				HYPERIDLE_API_KEY: "hyperidle-dev-local",
				HYPERIDLE_LOCAL_MAX_CONCURRENT: "0",
			},
		},
		{
			command: `npx vite --port ${FRESH_WEB_PORT} --strictPort`,
			url: `http://localhost:${FRESH_WEB_PORT}`,
			reuseExistingServer: false,
			timeout: 60_000,
			env: { HYPERIDLE_API_URL: `http://localhost:${FRESH_SERVER_PORT}` },
		},
		{
			command: `npx vite --port ${WEB_PORT} --strictPort`,
			url: `http://localhost:${WEB_PORT}`,
			reuseExistingServer: false,
			timeout: 60_000,
			env: { HYPERIDLE_API_URL: `http://localhost:${SERVER_PORT}` },
		},
	],
});
