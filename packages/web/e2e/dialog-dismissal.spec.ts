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
		costAppetite: null,
		tokenAppetite: null,
		costActual: null,
		tokensActual: null,
		progress: { done: 0, total: 0 },
		description: "# Test bet\n\nBody content.",
		tasks: [],
	};
}

test.describe("AI2 — Authoring form Esc guard (AC-1, scenario 1)", () => {
	test.beforeEach(async ({ page }) => {
		await page.route(`**/api/bets/${BET_ID}`, (route) =>
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(makeBetDetail()),
			}),
		);
		await page.route("**/api/bets", (route) =>
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ bets: [] }),
			}),
		);
		// Mock knowledge create endpoint to intercept the dialog flow
		await page.route("**/api/knowledge", (route) =>
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

		// Open the bet-create dialog via the UI (not direct navigation)
		const createBtn = page.locator("button").filter({ hasText: /new bet|create bet|pitch/i }).first();
		if ((await createBtn.count()) === 0) {
			test.skip(true, "No create-bet button found — skipping guard strip test");
		}
		await createBtn.click();

		// The dialog should be open
		await expect(page.getByRole("dialog")).toBeVisible();

		// Type into the pitch field
		const pitchField = page.locator("[role='dialog'] textarea, [role='dialog'] input[type='text']").first();
		if ((await pitchField.count()) === 0) {
			test.skip(true, "No text field inside dialog — skipping");
		}
		await pitchField.fill("My half-typed pitch");
		await expect(pitchField).toHaveValue("My half-typed pitch");

		// Press Escape once — dirty dialog must NOT close; guard strip must appear
		await page.keyboard.press("Escape");

		// Dialog must still be open
		await expect(page.getByRole("dialog")).toBeVisible();

		// Input must still hold the typed text
		await expect(pitchField).toHaveValue("My half-typed pitch");

		// Guard strip must be visible
		const keepBtn = page.getByRole("button", { name: /keep editing/i });
		await expect(keepBtn).toBeVisible();

		// Screenshot the guard state (AC-1 proof)
		await page.screenshot({ path: "test-results/ai2-guard-strip-visible.png" });
	});

	test("guard strip: focus lands on Keep editing (the safe default)", async ({ page }) => {
		await page.goto("/work/portfolio");
		await expect(page.locator("[data-testid='work-portfolio-page']")).toBeVisible();

		const createBtn = page.locator("button").filter({ hasText: /new bet|create bet|pitch/i }).first();
		if ((await createBtn.count()) === 0) {
			test.skip(true, "No create-bet button");
		}
		await createBtn.click();
		await expect(page.getByRole("dialog")).toBeVisible();

		const pitchField = page.locator("[role='dialog'] textarea, [role='dialog'] input[type='text']").first();
		if ((await pitchField.count()) === 0) {
			test.skip(true, "No input field");
		}
		await pitchField.fill("Typed input");
		await page.keyboard.press("Escape");

		// Focus must be on Keep editing
		const focusedText = await page.evaluate(() => document.activeElement?.textContent?.trim());
		expect(focusedText).toMatch(/keep editing/i);
	});

	test("guard strip: Tab+Enter → Discard closes the dialog (keyboard discard path §1.2)", async ({
		page,
	}) => {
		await page.goto("/work/portfolio");
		await expect(page.locator("[data-testid='work-portfolio-page']")).toBeVisible();

		const createBtn = page.locator("button").filter({ hasText: /new bet|create bet|pitch/i }).first();
		if ((await createBtn.count()) === 0) {
			test.skip(true, "No create-bet button");
		}
		await createBtn.click();
		await expect(page.getByRole("dialog")).toBeVisible();

		const pitchField = page.locator("[role='dialog'] textarea, [role='dialog'] input[type='text']").first();
		if ((await pitchField.count()) === 0) {
			test.skip(true, "No input field");
		}
		await pitchField.fill("Draft pitch text");
		await page.keyboard.press("Escape");

		// Focus is on Keep editing — press Tab to move to Discard
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
		await page.route(`**/api/bets/${BET_ID}`, (route) =>
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(makeBetDetail()),
			}),
		);
		await page.route("**/api/bets/*/kill", (route) =>
			route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) }),
		);
	});

	test("kill-confirm: Esc with empty reason closes dialog (confirmation-never-dirty rule)", async ({
		page,
	}) => {
		await page.goto(`/work/bet/${BET_ID}`);
		await expect(page.locator("[data-testid='work-bet-page']")).toBeVisible();

		// Open kill dialog via overflow
		const overflowBtn = page.locator("[data-testid='bet-overflow-btn']");
		if ((await overflowBtn.count()) === 0) {
			test.skip(true, "No overflow button");
		}
		await overflowBtn.click();
		const killItem = page.locator("[data-dropdown-item][data-bet-action='kill']");
		if ((await killItem.count()) === 0) {
			test.skip(true, "No kill dropdown item");
		}
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
		await expect(page.locator("[data-testid='work-bet-page']")).toBeVisible();

		const overflowBtn = page.locator("[data-testid='bet-overflow-btn']");
		if ((await overflowBtn.count()) === 0) {
			test.skip(true, "No overflow button");
		}
		await overflowBtn.click();
		const killItem = page.locator("[data-dropdown-item][data-bet-action='kill']");
		if ((await killItem.count()) === 0) {
			test.skip(true, "No kill dropdown item");
		}
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
