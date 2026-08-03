/**
 * AI2 — Dialog dismissal grammar: Esc-guard flow + confirmation rule (AC-1).
 *
 * Scenario 1 (authoring form): Bet pitch dialog — type pitch, press Esc once →
 *   guard strip visible, input intact, focus on "Keep editing",
 *   then Tab+Enter → Discard closes.
 *
 * Scenario 2 (confirmation): Kill-bet dialog — press Esc → closes immediately
 *   (confirmation-never-dirty rule §1.1, SANCTIONED CHANGE #1).
 *
 * Strategy: page.route() mocks. Tests extend Q3 and L16 — do not weaken
 * their existing assertions.
 *
 * @lore AI2: The guard strip must mount with focus on "Keep editing" — this is
 * verifiable via page.evaluate(document.activeElement.textContent). The keyboard
 * discard path (Tab+Enter → Discard) proves discard is reachable without mouse.
 *
 * @lore AI2 C-1 fix: BetCreateDialog uses ProseMirror (contenteditable), not a
 * textarea. The pitchField selector uses [contenteditable] and typing is done via
 * page.keyboard.type() after clicking into the editor.
 * The /api/bets mock uses the grouped shape {draft,active,completed,killed} so
 * useBets can flatten correctly. ≥1 active bet is included so the header
 * "New bet" button (data-testid=new-bet-btn) renders without needing the
 * EmptyState fallback.
 */

import { expect, test } from "./fixtures";

const BET_ID = "bet-dialog-dismissal-test";

function makeBetDetail(status = "active") {
	return {
		id: BET_ID,
		title: "Dismissal test bet",
		team: "Test Team",
		status,
		atRisk: false,
		tokenAppetite: null,
		tokensActual: null,
		progress: { done: 0, total: 0 },
		description: "# Test bet\n\nBody content.",
		tasks: [],
	};
}

/** Grouped bets response shape matching useBets hook expectations. */
function makeGroupedBets() {
	return {
		draft: [],
		active: [
			{
				id: BET_ID,
				title: "Dismissal test bet",
				teamId: "test-team-1",
				status: "active",
				description: "Test bet",
				atRisk: false,
			},
		],
		completed: [],
		killed: [],
	};
}

// AG3: BetCreateDialog deleted — bet creation is now a full-page route (/work/bet/new).
// The Esc-guard (isDirty) was provided by the Dialog primitive wrapping BetCreateDialog.
// The new WorkBetCreate page uses window.confirm instead (see WorkBetCreate.tsx @lore).
// These tests are skipped because the BetCreate dialog surface no longer exists.
// The Dialog Esc-guard contract is still tested via other Dialog hosts (kill-bet, etc).
test.describe
	.skip("AI2 — Authoring form Esc guard (AC-1, scenario 1) [AG3: BetCreateDialog deleted]", () => {
		test.beforeEach(async ({ page }) => {
			await page.route(`**/api/bets/${BET_ID}`, (route) =>
				route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify(makeBetDetail()),
				}),
			);
			// @lore AI2 C-1: grouped shape required by useBets hook; ≥1 active bet
			// ensures header "New bet" button (bets.length > 0) renders.
			await page.route("**/api/bets", (route) =>
				route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify(makeGroupedBets()),
				}),
			);
			await page.route("**/api/knowledge**", (route) =>
				route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({ items: [] }),
				}),
			);
		});

		test("type into BetCreate dialog, press Esc once → guard strip visible, input intact", async ({
			page,
		}) => {
			await page.goto("/work/portfolio");
			await expect(page.locator("[data-testid='work-portfolio-page']")).toBeVisible();

			// Open the bet-create dialog via the "New bet" header button (requires bets.length > 0)
			const createBtn = page.locator("[data-testid='new-bet-btn']");
			await expect(
				createBtn,
				"New bet button must be visible — bets mock must return ≥1 bet",
			).toBeVisible();
			await createBtn.click();

			// The dialog should be open
			await expect(page.getByRole("dialog")).toBeVisible();

			// BetCreateDialog uses ProseMirror (contenteditable) for the description field.
			// @lore AI2 C-1: BodyEditor renders a [contenteditable] div, not a textarea.
			// Click into it, then type via keyboard.
			const editor = page.locator("[role='dialog'] [contenteditable]").first();
			await expect(editor, "ProseMirror editor must be visible inside dialog").toBeVisible();
			await editor.click();
			await page.keyboard.type("My half-typed pitch");

			// Wait for isDirty to update (BodyEditor onChange fires asynchronously)
			await page.waitForTimeout(100);

			// Press Escape once — dirty dialog must NOT close; guard strip must appear
			await page.keyboard.press("Escape");

			// Dialog must still be open
			await expect(page.getByRole("dialog")).toBeVisible();

			// Guard strip must be visible
			const keepBtn = page.getByRole("button", { name: /keep editing/i });
			await expect(
				keepBtn,
				"Guard strip must appear after first Escape on dirty dialog",
			).toBeVisible();

			// Screenshot the guard state (AC-1 proof)
			await page.screenshot({ path: "test-results/ai2-guard-strip-visible.png" });
		});

		test("guard strip: focus lands on Keep editing (the safe default)", async ({ page }) => {
			await page.goto("/work/portfolio");
			await expect(page.locator("[data-testid='work-portfolio-page']")).toBeVisible();

			const createBtn = page.locator("[data-testid='new-bet-btn']");
			await expect(createBtn, "New bet button must be visible").toBeVisible();
			await createBtn.click();
			await expect(page.getByRole("dialog")).toBeVisible();

			const editor = page.locator("[role='dialog'] [contenteditable]").first();
			await expect(editor, "ProseMirror editor must exist inside dialog").toBeVisible();
			await editor.click();
			await page.keyboard.type("Typed input");
			await page.waitForTimeout(100);
			await page.keyboard.press("Escape");

			// Guard strip must appear
			await expect(
				page.getByRole("button", { name: /keep editing/i }),
				"Guard strip must appear",
			).toBeVisible();

			// Focus must be on Keep editing
			const focusedText = await page.evaluate(() => document.activeElement?.textContent?.trim());
			expect(focusedText).toMatch(/keep editing/i);
		});

		test("guard strip: Tab+Enter → Discard closes the dialog (keyboard discard path §1.2)", async ({
			page,
		}) => {
			await page.goto("/work/portfolio");
			await expect(page.locator("[data-testid='work-portfolio-page']")).toBeVisible();

			const createBtn = page.locator("[data-testid='new-bet-btn']");
			await expect(createBtn, "New bet button must be visible").toBeVisible();
			await createBtn.click();
			await expect(page.getByRole("dialog")).toBeVisible();

			const editor = page.locator("[role='dialog'] [contenteditable]").first();
			await expect(editor, "ProseMirror editor must exist inside dialog").toBeVisible();
			await editor.click();
			await page.keyboard.type("Draft pitch text");
			await page.waitForTimeout(100);
			await page.keyboard.press("Escape");

			// Guard strip appears — focus is on Keep editing
			await expect(
				page.getByRole("button", { name: /keep editing/i }),
				"Guard strip must appear",
			).toBeVisible();

			// Press Tab to move to Discard
			await page.keyboard.press("Tab");

			// Focused element should be Discard
			const focusedText = await page.evaluate(() => document.activeElement?.textContent?.trim());
			expect(focusedText).toMatch(/^discard$/i);

			// Press Enter to activate Discard
			await page.keyboard.press("Enter");

			// Dialog must be closed
			await expect(page.getByRole("dialog")).not.toBeVisible();
		});
	});

test.describe("AI2 — Confirmation dialog always closes on Esc (AC-1, scenario 2)", () => {
	test.beforeEach(async ({ page }) => {
		// @lore AI2 C-1 fix: WorkBet page requires many API endpoints.
		// @lore AI2: Playwright LIFO — last-registered route wins. Register from
		// broadest to most specific so specific routes take precedence.

		// 1. Broad: any bet sub-resource → empty 200 (fallback)
		await page.route(`**/api/bets/${BET_ID}/**`, (route) =>
			route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) }),
		);
		// 2. More specific: artifact-thread-summary needs correct shape
		await page.route(`**/api/bets/${BET_ID}/artifact-thread-summary`, (route) =>
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ summaries: [], totalCount: 0, truncated: false }),
			}),
		);
		// 3. Most specific: main bet endpoint
		await page.route(`**/api/bets/${BET_ID}`, (route) =>
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(makeBetDetail()),
			}),
		);
		await page.route("**/api/bets/*/kill", (route) =>
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ ok: true }),
			}),
		);
		await page.route("**/api/artifacts**", (route) =>
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ items: [], nextCursor: null }),
			}),
		);
		await page.route("**/api/threads**", (route) =>
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ threads: [], nextCursor: null }),
			}),
		);
		await page.route("**/api/notifications**", (route) =>
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ unseenCount: 0, rows: [] }),
			}),
		);
		await page.route("**/api/knowledge/triage-count", (route) =>
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ count: 0 }),
			}),
		);
	});

	test("kill-confirm: Esc with empty reason closes dialog (confirmation-never-dirty rule)", async ({
		page,
	}) => {
		await page.goto(`/work/bet/${BET_ID}`);

		// Wait for network to settle and bet data to render (not just loading skeleton)
		await page.waitForLoadState("networkidle");

		// The overflow button only renders in the success state (bet loaded).
		// @lore AI2: work-bet-page testid appears in loading + error + success; wait for
		// the overflow button directly to confirm the success state is rendered.
		const overflowBtn = page.locator("[data-testid='bet-overflow-btn']");
		await expect(
			overflowBtn,
			"bet-overflow-btn must be visible — WorkBet success state must render",
		).toBeVisible({ timeout: 15000 });
		await overflowBtn.click();
		const killItem = page.locator("[data-bet-action='kill']");
		await expect(killItem, "Kill dropdown item must appear").toBeVisible();
		await killItem.click();
		await expect(page.getByRole("dialog")).toBeVisible();

		// Press Escape — reason is empty — dialog must close (isDirty=false always for confirmations)
		await page.keyboard.press("Escape");
		await expect(page.getByRole("dialog")).not.toBeVisible();
	});

	test("kill-confirm: Esc with typed reason ALSO closes dialog (confirmation-never-dirty rule)", async ({
		page,
	}) => {
		await page.goto(`/work/bet/${BET_ID}`);
		await page.waitForLoadState("networkidle");

		const overflowBtn = page.locator("[data-testid='bet-overflow-btn']");
		await expect(
			overflowBtn,
			"bet-overflow-btn must be visible — WorkBet success state must render",
		).toBeVisible({ timeout: 15000 });
		await overflowBtn.click();
		const killItem = page.locator("[data-bet-action='kill']");
		await expect(killItem, "Kill dropdown item must appear").toBeVisible();
		await killItem.click();
		await expect(page.getByRole("dialog")).toBeVisible();

		// Type a reason — this is a confirmation, NOT an authoring surface → isDirty stays false
		const reasonField = page.locator("[role='dialog'] textarea").first();
		if ((await reasonField.count()) > 0) {
			await reasonField.fill("Market pivoted completely");
		}

		// Escape must STILL close — scenario 2 is binding and unqualified
		await page.keyboard.press("Escape");
		await expect(page.getByRole("dialog")).not.toBeVisible();
	});
});
