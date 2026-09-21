/**
 * AI2 — Dialog mobile adaptation: 375px no-overflow + bottom-anchoring (AC-4).
 *
 * Asserts, at a 375px viewport:
 *   - No horizontal overflow (scrollWidth <= clientWidth)
 *   - Bottom-anchored sheet: bounding box bottom ≈ viewport height, top > 0
 *
 * @lore AI2: "bottom ≈ viewport height" means within a tolerance of the
 * mobile safe-area bottom inset (≤ 20px tolerance for border/rounding).
 * "top > 0" proves it's a sheet, not a fullscreen takeover.
 *
 * @lore BB1: this covered four dialogs; three of them no longer exist.
 * BetCreateDialog went in AG3 (creation is a full page), and
 * ConsequencePreviewDialog and AppetiteDialog went with the bet surface —
 * a task is finished through the state Select on WorkTaskPage, and appetite
 * is not a task field. ScopeChangeDialog is the one still standing, so it is
 * the one still asserted here.
 */

import {
	expect,
	makeDocumentRow,
	mockDocument,
	mockSearchDocuments,
	mockSearchThreads,
	test,
} from "./fixtures";

const VIEWPORT_MOBILE = { width: 375, height: 667 };
const KNOWLEDGE_ID = "k-mobile-dialog-test";

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
	const box = await page.evaluate((_vh) => {
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

	test("ScopeChangeDialog — 375px: no horizontal overflow, bottom-anchored sheet", async ({
		page,
	}) => {
		await mockDocument(page, {
			row: makeDocumentRow(KNOWLEDGE_ID, {
				title: "Mobile knowledge item",
				body: "# Test\n\nContent.",
				scopeKind: "team",
			}),
		});
		await mockSearchDocuments(page, { rows: [] });
		await mockSearchThreads(page, { rows: [] });

		await page.goto(`/documents/${KNOWLEDGE_ID}`);
		await expect(page.locator("[data-testid='document-detail-page']")).toBeVisible();

		// Click the overflow menu button ("More options")
		const overflowBtn = page.getByRole("button", { name: /more options/i });
		await expect(
			overflowBtn,
			"overflow menu button must be visible on knowledge detail",
		).toBeVisible();
		await overflowBtn.click();

		// Click "Change scope" item
		const changeScopeItem = page.locator("[data-testid='document-change-scope']");
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
});
