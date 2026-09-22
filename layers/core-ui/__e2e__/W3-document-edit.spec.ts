/**
 * W3 — Document Edit Mode E2E tests: AC-44 through AC-46.
 *
 * AC-44: Clicking "Edit" transitions to edit mode — "Done" replaces "Edit",
 *        body gets the BodyEditor panel, save indicator appears.
 * AC-45: Clicking "Done" returns to read mode.
 * AC-46: Metadata aside stays read-only during editing.
 *
 * @lore BC4: repointed at `POST /api/actions/{open_document,edit_document}`
 * via `mockDocument` — never `GET/PATCH /api/knowledge/:id`.
 *
 * @lore T2: the always-visible formatting toolbar and the bordered
 * "knowledge-editor-area" wrapper this spec used to assert on are gone —
 * T2 replaced them with TipTap's BubbleMenu (a floating toolbar that only
 * renders on text selection) with no bordered wrapper element. Those two
 * cases are deleted; their subject no longer exists.
 */

import { expect, makeDocumentRow, mockDocument, mockSearchThreads, test } from "./fixtures";

const MOCK_ITEM = makeDocumentRow("k-e2e-1", {
	title: "Auth Strategy Decision",
	body: "We decided to use JWT with refresh rotation.",
	scopeKind: "team",
});

test.describe("W3 AC-44 — Document edit mode transition", () => {
	test.beforeEach(async ({ page }) => {
		await mockDocument(page, { row: MOCK_ITEM });
		await mockSearchThreads(page, { rows: [] });
		await page.goto(`/documents/${MOCK_ITEM.id}`);
		await page.waitForSelector("[data-testid='document-detail-page']");
	});

	test("initially shows 'Edit' button (not 'Done')", async ({ page }) => {
		await expect(page.getByRole("button", { name: /^edit$/i })).toBeVisible();
		await expect(page.getByRole("button", { name: /^done$/i })).not.toBeVisible();
	});

	test("clicking Edit replaces Edit with Done button", async ({ page }) => {
		await page.getByRole("button", { name: /^edit$/i }).click();

		await expect(page.getByRole("button", { name: /^done$/i })).toBeVisible();
		await expect(page.getByRole("button", { name: /^edit$/i })).not.toBeVisible();
	});

	test("edit mode shows the BodyEditor panel", async ({ page }) => {
		await page.getByRole("button", { name: /^edit$/i }).click();

		const editPanel = page.getByTestId("document-edit-panel");
		await expect(editPanel).toBeVisible();
		await expect(editPanel.locator(".ProseMirror")).toBeVisible();
	});

	test("edit mode shows save indicator in header", async ({ page }) => {
		await page.getByRole("button", { name: /^edit$/i }).click();

		await expect(page.getByTestId("save-indicator")).toBeAttached();
	});

	for (const viewport of [
		{ name: "1440x900", width: 1440, height: 900 },
		{ name: "1024x768", width: 1024, height: 768 },
		{ name: "375x812", width: 375, height: 812 },
	]) {
		test(`${viewport.name}: document prose rests rendered`, async ({ page }) => {
			await page.setViewportSize(viewport);
			await expect(page.getByRole("button", { name: /^edit$/i })).toBeVisible();
			await expect(page.getByTestId("document-edit-panel")).toHaveCount(0);
			await page.screenshot({
				path: `test-results/document-read-${viewport.name}.png`,
				fullPage: true,
			});
		});
	}
});

test.describe("W3 AC-45 — Done returns to read mode", () => {
	test.beforeEach(async ({ page }) => {
		await mockDocument(page, { row: MOCK_ITEM });
		await mockSearchThreads(page, { rows: [] });
		await page.goto(`/documents/${MOCK_ITEM.id}`);
		await page.waitForSelector("[data-testid='document-detail-page']");
	});

	test("clicking Done returns to read mode with Edit button", async ({ page }) => {
		// Enter edit mode
		await page.getByRole("button", { name: /^edit$/i }).click();
		await expect(page.getByRole("button", { name: /^done$/i })).toBeVisible();

		// Exit edit mode
		await page.getByRole("button", { name: /^done$/i }).click();

		// Back in read mode
		await expect(page.getByRole("button", { name: /^edit$/i })).toBeVisible();
		await expect(page.getByRole("button", { name: /^done$/i })).not.toBeVisible();
	});

	test("edit panel disappears after clicking Done", async ({ page }) => {
		await page.getByRole("button", { name: /^edit$/i }).click();
		await expect(page.getByTestId("document-edit-panel")).toBeVisible();

		await page.getByRole("button", { name: /^done$/i }).click();

		await expect(page.getByTestId("document-edit-panel")).not.toBeVisible();
	});

	test("Done remains a save barrier until the latest body change is acknowledged", async ({
		page,
	}) => {
		await page.getByRole("button", { name: /^edit$/i }).click();
		const editor = page.getByTestId("document-edit-panel").locator('[contenteditable="true"]');
		await editor.click();
		await editor.pressSequentially(" Saved through the barrier.");
		const done = page.getByRole("button", { name: /^done$/i });
		await expect(done).toBeDisabled();
		await expect(done).toBeEnabled({ timeout: 5000 });
		await done.click();
		await expect(page.getByTestId("document-edit-panel")).toHaveCount(0);
	});
});

test.describe("W3 AC-46 — Metadata aside read-only in edit mode", () => {
	test.beforeEach(async ({ page }) => {
		await mockDocument(page, { row: MOCK_ITEM });
		await mockSearchThreads(page, { rows: [] });
		await page.goto(`/documents/${MOCK_ITEM.id}`);
		await page.waitForSelector("[data-testid='document-detail-page']");
	});

	test("metadata aside remains visible during editing", async ({ page }) => {
		const aside = page.getByTestId("document-metadata-aside");
		await expect(aside).toBeVisible();

		await page.getByRole("button", { name: /^edit$/i }).click();

		await expect(aside).toBeVisible();
	});

	test("metadata aside has no input fields (read-only)", async ({ page }) => {
		await page.getByRole("button", { name: /^edit$/i }).click();

		const aside = page.getByTestId("document-metadata-aside");
		const inputs = await aside.locator("input, select, textarea").count();
		expect(inputs).toBe(0);
	});
});
