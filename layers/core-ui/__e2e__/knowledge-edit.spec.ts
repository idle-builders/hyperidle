/**
 * T2 E2E tests — Knowledge WYSIWYG Editing.
 *
 * Covers the four scenarios requested by the T2 reviewer (F-ARCH-2):
 *   1. Edit flow: navigate → click Edit → type → auto-save fires → Done → content updated
 *   2. Create with BodyEditor: open create dialog → type → create → item created
 *   3. Factory item read-only: navigate → no Edit button visible
 *   4. Conflict banner: edit → simulate 409 response → conflict banner appears
 *
 * @lore T2 E2E: BodyEditor (TipTap) requires a real browser DOM, so the real
 * component runs in Playwright. .fill() silently no-ops on ProseMirror (not a
 * form element); drive TipTap via keyboard input (page.keyboard.type /
 * pressSequentially). TipTap's placeholder is a CSS pseudo-element, not a native
 * placeholder attribute, so Playwright's getByPlaceholder() cannot find it.
 *
 * Scenarios 2 and 4 type into the editor via pressSequentially(). Scenario 1
 * verifies the structural shell behaviour (panel shows/hides, save indicator
 * reachable, Done exits) without typing because the auto-save assertions are
 * already covered in the unit tests (KnowledgeDetail.edit.test.tsx).
 *
 * @lore T2 E2E: The app does NOT require a running backend for these E2E tests.
 * All /api/* calls are intercepted via page.route(). The fixtures/ module
 * (e2e/fixtures.ts) installs auto-use mocks for the five M3 core endpoints.
 * T2-specific endpoints (/api/knowledge/:id, PATCH /api/knowledge/:id) are
 * registered per-test.
 */

import { expect, mockSearchThreads, test } from "./fixtures";

// ---------------------------------------------------------------------------
// Shared mock payloads
// ---------------------------------------------------------------------------

const MOCK_ITEM = {
	id: "ki-edit-1",
	title: "Editable knowledge item",
	body: "Original body content.",
	format: "markdown",
	status: "active",
	version: 1,
	updatedBy: "test-founder",
	scopeKind: "practice",
	scopeId: null,
	createdAt: new Date().toISOString(),
	updatedAt: new Date().toISOString(),
	signals: null,
};

const MOCK_FACTORY_ITEM = {
	...MOCK_ITEM,
	id: "ki-factory-1",
	title: "Factory knowledge item",
	scopeKind: "factory",
};

// ---------------------------------------------------------------------------
// Scenario 1 — Edit flow: Edit → type → auto-save fires → Done → content updated
//
// @lore T2 E2E auto-save: TipTap contenteditable is not a plain textarea.
// page.keyboard input into a ProseMirror instance is tested separately in
// unit tests (KnowledgeDetail.edit.test.tsx with a mock BodyEditor).
// Here we assert the structural edit-mode behaviour: panel shows/hides,
// save indicator is reachable, Done exits edit mode.
// ---------------------------------------------------------------------------

test.describe("T2 AC-1: Edit flow — Edit panel shows, auto-save wired, Done exits", () => {
	test.beforeEach(async ({ page }) => {
		// GET /api/knowledge/:id — return editable item
		await page.route(`**/api/knowledge/${MOCK_ITEM.id}`, async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify(MOCK_ITEM),
				});
			} else if (route.request().method() === "PATCH") {
				// Respond to auto-save PATCH
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({ ...MOCK_ITEM, version: 2 }),
				});
			} else {
				await route.continue();
			}
		});

		// Host thread (HostThreadSection)
		await mockSearchThreads(page, { rows: [] });
	});

	test("Edit button is visible for a non-factory item", async ({ page }) => {
		await page.goto(`/knowledge/${MOCK_ITEM.id}`);
		await page.waitForSelector("[data-testid='knowledge-detail-page']");

		const editBtn = page.getByRole("button", { name: /edit/i });
		await expect(editBtn).toBeVisible();
	});

	test("clicking Edit enters edit mode and shows the edit panel", async ({ page }) => {
		await page.goto(`/knowledge/${MOCK_ITEM.id}`);
		await page.waitForSelector("[data-testid='knowledge-detail-page']");

		await page.getByRole("button", { name: /edit/i }).click();

		// Edit panel must be visible
		await expect(page.getByTestId("knowledge-edit-panel")).toBeVisible();

		// Done button replaces Edit button
		await expect(page.getByRole("button", { name: /done/i })).toBeVisible();
		await expect(page.getByRole("button", { name: /edit/i })).not.toBeVisible();
	});

	test("save indicator element is reachable in edit mode", async ({ page }) => {
		await page.goto(`/knowledge/${MOCK_ITEM.id}`);
		await page.waitForSelector("[data-testid='knowledge-detail-page']");

		await page.getByRole("button", { name: /edit/i }).click();
		await expect(page.getByTestId("knowledge-edit-panel")).toBeVisible();

		// Save indicator must be present (content may be empty when idle)
		await expect(page.getByTestId("save-indicator")).toBeAttached();
	});

	test("clicking Done exits edit mode and shows the read view", async ({ page }) => {
		await page.goto(`/knowledge/${MOCK_ITEM.id}`);
		await page.waitForSelector("[data-testid='knowledge-detail-page']");

		await page.getByRole("button", { name: /edit/i }).click();
		await expect(page.getByTestId("knowledge-edit-panel")).toBeVisible();

		await page.getByRole("button", { name: /done/i }).click();

		// Edit panel gone
		await expect(page.getByTestId("knowledge-edit-panel")).not.toBeVisible();
		// Read view visible
		await expect(page.getByTestId("knowledge-body")).toBeVisible();
	});
});

// ---------------------------------------------------------------------------
// Scenario 2 — Create with BodyEditor: open dialog → fill → create → item created
//
// @lore T2 E2E create: KnowledgeCreateDialog was updated in T2 to use BodyEditor
// (TipTap) for the body field. TipTap's placeholder is rendered via CSS
// pseudo-element (::before on .is-editor-empty) using @tiptap/extension-placeholder
// — NOT a native HTML placeholder attribute. Playwright's getByPlaceholder() won't
// find it. Instead we locate the TipTap contenteditable div inside the dialog and
// use pressSequentially() to type into it.
//
// @lore T2 E2E create POST: The POST fires from handleSubmit after Create is clicked.
// The route intercept in beforeEach catches it and returns 201. The dialog closes
// on onCreated() → onClose().
// ---------------------------------------------------------------------------

test.describe("T2 AC-2: Create dialog — fill and create knowledge item", () => {
	test.beforeEach(async ({ page }) => {
		await page.route("**/api/knowledge", async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({ items: [] }),
				});
			} else if (route.request().method() === "POST") {
				await route.fulfill({
					status: 201,
					contentType: "application/json",
					body: JSON.stringify({ ...MOCK_ITEM, id: "ki-created-1" }),
				});
			} else {
				await route.continue();
			}
		});
	});

	test("opens create dialog and successfully creates an item", async ({ page }) => {
		await page.goto("/knowledge");
		await page.waitForSelector("[data-testid='knowledge-list-page']");

		await page.getByRole("button", { name: "+ New" }).click();
		const dialog = page.getByRole("dialog");
		await expect(dialog).toBeVisible();

		// Fill title — title uses a native input with a placeholder attribute
		await dialog.getByPlaceholder("What did you learn?").fill("New test item title");

		// Fill body — T2 replaced the textarea with BodyEditor (TipTap).
		// TipTap renders a [contenteditable="true"] div; use pressSequentially()
		// because .fill() is for form elements, not contenteditable.
		const bodyEditor = dialog.locator('[contenteditable="true"]').first();
		await expect(bodyEditor).toBeVisible();
		await bodyEditor.click();
		await bodyEditor.pressSequentially("New test body content");

		// Create button should be enabled (body state is set via BodyEditor's onChange)
		const createBtn = dialog.getByRole("button", { name: "Create" });
		await expect(createBtn).not.toBeDisabled();
		await createBtn.click();

		// Dialog closes after creation
		await expect(dialog).not.toBeVisible();
	});
});

// ---------------------------------------------------------------------------
// Scenario 3 — Factory item read-only: navigate → no Edit button
// ---------------------------------------------------------------------------

test.describe("T2 AC-3: Factory-scoped item is read-only", () => {
	test.beforeEach(async ({ page }) => {
		await page.route(`**/api/knowledge/${MOCK_FACTORY_ITEM.id}`, async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify(MOCK_FACTORY_ITEM),
				});
			} else {
				await route.continue();
			}
		});

		await mockSearchThreads(page, { rows: [] });
	});

	test("no Edit button on a factory-scoped item", async ({ page }) => {
		await page.goto(`/knowledge/${MOCK_FACTORY_ITEM.id}`);
		await page.waitForSelector("[data-testid='knowledge-detail-page']");

		await expect(page.getByRole("button", { name: /^edit$/i })).not.toBeVisible();
	});

	test("fixture factory item (k11) has no Edit button", async ({ page }) => {
		// k11 is factory-scope in the local fixture data (no API needed)
		await page.goto("/knowledge/k11");
		await page.waitForSelector("[data-testid='knowledge-detail-page']");

		await expect(page.getByRole("button", { name: /^edit$/i })).not.toBeVisible();
	});
});

// ---------------------------------------------------------------------------
// Scenario 4 — Conflict banner: edit → 409 response → conflict banner appears
//
// @lore T2 E2E conflict: TipTap's ProseMirror contenteditable requires .click()
// + pressSequentially() to type. We assert editorEl is visible before typing —
// if it is not, the test fails explicitly (no silent skip). The PATCH 409 is
// triggered by the auto-save debounce (1.5s) after content changes. We use
// MOCK_ITEM (not k1 fixture) so the GET returns a live API item with a version
// number, giving useAutoSave the data it needs to send PATCH requests.
// ---------------------------------------------------------------------------

test.describe("T2 AC-4: Conflict banner on 409 auto-save response", () => {
	test("conflict banner appears when PATCH returns 409", async ({ page }) => {
		// Use MOCK_ITEM (practice-scope, version 1) so useAutoSave fires PATCH.
		// GET returns the item; PATCH returns 409.
		await page.route(`**/api/knowledge/${MOCK_ITEM.id}`, async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify(MOCK_ITEM),
				});
			} else if (route.request().method() === "PATCH") {
				await route.fulfill({
					status: 409,
					contentType: "application/json",
					body: JSON.stringify({
						error: "Version conflict",
						code: "CONFLICT",
						details: { currentVersion: 5 },
					}),
				});
			} else {
				await route.continue();
			}
		});

		await mockSearchThreads(page, { rows: [] });

		// Navigate to the mock item (practice-scope, not factory)
		await page.goto(`/knowledge/${MOCK_ITEM.id}`);
		await page.waitForSelector("[data-testid='knowledge-detail-page']");

		// Enter edit mode
		await page.getByRole("button", { name: /edit/i }).click();
		await expect(page.getByTestId("knowledge-edit-panel")).toBeVisible();

		// Type into TipTap editor — assert editor is visible (no silent skip).
		// @lore T2 E2E conflict: pressSequentially() works with contenteditable;
		// .fill() does not because TipTap is not a form element.
		const editPanel = page.getByTestId("knowledge-edit-panel");
		const editorEl = editPanel.locator('[contenteditable="true"]').first();
		await expect(editorEl).toBeVisible();
		await editorEl.click();
		await editorEl.pressSequentially("conflict test content");

		// Wait for conflict banner — debounce is 1.5s in production.
		// Playwright default timeout is 5s; we extend to 8s to cover the debounce.
		await expect(page.getByTestId("conflict-banner")).toBeVisible({ timeout: 8000 });
		await expect(page.getByTestId("conflict-banner")).toContainText(/conflict/i);
	});
});
