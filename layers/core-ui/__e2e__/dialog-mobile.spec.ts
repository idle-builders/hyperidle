/**
 * Dialog mobile adaptation: at a 375px viewport, a dialog has no horizontal
 * overflow and renders as a bottom-anchored sheet (bounding box bottom near
 * viewport height, top > 0 so it's a sheet, not a fullscreen takeover).
 * "near" tolerates the mobile safe-area bottom inset (≤ 20px for
 * border/rounding).
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

test.describe("mobile bottom-sheet at 375px", () => {
	test.use({ viewport: VIEWPORT_MOBILE });

	test("ScopeChangeDialog — 375px: no horizontal overflow, bottom-anchored sheet", async ({
		page,
	}) => {
		await mockDocument(page, {
			row: makeDocumentRow(KNOWLEDGE_ID, {
				title: "Mobile document",
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
			"overflow menu button must be visible on document detail",
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
	});
});
