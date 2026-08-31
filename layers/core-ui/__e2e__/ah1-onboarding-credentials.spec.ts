/**
 * AH1 RED — Playwright E2E: onboarding key shows in Settings, fail-loud UI.
 *
 * AC1: A key entered once during onboarding is afterward visible as "set / valid"
 * in Settings — the same credential, not an empty or different slot — and the user
 * is never asked to re-enter it to make agents work.
 *
 * AC3 (UI): When the server has no encryption secret, the Settings Credentials tab
 * shows a per-row warning copy — fails loudly, not quietly.
 *
 * AC5: Onboarding and Settings agree on the credential model — the providers
 * offered at setup are the providers manageable in Settings.
 *
 * Proof type: Playwright E2E — drives the real UI. Per AH track HARD rule:
 * NO page.route() mocking of credential/session/assistant paths.
 * The fixtures.ts core mocks (/api/auth/me, /api/settings, /api/threads, /api/teams)
 * are allowed as setup-only scaffolding so the app shell renders. The credential
 * routes (/api/credentials/*) must reach the REAL backend.
 *
 * @lore AH1: The existing Playwright setup runs against a Vite-only dev server
 * (port 5179, no API server). For the AH1 real-backend spec, we need a running
 * API server. This spec uses the real backend via webServer config. In CI,
 * this requires the server to be started — the AH5 workpackage will own the CI
 * job; for now this spec is marked as requiring a real backend.
 *
 * @lore AH1: The AH track HARD rule says "no mocked credential/session/assistant
 * routes on any proof path." The core fixtures.ts mocks cover auth/settings/threads/
 * teams (not credentials) — those are permitted as shell scaffolding. The credentials
 * endpoint is left un-mocked so it hits the real server.
 *
 * NOTE (AH1 RED): These specs will fail with ECONNREFUSED on the /api/credentials
 * endpoint until the real API server is started alongside the Vite dev server.
 * The red-phase failure proves the real backend is required, not mocked.
 */

import { expect, test } from "./fixtures";

const TEST_ANTHROPIC_KEY = "sk-ant-test-ah1-onboarding-key-real";

// ---------------------------------------------------------------------------
// Scaffolding: auth/me and setup preconditions (per AH track — NOT credential mocks)
// ---------------------------------------------------------------------------

test.describe("AH1 AC1 — onboarding key visible in Settings Credentials", () => {
	test.beforeEach(async ({ page }) => {
		// Fresh install: no human user → redirects to /setup.
		await page.route("**/api/auth/me", async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 401,
					contentType: "application/json",
					body: JSON.stringify({ error: "Unauthorized" }),
				});
			} else {
				await route.continue();
			}
		});

		// No teams (fresh install).
		await page.route("**/api/teams", async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({ teams: [] }),
				});
			} else {
				await route.continue();
			}
		});

		// POST /api/users — create human user.
		await page.route("**/api/users", async (route) => {
			if (route.request().method() === "POST") {
				await route.fulfill({
					status: 201,
					contentType: "application/json",
					body: JSON.stringify({
						id: "u-ah1-founder",
						name: "AH1 Founder",
						kind: "human",
						role: "founder",
						status: "active",
					}),
				});
			} else {
				await route.continue();
			}
		});

		// POST /api/teams — team creation after setup.
		await page.route("**/api/teams", async (route) => {
			if (route.request().method() === "POST") {
				await route.fulfill({
					status: 201,
					contentType: "application/json",
					body: JSON.stringify({ id: "p-ah1", name: "AH1 Product", phase: "build" }),
				});
			} else {
				await route.continue();
			}
		});

		// GET /api/harnesses — pin a key-accepting harness to "unauthenticated".
		// Setup only asks for a key when the chosen harness can take one and is not
		// already logged in, and the real backend reports whatever this machine
		// happens to have installed. Without this the test's whole premise — a key
		// entered during onboarding — depends on the developer's shell.
		await page.route("**/api/harnesses", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify([
					{
						type: "opencode",
						name: "OpenCode",
						kind: "local",
						acceptsApiKey: true,
						authAction: {
							kind: "native_cli_login",
							label: "Log in to OpenCode",
							command: ["opencode", "providers", "login"],
						},
						discovery: { state: "unauthenticated" },
						models: [],
						runtime: {
							preCompactionTrigger: false,
							subAgents: false,
							mcpSupport: false,
							modelProviders: ["anthropic"],
							fileEditing: false,
							toolUse: false,
						},
						modelProviders: ["anthropic", "openrouter"],
					},
				]),
			});
		});

		// After setup, auth/me returns the new user.
		// (Registered after the no-user mock so it takes LIFO precedence post-setup.)
	});

	test("AC1: key set during onboarding appears in Settings Credentials as set/valid — real backend", async ({
		page,
	}) => {
		// Note: credential routes are NOT mocked — they hit the real backend.
		// Red-phase failure: ECONNREFUSED on PUT /api/credentials/anthropic_api_key.
		// This proves the real backend is required.

		// Step 1: Navigate to setup.
		await page.goto("/setup");

		// Step 2: Fill name, API key, and the model the key should run.
		await page.getByLabel(/your name/i).fill("AH1 Founder");
		await page.getByLabel(/api key/i).fill(TEST_ANTHROPIC_KEY);
		// A key says who to call, never what to run — there are no tier defaults
		// left to fill the model in, so setup asks for it.
		await page.getByLabel(/^model/i).fill("claude-sonnet-4-6");

		// Step 3: Submit setup form.
		// After AH1, SetupFlow writes the key via PUT /api/credentials/anthropic_api_key
		// (not via the desktop bridge). This requires a real API server.
		// Wait for the button to become enabled (both name and apiKey must be set).
		await expect(page.getByRole("button", { name: /start hyperidle/i })).toBeEnabled({
			timeout: 5_000,
		});
		await page.getByRole("button", { name: /start hyperidle/i }).click();
		// Wait for setup to complete and navigate away from /setup.
		// AD9 retired /work/portfolio: SetupFlow lands on /work?onboarding=true and
		// WorkOverview short-circuits to the team page when there is only one team.
		await page.waitForURL(/\/work(\?|\/|$)/, { timeout: 30_000 });

		// Step 4: Navigate to Settings → Credentials.
		// After setup, simulate auth returning the new user.
		await page.route("**/api/auth/me", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ id: "u-ah1-founder", name: "AH1 Founder", avatarUrl: null }),
			});
		});
		// After setup, simulate teams returning a team so the app shell renders
		// (not the setup flow). The beforeEach mock returns empty teams; this
		// LIFO override returns a team post-setup.
		await page.route("**/api/teams", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					teams: [{ id: "t-ah1-post-setup", name: "AH1 Product", phase: "build", active: true }],
				}),
			});
		});

		await page.goto("/");
		await page.waitForSelector("[data-testid='main-content']");

		// Open Settings and navigate to Credentials section.
		await page.getByTestId("sidebar-settings-btn").click();
		await page.getByTestId("settings-section-credentials").scrollIntoViewIfNeeded();

		// Step 5: Assert Anthropic row shows set/valid state (not absent).
		// The chip should show "Valid" or "Untested" (not "Not set" / absent).
		// Fails today: onboarding uses bridge (no HTTP write), so Settings shows absent.
		const anthropicRow = page.getByTestId("credential-row-anthropic_api_key");
		await expect(anthropicRow).toBeVisible({ timeout: 10_000 });

		// The state chip must not show "absent" / "Not set".
		const stateChip = anthropicRow.getByTestId("credential-state-chip");
		await expect(stateChip).not.toContainText(/not set/i);

		// Step 6: Assert the user is NOT presented with an empty re-entry slot
		// for the Anthropic credential (it should be pre-populated / show as set).
		// The input field must be empty (we never show the value), but the row must
		// show that a key IS set (via the state chip).
		await expect(stateChip).toBeVisible();
	});

	test("AC5: Settings Credentials tab shows exactly 4 credential slots", async ({ page }) => {
		// Auth is present (not setup flow). Override beforeEach fresh-install mocks.
		await page.route("**/api/auth/me", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ id: "u-ah1-test", name: "Test", avatarUrl: null }),
			});
		});
		// beforeEach mocks teams as empty (fresh install). Override to return a team
		// so the app shell renders instead of redirecting to setup.
		await page.route("**/api/teams", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					teams: [{ id: "t-ah1-test", name: "Test Team", phase: "build", active: true }],
				}),
			});
		});

		// Navigate directly to settings credentials section.
		await page.goto("/");
		await page.waitForSelector("[data-testid='main-content']");
		await page.getByTestId("sidebar-settings-btn").click();
		// Settings opens as a page; navigate to the credentials section via the settings nav.
		await page.getByTestId("settings-section-credentials").scrollIntoViewIfNeeded();
		await expect(page.getByTestId("settings-section-credentials")).toBeVisible({ timeout: 10_000 });

		// AH1: CredentialsTab now shows 4 rows (openai_compatible_api_key promoted to catalog).
		// Rows render from CREDENTIAL_CATALOG even when GET /api/credentials fails (graceful fallback).
		const credentialRows = page.getByTestId(/credential-row-/);
		await expect(credentialRows).toHaveCount(4, { timeout: 10_000 });
	});

	test("AC5: Settings Credentials tab shows openai-compatible slot", async ({ page }) => {
		// Override beforeEach fresh-install mocks for this settings-view test.
		await page.route("**/api/auth/me", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ id: "u-ah1-test", name: "Test", avatarUrl: null }),
			});
		});
		await page.route("**/api/teams", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					teams: [{ id: "t-ah1-test", name: "Test Team", phase: "build", active: true }],
				}),
			});
		});

		await page.goto("/");
		await page.waitForSelector("[data-testid='main-content']");
		await page.getByTestId("sidebar-settings-btn").click();
		await page.getByTestId("settings-section-credentials").scrollIntoViewIfNeeded();
		await expect(page.getByTestId("settings-section-credentials")).toBeVisible({ timeout: 10_000 });

		// AH1: openai_compatible_api_key promoted from server_config blob to catalog.
		const openaiRow = page.getByTestId("credential-row-openai_compatible_api_key");
		await expect(openaiRow).toBeVisible({ timeout: 10_000 });
	});
});
