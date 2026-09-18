/**
 * W3 — Knowledge Edit Mode E2E tests: AC-44 through AC-46.
 *
 * AC-44: Clicking "Edit" transitions to edit mode — "Done" replaces "Edit",
 *        formatting toolbar appears, body gets editor border, save indicator.
 * AC-45: Clicking "Done" returns to read mode.
 * AC-46: Metadata aside stays read-only during editing.
 */

import { expect, mockSearchThreads, test } from "./fixtures";

const KNOWLEDGE_ITEM_FIXTURE = {
	id: "k-e2e-1",
	title: "Auth Strategy Decision",
	body: "We decided to use JWT with refresh rotation.",
	topic: "Auth",
	status: "active",
	kind: "decision",
	layer: "L2",
	version: 1,
	scopeKind: "practice",
	format: "markdown",
	updatedBy: "Test Founder",
	updatedAt: "2026-01-01T10:00:00.000Z",
	createdAt: "2026-01-01T10:00:00.000Z",
	signals: null,
};

const KNOWLEDGE_LIST_FIXTURE = {
	items: [KNOWLEDGE_ITEM_FIXTURE],
};

test.describe("W3 AC-44 — Knowledge edit mode transition", () => {
	test.beforeEach(async ({ page }) => {
		await page.route("**/api/knowledge/k-e2e-1", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(KNOWLEDGE_ITEM_FIXTURE),
			});
		});
		await page.route("**/api/knowledge*", async (route) => {
			const url = route.request().url();
			if (url.includes("/k-e2e-1")) {
				await route.continue();
			} else {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify(KNOWLEDGE_LIST_FIXTURE),
				});
			}
		});
		await mockSearchThreads(page, { rows: [] });
		await page.goto("/knowledge/k-e2e-1");
		await page.waitForSelector("[data-testid='knowledge-detail-page']");
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

	test("edit mode shows a formatting toolbar", async ({ page }) => {
		await page.getByRole("button", { name: /^edit$/i }).click();

		// Toolbar should appear with Bold, Italic etc.
		const toolbar = page.locator(
			"[data-testid='formatting-toolbar'], .formatting-toolbar, [role='toolbar']",
		);
		await expect(toolbar).toBeVisible();
	});

	test("edit mode wraps editor in a bordered area", async ({ page }) => {
		await page.getByRole("button", { name: /^edit$/i }).click();

		const editorArea = page.locator(
			"[data-testid='knowledge-editor-area'], [class*='editor-area']",
		);
		await expect(editorArea).toBeVisible();
	});

	test("edit mode shows save indicator in header", async ({ page }) => {
		await page.getByRole("button", { name: /^edit$/i }).click();

		const saveIndicator = page.locator("[data-testid='save-indicator'], [data-save-status]");
		await expect(saveIndicator).toBeVisible();
	});

	for (const viewport of [
		{ name: "1440x900", width: 1440, height: 900 },
		{ name: "1024x768", width: 1024, height: 768 },
		{ name: "375x812", width: 375, height: 812 },
	]) {
		test(`${viewport.name}: knowledge prose rests rendered`, async ({ page }) => {
			await page.setViewportSize(viewport);
			await expect(page.getByRole("button", { name: /^edit$/i })).toBeVisible();
			await expect(page.getByTestId("knowledge-edit-panel")).toHaveCount(0);
			await page.screenshot({
				path: `test-results/knowledge-read-${viewport.name}.png`,
				fullPage: true,
			});
		});
	}
});

test.describe("W3 AC-45 — Done returns to read mode", () => {
	test.beforeEach(async ({ page }) => {
		await page.route("**/api/knowledge/k-e2e-1", async (route) => {
			if (route.request().method() === "PATCH") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({ ...KNOWLEDGE_ITEM_FIXTURE, version: 2 }),
				});
			} else {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify(KNOWLEDGE_ITEM_FIXTURE),
				});
			}
		});
		await page.route("**/api/knowledge*", async (route) => {
			await route.continue();
		});
		await mockSearchThreads(page, { rows: [] });
		await page.goto("/knowledge/k-e2e-1");
		await page.waitForSelector("[data-testid='knowledge-detail-page']");
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

	test("editor border disappears after clicking Done", async ({ page }) => {
		await page.getByRole("button", { name: /^edit$/i }).click();
		await page.getByRole("button", { name: /^done$/i }).click();

		const editorArea = page.locator(
			"[data-testid='knowledge-editor-area'], [class*='editor-area']",
		);
		await expect(editorArea).not.toBeVisible();
	});

	test("Done remains a save barrier until the latest body change is acknowledged", async ({
		page,
	}) => {
		await page.getByRole("button", { name: /^edit$/i }).click();
		const editor = page.getByTestId("knowledge-edit-panel").locator('[contenteditable="true"]');
		await editor.click();
		await editor.pressSequentially(" Saved through the barrier.");
		const done = page.getByRole("button", { name: /^done$/i });
		await expect(done).toBeDisabled();
		await expect(done).toBeEnabled({ timeout: 5000 });
		await done.click();
		await expect(page.getByTestId("knowledge-edit-panel")).toHaveCount(0);
	});
});

test.describe("W3 AC-46 — Metadata aside read-only in edit mode", () => {
	test.beforeEach(async ({ page }) => {
		await page.route("**/api/knowledge/k-e2e-1", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(KNOWLEDGE_ITEM_FIXTURE),
			});
		});
		await page.route("**/api/knowledge*", async (route) => {
			await route.continue();
		});
		await mockSearchThreads(page, { rows: [] });
		await page.goto("/knowledge/k-e2e-1");
		await page.waitForSelector("[data-testid='knowledge-detail-page']");
	});

	test("metadata aside remains visible during editing", async ({ page }) => {
		const aside = page.getByTestId("knowledge-metadata-aside");
		await expect(aside).toBeVisible();

		await page.getByRole("button", { name: /^edit$/i }).click();

		await expect(aside).toBeVisible();
	});

	test("metadata aside has no input fields (read-only)", async ({ page }) => {
		await page.getByRole("button", { name: /^edit$/i }).click();

		const aside = page.getByTestId("knowledge-metadata-aside");
		const inputs = await aside.locator("input, select, textarea").count();
		expect(inputs).toBe(0);
	});
});
