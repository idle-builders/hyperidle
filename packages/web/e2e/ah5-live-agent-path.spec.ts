/**
 * AH5: Live agent-path E2E proof.
 *
 * Asserts a real, no-mock streamed model response via the production path:
 *   onboarding → assistant agent configured → send prescriptive message
 *   → real OpenRouter LLM call → write_session_notes tool call → UI shows result.
 *
 * This spec runs ONLY in the local lane (`npm run -w @hyperidle/web test:e2e:ah5`),
 * not as part of the default test:e2e run. It requires OPENROUTER_API_KEY in your shell.
 *
 * AH5-own gating proof: the provisionSession-driven real-turn probe
 * (scripts/ah5-real-turn-probe.ts) is the primary AC4 proof. This UI spec
 * is the full end-to-end proof once AH3 lands.
 *
 * @lore AH5: The UI-trigger assertion (send-message → streamed-response →
 * tool-call-summaries row) is test.fixme()-gated until AH3 (message→turn
 * trigger) is merged. AH3 owns the trigger that routes a posted message into
 * a provisionSession call. Without AH3, posting a message does NOT start a
 * session turn — the overlay won't show a streamed response.
 * @lore AH5: un-fixme the UI-trigger block when AH3 trigger lands. Coordinate
 * with AH3 to confirm the streaming indicator testid and tool-call-summaries
 * testid that AH3 exposes on the AssistantOverlay.
 *
 * @lore AH5: No page.route() on assistant/session/credential/LLM/openrouter
 * paths. The no-mock guard (scripts/ah5-no-mock-guard.ts) asserts this
 * statically. Shell-scaffolding mocks (auth/me, teams, settings) are tolerated
 * only to render the app shell — they are NOT on the proof path.
 *
 * @lore AH5: The test-server (scripts/ah5-test-server.ts) pre-seeds the
 * OpenRouter credential encrypted into server_credentials. DbCredentialResolver
 * (production wiring) reads it — no EnvCredentialResolver on the proof path.
 */

import { expect, test } from "@playwright/test";

// The prescriptive prompt that deterministically triggers write_session_notes.
const SMOKE_PROMPT =
	"Call the write_session_notes tool with notes set to 'AH5-SMOKE-OK'. " +
	"Do not respond with prose; emit only the tool call.";

// ---------------------------------------------------------------------------
// Shell scaffolding mocks (NOT on the proof path)
// ---------------------------------------------------------------------------

/**
 * Set up minimal shell scaffolding so the app renders.
 * These mocks are NOT on the proof path (credential/session/LLM routes go real).
 */
async function setupShellMocks(page: Parameters<typeof test>[1]["page"]): Promise<void> {
	// No human user → redirect to /setup.
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
}

// ---------------------------------------------------------------------------
// Test: onboarding flow verifies the credential is pre-seeded
// ---------------------------------------------------------------------------

test.describe("AH5 AC1 — credential pre-seeded by test-server", () => {
	test("server_credentials row exists after test-server boot", async ({ request }) => {
		// The test-server seeds openrouter_api_key at boot.
		// Verify via the credentials API — no UI needed for this assertion.
		const res = await request.get("/api/credentials/openrouter_api_key");
		// Returns 200 with the credential metadata (not the plaintext value).
		expect(res.status()).toBe(200);
		const body = (await res.json()) as { name?: string; validationState?: string };
		expect(body.name).toBe("openrouter_api_key");
	});
});

// ---------------------------------------------------------------------------
// Test: UI-trigger assertion (AH3-gated)
// ---------------------------------------------------------------------------

test.describe("AH5 AC3 — real streamed response + write_session_notes tool call", () => {
	/**
	 * @lore AH5: This test block is test.fixme()-gated until AH3 lands.
	 *
	 * AH3 deliverable: the message→turn trigger that routes a posted message
	 * into provisionSession. Without AH3, POST /api/threads/{id}/messages inserts
	 * the row + emits thread_message_appended and stops — no session turn fires.
	 *
	 * @lore AH5: un-fixme when AH3 trigger lands. Verify these testids against
	 * what AH3 exposes on AssistantOverlay:
	 *   - streaming/working indicator testid
	 *   - assistant-response bubble testid
	 *   - data-testid="tool-call-summaries" row for write_session_notes
	 */
	test.fixme("send prescriptive message → write_session_notes tool-call-summaries row appears", async ({
		page,
	}) => {
		await setupShellMocks(page);
		await page.goto("/setup");

		// Onboarding: fill name, submit.
		await page.fill('[data-testid="setup-name-input"], input[type="text"]', "AH5 Test User");
		await page.click('[data-testid="setup-submit"], button[type="submit"]');
		await page.waitForURL("**/work/**");

		// Navigate to assistant overlay.
		// @lore AH5: Use whatever trigger AH3 exposes for opening the Assistant overlay.
		// Coordinate with AH3 — the testid below is a placeholder.
		await page.click('[data-testid="assistant-trigger"], [data-testid="sidebar-assistant"]');
		await page.waitForSelector('[data-testid="assistant-overlay"]');

		// Send the prescriptive message.
		await page.fill(
			'[data-testid="assistant-composer"] textarea, [data-testid="message-input"]',
			SMOKE_PROMPT,
		);
		await page.press(
			'[data-testid="assistant-composer"] textarea, [data-testid="message-input"]',
			"Enter",
		);

		// Wait for a non-welcome streamed response.
		// @lore AH5: AH3 exposes the streaming indicator testid — use it here.
		// Once AH3 lands: await page.waitForSelector('[data-testid="streaming-indicator"]');
		// Then: await page.waitForSelector('[data-testid="streaming-indicator"]', { state: "hidden" });

		// Assert write_session_notes tool-call-summaries row.
		const toolCallRow = page.locator('[data-testid="tool-call-summaries"]');
		await expect(toolCallRow).toBeVisible({ timeout: 60_000 });
		await expect(toolCallRow).toContainText("write_session_notes");

		// Screenshot the answered state.
		await page.screenshot({ path: "playwright-report-ah5/ah5-smoke-result.png" });
	});
});

// ---------------------------------------------------------------------------
// Test: probe output artifact verification
// ---------------------------------------------------------------------------

test.describe("AH5 AC5 — cost report artifact", () => {
	test.fixme("ah5-cost.json is written and contains totalCostCents > 0", async () => {
		/**
		 * @lore AH5: This test is fixme-gated because it depends on the probe
		 * having run (step 5 of `npm run smoke:ah5`, before the Playwright lane).
		 * The probe is a separate script; in direct Playwright runs, it has not run.
		 * The local lane budget-assert step validates ah5-cost.json independently.
		 *
		 * To un-fixme: integrate probe execution into a globalSetup that runs
		 * before the Playwright tests, then assert on the written file.
		 * Or: run the probe as a separate step and skip this test (the local lane
		 * validates the cost via ah5-assert-budget.ts).
		 */
	});
});
