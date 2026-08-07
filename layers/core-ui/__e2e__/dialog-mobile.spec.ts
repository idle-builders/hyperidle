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
 *
 * @lore AI2 W-2 fix: Fixed tests 2-4 which were skipping.
 * - Test 2 (was KnowledgeCreate): KnowledgeCreate is now a full page, not a dialog.
 *   Replaced with ScopeChangeDialog triggered from KnowledgeDetail page.
 * - Tests 3-4 (ConsequencePreview, AppetiteDialog): Added full WorkBet mock setup
 *   matching the pattern from dialog-dismissal.spec.ts scenario 2. Overflow btn
 *   wait replaces naive work-bet-page testid check (appears in all loading states).
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
		tokenAppetite: null,
		tokensActual: null,
		progress: { done: 0, total: 0 },
		description: "# Mobile test",
		tasks: [],
	};
}

// AG3: makeGroupedBets was used by the BetCreateDialog test, now skipped.
// biome-ignore lint/correctness/noUnusedVariables: kept for reference after AG3 skip
function makeGroupedBets() {
	return {
		draft: [],
		active: [
			{
				id: BET_ID,
				title: "Mobile test bet",
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

function makeKnowledge() {
	return {
		id: KNOWLEDGE_ID,
		title: "Mobile knowledge item",
		body: "# Test\n\nContent.",
		format: "markdown",
		status: "active",
		version: 1,
		updatedBy: "tester",
		scopeKind: "team",
		scopeId: null,
		topic: null,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		kind: "note",
		layer: "team",
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

	// AG3: BetCreateDialog deleted — bet creation is now a full-page route at /work/bet/new.
	// The mobile bottom-sheet test for BetCreate no longer applies.
	// Skipped — mobile behavior for bet create is now tested in AG3-bet-authoring.spec.ts.
	test.skip("BetCreateDialog — 375px: no horizontal overflow, bottom-anchored sheet [AG3: BetCreateDialog deleted]", async ({
		page: _page,
	}) => {
		// Surface deleted in AG3; see WorkBetCreate.tsx
	});

	// Dialog 2: ScopeChangeDialog (replaces KnowledgeCreate which is no longer a dialog)
	// @lore AI2 W-2: KnowledgeCreate was migrated to a full-page route (/knowledge/new)
	// before AI2. No KnowledgeCreateDialog exists. ScopeChangeDialog is a migrated
	// modal (AI2 AC-5) accessible from the knowledge detail overflow menu.
	test("ScopeChangeDialog — 375px: no horizontal overflow, bottom-anchored sheet", async ({
		page,
	}) => {
		await page.route(`**/api/knowledge/${KNOWLEDGE_ID}`, (route) =>
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(makeKnowledge()),
			}),
		);
		await page.route("**/api/knowledge/**", (route) =>
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ items: [] }),
			}),
		);
		await page.route("**/api/knowledge/triage-count", (route) =>
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ count: 0 }),
			}),
		);
		await page.route("**/api/bets**", (route) =>
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ draft: [], active: [], completed: [], killed: [] }),
			}),
		);
		await page.route("**/api/threads**", (route) =>
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ threads: [], nextCursor: null }),
			}),
		);

		await page.goto(`/knowledge/${KNOWLEDGE_ID}`);
		await expect(page.locator("[data-testid='knowledge-detail-page']")).toBeVisible();

		// Click the overflow menu button ("More options")
		const overflowBtn = page.getByRole("button", { name: /more options/i });
		await expect(
			overflowBtn,
			"overflow menu button must be visible on knowledge detail",
		).toBeVisible();
		await overflowBtn.click();

		// Click "Change scope" item
		const changeScopeItem = page.locator("[data-testid='knowledge-change-scope']");
		await expect(
			changeScopeItem,
			"Change scope item must be visible in overflow menu",
		).toBeVisible();
		await changeScopeItem.click();

		// Dialog must open
		await expect(page.getByRole("dialog")).toBeVisible();

		await assertBottomAnchored(page, VIEWPORT_MOBILE.height);

		await page.screenshot({ path: "test-results/ai2-mobile-scope-change-375px.png" });
	});

	// Dialog 3: Kill-confirm (WorkBet kill action)
	test("ConsequencePreviewDialog — 375px: no horizontal overflow, bottom-anchored sheet", async ({
		page,
	}) => {
		// @lore AI2 W-2: Full WorkBet mock setup mirrors dialog-dismissal.spec.ts scenario 2.
		// Playwright LIFO: register broad routes first, specific routes last.

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

		await page.goto(`/work/bet/${BET_ID}`);
		await page.waitForLoadState("networkidle");

		// @lore AI2 W-2: wait for overflow button (success state marker) not just
		// work-bet-page testid (appears in loading/error states too).
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

		await assertBottomAnchored(page, VIEWPORT_MOBILE.height);

		await page.screenshot({ path: "test-results/ai2-mobile-kill-confirm-375px.png" });
	});

	// Dialog 4: AppetiteDialog (WorkBet adjust appetite)
	test("AppetiteDialog — 375px: no horizontal overflow, bottom-anchored sheet", async ({
		page,
	}) => {
		// @lore AI2 W-2: Full WorkBet mock setup (same as ConsequencePreview above).

		// 1. Broad sub-resource fallback
		await page.route(`**/api/bets/${BET_ID}/**`, (route) =>
			route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) }),
		);
		// 2. artifact-thread-summary
		await page.route(`**/api/bets/${BET_ID}/artifact-thread-summary`, (route) =>
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ summaries: [], totalCount: 0, truncated: false }),
			}),
		);
		// 3. Main bet endpoint
		await page.route(`**/api/bets/${BET_ID}`, (route) =>
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(makeBetDetail()),
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

		await page.goto(`/work/bet/${BET_ID}`);
		await page.waitForLoadState("networkidle");

		// @lore AI2 W-2: wait for overflow button (success state marker).
		const overflowBtn = page.locator("[data-testid='bet-overflow-btn']");
		await expect(
			overflowBtn,
			"bet-overflow-btn must be visible — WorkBet success state must render",
		).toBeVisible({ timeout: 15000 });
		await overflowBtn.click();

		const adjustItem = page.locator("[data-bet-action='adjust-appetite']");
		await expect(adjustItem, "adjust-appetite item must appear").toBeVisible();
		await adjustItem.click();

		await expect(page.getByRole("dialog")).toBeVisible();

		await assertBottomAnchored(page, VIEWPORT_MOBILE.height);

		await page.screenshot({ path: "test-results/ai2-mobile-appetite-dialog-375px.png" });
	});
});
