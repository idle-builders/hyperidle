/**
 * Journey: the document detail overflow menu opens and closes.
 *
 * @lore AG5: the canonical dropdown/Select system's other surfaces (Settings
 * Models select, RoutineCreateDialog) are gone with the deleted Settings
 * Models section and the routines table — this is the one surviving surface.
 */

import { expect, makeDocumentRow, mockDocument, mockSearchThreads, test } from "./fixtures";

test("AG5-S5: DocumentDetail overflow Menu — open and close", async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });

	const KNOWLEDGE_ID = "kn-ag5-test";
	await mockDocument(page, {
		row: makeDocumentRow(KNOWLEDGE_ID, {
			title: "AG5 Test Document",
			body: "# Test\n\nContent here.",
			scopeKind: "team",
		}),
	});
	await mockSearchThreads(page, { rows: [] });

	await page.goto(`/documents/${KNOWLEDGE_ID}`);
	await page.waitForSelector("[data-testid='main-content']");

	const overflowBtn = page.getByRole("button", { name: /more options/i });
	await expect(overflowBtn).toBeVisible({ timeout: 10000 });
	await overflowBtn.click();

	// @lore AG5 fix: the wrapper div has zero height (absolute-positioned child);
	// assert on role=menu (which has visible bounds) rather than the wrapper div.
	const menu = page.getByRole("menu");
	await expect(menu).toBeVisible({ timeout: 5000 });

	const archiveItem = page.locator("[data-testid='document-archive']");
	await expect(archiveItem).toBeVisible();

	await page.mouse.click(0, 0);
	await expect(menu).not.toBeVisible();
});
