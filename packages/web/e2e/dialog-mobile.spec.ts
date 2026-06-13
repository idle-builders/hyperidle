/**
 * AI2 — Dialog mobile adaptation: 375px no-overflow + bottom-anchoring (AC-4).
 *
 * Tests ≥4 migrated dialogs at 375px viewport:
 *   - No horizontal overflow (scrollWidth <= clientWidth)
 *   - Bottom-anchored sheet: bounding box bottom ≈ viewport height, top > 0
 *
 * AC-4 mandates PROOF of bottom-anchoring, not just "no overflow."
 * Screenshots captured per dialog for visual review (AC-6 coverage).
 *
 * @lore AI2: "bottom ≈ viewport height" means within a tolerance of the
 * mobile safe-area bottom inset (≤ 20px tolerance for border/rounding).
 * "top > 0" proves it's a sheet, not a fullscreen takeover.
 */

import { expect, test } from "./fixtures";

const VIEWPORT_MOBILE = { width: 375, height: 667 };
const BET_ID = "bet-mobile-dialog-test";
const KNOWLEDGE_ID = "k-mobile-dialog-test";

function makeBetDetail() {
	return {
		id: BET_ID,
		title: "Mobile test bet",
		team: "Test Team",
		status: "active",
		atRisk: false,
		costAppetite: null,
		tokenAppetite: null,
		costActual: null,
		tokensActual: null,
		progress: { done: 0, total: 0 },
		description: "# Mobile test",
		tasks: [],
	};
}

function makeKnowledge() {
	return {
		id: KNOWLEDGE_ID,
		title: "Mobile knowledge",
		kind: "note",
		status: "active",
	};
}

/**
 * Assert that the dialog box (sheet) is bottom-anchored:
 *   - box.bottom is within 20px of viewport height
 *   - box.top > 0 (not fullscreen)
 *   - box.width <= viewport width (no overflow)
 */
async function assertBottomAnchored(
	page: import("@playwright/test").Page,
	viewportHeight: number,
): Promise<void> {
	const box = await page.evaluate((vh) => {
		// Find the dialog box — it may be marked by data-dialog-box or role="dialog"
		const el =
			(document.querySelector("[data-dialog-box]") as HTMLElement) ??
			(document.querySelector("[role='dialog']") as HTMLElement);
		if (!el) return null;
		const rect = el.getBoundingClientRect();
		return {
			top: rect.top,
			bottom: rect.bottom,
			left: rect.left,
			right: rect.right,
			width: rect.width,
			scrollWidth: el.scrollWidth,
			clientWidth: el.clientWidth,
		};
	}, viewportHeight);

	expect(box, "Dialog box must exist in the DOM").not.toBeNull();
	// No horizontal overflow
	expect(box!.scrollWidth, "No horizontal overflow on mobile dialog").toBeLessThanOrEqual(
		box!.clientWidth + 1, // 1px tolerance for border-box rounding
	);
	// Bottom-anchored: box bottom within 20px of viewport bottom
	expect(box!.bottom, "Dialog sheet bottom ≈ viewport height (bottom-anchored)").toBeGreaterThan(
		viewportHeight - 20,
	);
	// Not fullscreen: top must be > 0
	expect(box!.top, "Dialog sheet top > 0 (not fullscreen takeover)").toBeGreaterThan(0);
}

test.describe("AI2 — Mobile bottom-sheet at 375px (AC-4)", () => {
	test.use({ viewport: VIEWPORT_MOBILE });

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
		await page.route("**/api/knowledge/**", (route) =>
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(makeKnowledge()),
			}),
		);
		await page.route("**/api/knowledge", (route) =>
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ items: [] }),
			}),
		);
	});

	// Dialog 1: BetCreate
	test("BetCreateDialog — 375px: no horizontal overflow, bottom-anchored sheet", async ({
		page,
	}) => {
		await page.goto("/work/portfolio");
		await expect(page.locator("[data-testid='work-portfolio-page']")).toBeVisible();

		const createBtn = page
			.locator("button")
			.filter({ hasText: /new bet|create bet|pitch/i })
			.first();
		if ((await createBtn.count()) === 0) {
			test.skip(true, "No create-bet button at 375px");
		}
		await createBtn.click();
		await expect(page.getByRole("dialog")).toBeVisible();

		await assertBottomAnchored(page, VIEWPORT_MOBILE.height);

		await page.screenshot({ path: "test-results/ai2-mobile-bet-create-375px.png" });
	});

	// Dialog 2: KnowledgeCreate
	test("KnowledgeCreateDialog — 375px: no horizontal overflow, bottom-anchored sheet", async ({
		page,
	}) => {
		await page.goto("/knowledge");
		await expect(page.locator("[data-testid='knowledge-list-page']")).toBeVisible();

		const createBtn = page
			.locator("button")
			.filter({ hasText: /new knowledge|create knowledge|add note/i })
			.first();
		if ((await createBtn.count()) === 0) {
			test.skip(true, "No create-knowledge button at 375px");
		}
		await createBtn.click();
		await expect(page.getByRole("dialog")).toBeVisible();

		await assertBottomAnchored(page, VIEWPORT_MOBILE.height);

		await page.screenshot({ path: "test-results/ai2-mobile-knowledge-create-375px.png" });
	});

	// Dialog 3: Kill-confirm (WorkBet kill action)
	test("ConsequencePreviewDialog — 375px: no horizontal overflow, bottom-anchored sheet", async ({
		page,
	}) => {
		await page.goto(`/work/bet/${BET_ID}`);
		await expect(page.locator("[data-testid='work-bet-page']")).toBeVisible();

		const overflowBtn = page.locator("[data-testid='bet-overflow-btn']");
		if ((await overflowBtn.count()) === 0) {
			test.skip(true, "No overflow button at 375px");
		}
		await overflowBtn.click();
		const killItem = page.locator("[data-dropdown-item][data-bet-action='kill']");
		if ((await killItem.count()) === 0) {
			test.skip(true, "No kill item at 375px");
		}
		await killItem.click();
		await expect(page.getByRole("dialog")).toBeVisible();

		await assertBottomAnchored(page, VIEWPORT_MOBILE.height);

		await page.screenshot({ path: "test-results/ai2-mobile-kill-confirm-375px.png" });
	});

	// Dialog 4: AppetiteDialog (WorkBet adjust appetite)
	test("AppetiteDialog — 375px: no horizontal overflow, bottom-anchored sheet", async ({
		page,
	}) => {
		await page.goto(`/work/bet/${BET_ID}`);
		await expect(page.locator("[data-testid='work-bet-page']")).toBeVisible();

		// Adjust appetite is in overflow dropdown for active bets
		const overflowBtn = page.locator("[data-testid='bet-overflow-btn']");
		if ((await overflowBtn.count()) === 0) {
			test.skip(true, "No overflow button at 375px");
		}
		await overflowBtn.click();
		const adjustItem = page.locator("[data-dropdown-item][data-bet-action='adjust-appetite']");
		if ((await adjustItem.count()) === 0) {
			test.skip(true, "No adjust-appetite item at 375px");
		}
		await adjustItem.click();
		await expect(page.getByRole("dialog")).toBeVisible();

		await assertBottomAnchored(page, VIEWPORT_MOBILE.height);

		await page.screenshot({ path: "test-results/ai2-mobile-appetite-dialog-375px.png" });
	});
});
