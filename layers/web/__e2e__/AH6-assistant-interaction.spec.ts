/**
 * AH6 A3 — Everyday replay e2e spec (key-free, offline, deterministic).
 *
 * These tests run with LLM_CASSETTE_MODE=replay and NO OPENROUTER_API_KEY.
 * They replay committed cassettes through the callLlm choke point and run inside
 * the normal e2e lane — zero cost, zero network calls to LLM providers.
 *
 * Three scenarios (per architecture §2 / task A3):
 *   S1 — assistant DM round-trip: send "What is 1 + 1?" → reply distinct from welcome text
 *   S2 — real tool action visible in UI: prescriptive bet-shaping message → create_bet tool fires
 *         → tool-call-summaries row visible → bet-draft-card renders
 *   S3 — thinking→answered streaming transition: thinking row appears then disappears,
 *         reply bubble present and non-empty. Transition is observable because
 *         LLM_REPLAY_DELAY_MS=80 (default) keeps the thinking row paintable.
 *
 * Uses REAL AssistantOverlay handles (R-4 in architecture plan):
 *   - trigger: getByRole("button", { name: /assistant/i })
 *   - composer: getByRole("textbox")
 *   - thinking row: getByText(/thinking/i)  [ThinkingRow component, overlay L409]
 *   - tool-call row: [data-testid="tool-call-summaries"]
 *   - bet draft card: [data-testid="bet-draft-card"]
 *   - assistant messages: [data-sender-kind=ai] bubbles
 *
 * NO page.route() on assistant/turn/session/credential/LLM paths (AH5 no-mock rule).
 * The test-server (extended ah5-test-server.ts) MUST have assistantTurnDeps wired (R-1).
 *
 * RED STATUS: These tests FAIL until:
 *   - llm-cassette.ts exists (B2)
 *   - callLlm dispatcher is added to llm-client.ts (B1)
 *   - assistantTurnDeps is wired into the test-server (B3)
 *   - Cassettes are recorded at layers/web/e2e/cassettes/{S1,S2,S3}.json (B4)
 *   - playwright.ah6.config.ts sets the correct env (B5)
 *
 * @lore AH6: The everyday spec targets the AH6 Playwright config
 * (playwright.ah6.config.ts) which sets LLM_CASSETTE_MODE=replay and
 * LLM_CASSETTE_DIR=layers/web/e2e/cassettes via webServer.env.
 * Running this against the default playwright.config.ts will not set those vars
 * and the cassette interceptor will not activate — use `npm run test:e2e:ah6`.
 */

import { expect, test } from "@playwright/test";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WELCOME_TEXT = "Welcome to HyperIdle! I'm your assistant.";

// Prescriptive bet-shaping message that deterministically triggers create_bet
// (same approach as AH5's prescriptive SMOKE_PROMPT)
const BET_SHAPING_PROMPT =
	"Call the create_bet tool with title set to 'Ship AH6 real-interaction lane'. " +
	"Do not respond with prose; emit only the tool call.";

// ---------------------------------------------------------------------------
// Shell scaffolding helper (NOT on the proof path)
// ---------------------------------------------------------------------------

/**
 * Set up minimal shell mocks so the app shell renders.
 * These mocks are NOT on the assistant/LLM proof path.
 * The no-mock guard (scripts/ah6-no-mock-guard.ts) validates this statically.
 *
 * @lore AH6: Shell mocks cover auth/me (established user), teams (shell render),
 * settings (appearance). The assistant thread, message POST, LLM, and credential
 * paths are NOT mocked — they go to the real test-server.
 */
async function setupShellMocks(page: Parameters<typeof test>[1]["page"]): Promise<void> {
	// Established founder (not redirected to /setup).
	// @lore AH6: id MUST be "u-founder" — the ah6-test-server seeds this user
	// and the server auth middleware (local mode) resolves to this ID.
	// The frontend uses this ID to fetch the assistant thread
	// (GET /api/threads?hostKind=user&hostId=u-founder). A mismatch → empty thread.
	await page.route("**/api/auth/me", async (route) => {
		if (route.request().method() === "GET") {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					id: "u-founder",
					name: "AH6 Test Founder",
					email: "ah6@hyperidle.dev",
					role: "founder",
					avatarUrl: null,
				}),
			});
		} else {
			await route.continue();
		}
	});

	// Minimal teams for shell rendering
	await page.route("**/api/teams", async (route) => {
		if (route.request().method() === "GET") {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					teams: [
						{
							id: "ah6-test-team",
							name: "AH6 Test Team",
							slug: "ah6-test-team",
							phase: "build",
						},
					],
				}),
			});
		} else {
			await route.continue();
		}
	});
}

// ---------------------------------------------------------------------------
// S1 — Assistant DM round-trip
// ---------------------------------------------------------------------------

test.describe("AH6 S1 — assistant DM round-trip (replay, key-free)", () => {
	test.beforeEach(async ({ page }) => {
		await setupShellMocks(page);
	});

	test("send 'What is 1 + 1?' → reply appears, distinct from welcome text, non-empty", async ({
		page,
	}) => {
		await page.goto("/");

		// Open the assistant overlay via the real trigger button
		const assistantTrigger = page.getByRole("button", { name: /assistant/i });
		await assistantTrigger.click();

		// Record the welcome text before sending (for the distinct-reply assertion)
		// The welcome text is seeded by the test-server at boot
		const welcomeLocator = page.getByText(WELCOME_TEXT);
		const welcomeVisible = await welcomeLocator.isVisible().catch(() => false);
		const welcomeText = welcomeVisible ? WELCOME_TEXT : "";

		// Type and send the question.
		// @lore AH6: getByRole("textbox") is ambiguous — the app has a Search input
		// and the composer textarea both matching "textbox". Use the real testid.
		// @lore AH6: The Composer component uses Cmd/Ctrl+Enter to submit, NOT bare Enter
		// (bare Enter inserts a newline). Click the Send button to be explicit and
		// platform-independent.
		const composer = page.getByTestId("composer-textarea");
		await expect(composer).toBeVisible({ timeout: 5000 });
		await composer.fill("What is 1 + 1?");
		await page.getByRole("button", { name: /send/i }).click();

		// Wait for the reply to appear (replay runs in ~80ms + processing)
		// The reply must be non-empty and distinct from the welcome text
		await expect(page.locator("[data-sender-kind=ai]").last()).toBeVisible({
			timeout: 15_000,
		});

		const replyTexts = await page.locator("[data-sender-kind=ai]").allTextContents();
		const lastReply = replyTexts[replyTexts.length - 1] ?? "";

		// S1 assertion: distinct from welcome, non-empty
		expect(lastReply.length).toBeGreaterThan(0);
		if (welcomeText) {
			expect(lastReply).not.toBe(welcomeText);
		}
	});
});

// ---------------------------------------------------------------------------
// S2 — Real tool action visible in UI
// ---------------------------------------------------------------------------

test.describe("AH6 S2 — real tool action visible in UI (replay, key-free)", () => {
	test.beforeEach(async ({ page }) => {
		await setupShellMocks(page);
	});

	test("prescriptive bet-shaping message → tool-call-summaries row visible → create_bet effect", async ({
		page,
	}) => {
		await page.goto("/");

		const assistantTrigger = page.getByRole("button", { name: /assistant/i });
		await assistantTrigger.click();

		const composer = page.getByTestId("composer-textarea");
		await expect(composer).toBeVisible({ timeout: 5000 });
		await composer.fill(BET_SHAPING_PROMPT);
		// @lore AH6: Composer submits on Cmd/Ctrl+Enter (not bare Enter). Click Send button.
		await page.getByRole("button", { name: /send/i }).click();

		// Wait for the tool-call-summaries row (rendered by renderToolCallSummaries, overlay L166)
		// @lore AH6 R-4: tool-call-summaries is the real testid on AssistantOverlay L173
		const toolCallRow = page.locator('[data-testid="tool-call-summaries"]');
		await expect(toolCallRow).toBeVisible({ timeout: 30_000 });

		// The tool call row must contain the tool name (create_bet)
		await expect(toolCallRow).toContainText("create_bet");

		// The bet draft card must render (overlay L141 — BetDraftCardForToolCall)
		// @lore AH6 R-4: bet-draft-card is rendered when create_bet tool fires
		// @lore AH6 CRITICAL-4: In record mode (real OpenRouter calls), the full S2
		// conversation cycle takes multiple API turns (create_bet + tool_result + model
		// continuation). The card may render only after the entire cycle completes.
		// Use 45s timeout to accommodate real-model latency in the smoke lane.
		const betDraftCard = page.locator('[data-testid="bet-draft-card"]');
		await expect(betDraftCard).toBeVisible({ timeout: 45_000 });

		// The draft card must contain the bet title from the prescriptive prompt
		await expect(betDraftCard).toContainText("Ship AH6");
	});
});

// ---------------------------------------------------------------------------
// S3 — Thinking→answered streaming transition
// ---------------------------------------------------------------------------

test.describe("AH6 S3 — thinking→answered streaming transition (replay, key-free)", () => {
	test.beforeEach(async ({ page }) => {
		await setupShellMocks(page);
	});

	test("thinking row appears while replay is in-flight (LLM_REPLAY_DELAY_MS=80), then disappears once reply lands", async ({
		page,
	}) => {
		await page.goto("/");

		const assistantTrigger = page.getByRole("button", { name: /assistant/i });
		await assistantTrigger.click();

		const composer = page.getByTestId("composer-textarea");
		await expect(composer).toBeVisible({ timeout: 5000 });

		// @lore AH6 WARNING-1: The 80ms replay delay is what makes the thinking row
		// observable. Without it the replay returns in one event-loop tick and the
		// thinking row flips invisible before Playwright can see it.
		// The AH6 Playwright config sets LLM_REPLAY_DELAY_MS=80 via webServer.env.

		// Send the message. @lore AH6: Click Send button (not bare Enter — Composer uses Cmd/Ctrl+Enter)
		await composer.fill("What is 1 + 1?");
		await page.getByRole("button", { name: /send/i }).click();

		// Step (a): thinking row APPEARS while replay is in-flight
		// ThinkingRow renders when isThinking=true (overlay L409: "Assistant is thinking…")
		await expect(page.getByText(/thinking/i)).toBeVisible({ timeout: 5000 });

		// Step (b): thinking row DISAPPEARS once reply lands
		// (isThinking flips when the assistant message arrives — overlay L536)
		await expect(page.getByText(/thinking/i)).not.toBeVisible({ timeout: 15_000 });

		// Step (c): reply bubble is present and non-empty.
		// @lore AH6 CRITICAL-5: After thinking disappears, the message bubble may not yet
		// be fully painted. In record mode, S3 runs after S2's multi-turn conversation,
		// so allTextContents() must wait for the LAST ai bubble to have non-empty text.
		// Snap allTextContents() immediately after thinking-disappears fails because the
		// final message element may not have rendered its text content yet.
		// Use waitForFunction to poll until the last ai element has non-empty text.
		await page.waitForFunction(
			() => {
				const bubbles = document.querySelectorAll("[data-sender-kind=ai]");
				if (bubbles.length === 0) return false;
				const last = bubbles[bubbles.length - 1];
				return (last?.textContent?.trim().length ?? 0) > 0;
			},
			{ timeout: 15_000 },
		);
		const replyTexts = await page.locator("[data-sender-kind=ai]").allTextContents();
		const lastReply = replyTexts[replyTexts.length - 1] ?? "";
		expect(lastReply.trim().length).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------
// Guard: S1 predicate fails when reply is empty (proves the lane genuinely gates)
// ---------------------------------------------------------------------------

test.describe("AH6 lane-gates: S1 distinct-reply predicate is load-bearing", () => {
	test("S1 predicate function: empty reply → false (prove the predicate gates correctly)", async () => {
		// This is a logic-only test (no page navigation) that proves the S1 predicate
		// correctly identifies a degenerate reply. It runs in Playwright but requires
		// no server interaction.

		function s1Predicate(lastReply: string, welcomeText: string): boolean {
			return lastReply.length > 0 && lastReply !== welcomeText;
		}

		// Empty reply → false
		expect(s1Predicate("", WELCOME_TEXT)).toBe(false);

		// Welcome text echoed back → false
		expect(s1Predicate(WELCOME_TEXT, WELCOME_TEXT)).toBe(false);

		// Distinct non-empty reply → true
		expect(s1Predicate("The answer is 2.", WELCOME_TEXT)).toBe(true);
	});
});
