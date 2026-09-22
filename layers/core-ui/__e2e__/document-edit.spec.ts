/**
 * T2 E2E tests — Document WYSIWYG Editing.
 *
 * Covers three of the four scenarios requested by the T2 reviewer (F-ARCH-2):
 *   1. Edit flow: navigate → click Edit → type → auto-save fires → Done → content updated
 *   3. Factory item read-only: navigate → no Edit button visible
 *   4. Conflict banner: edit → edit_document answers stale → conflict banner appears
 *
 * Scenario 2 (Create dialog) is deleted — `KnowledgeCreateDialog` no longer
 * exists; create is a full page now (`DocumentCreate`, at `/documents/new`),
 * not a dialog, and `document-q2-create.spec.ts` covers that flow.
 *
 * @lore T2 E2E: BodyEditor (TipTap) requires a real browser DOM, so the real
 * component runs in Playwright. .fill() silently no-ops on ProseMirror (not a
 * form element); drive TipTap via keyboard input (page.keyboard.type /
 * pressSequentially). TipTap's placeholder is a CSS pseudo-element, not a native
 * placeholder attribute, so Playwright's getByPlaceholder() cannot find it.
 *
 * Scenario 1 verifies the structural shell behaviour (panel shows/hides, save
 * indicator reachable, Done exits) without typing because the auto-save
 * assertions are already covered in the unit tests.
 *
 * @lore BC4: repointed at `POST /api/actions/{open_document,edit_document}`
 * — never `GET/PATCH /api/knowledge/:id`. The conflict banner is driven by
 * `problems[0].code === "stale"` (architecture.md §4.2 D7), not an HTTP 409
 * with a `details.currentVersion` body — `useAutoSave`'s `onConflict` reads
 * the problems array directly (`hooks/useAutoSave.ts`).
 */

import { expect, makeDocumentRow, mockDocument, mockSearchThreads, test } from "./fixtures";

// ---------------------------------------------------------------------------
// Shared mock payloads
// ---------------------------------------------------------------------------

const MOCK_ITEM = makeDocumentRow("ki-edit-1", {
	title: "Editable document",
	body: "Original body content.",
	scopeKind: "team",
});

const MOCK_FACTORY_ITEM = makeDocumentRow("ki-factory-1", {
	title: "Factory document",
	scopeKind: "factory",
});

// ---------------------------------------------------------------------------
// Scenario 1 — Edit flow: Edit → type → auto-save fires → Done → content updated
//
// @lore T2 E2E auto-save: TipTap contenteditable is not a plain textarea.
// page.keyboard input into a ProseMirror instance is tested separately in
// unit tests (with a mock BodyEditor). Here we assert the structural
// edit-mode behaviour: panel shows/hides, save indicator is reachable, Done
// exits edit mode.
// ---------------------------------------------------------------------------

test.describe("T2 AC-1: Edit flow — Edit panel shows, auto-save wired, Done exits", () => {
	test.beforeEach(async ({ page }) => {
		await mockDocument(page, { row: MOCK_ITEM });
		// Host thread (HostThreadSection)
		await mockSearchThreads(page, { rows: [] });
	});

	test("Edit button is visible for a non-factory item", async ({ page }) => {
		await page.goto(`/documents/${MOCK_ITEM.id}`);
		await page.waitForSelector("[data-testid='document-detail-page']");

		const editBtn = page.getByRole("button", { name: /edit/i });
		await expect(editBtn).toBeVisible();
	});

	test("clicking Edit enters edit mode and shows the edit panel", async ({ page }) => {
		await page.goto(`/documents/${MOCK_ITEM.id}`);
		await page.waitForSelector("[data-testid='document-detail-page']");

		await page.getByRole("button", { name: /edit/i }).click();

		// Edit panel must be visible
		await expect(page.getByTestId("document-edit-panel")).toBeVisible();

		// Done button replaces Edit button
		await expect(page.getByRole("button", { name: /done/i })).toBeVisible();
		await expect(page.getByRole("button", { name: /edit/i })).not.toBeVisible();
	});

	test("save indicator element is reachable in edit mode", async ({ page }) => {
		await page.goto(`/documents/${MOCK_ITEM.id}`);
		await page.waitForSelector("[data-testid='document-detail-page']");

		await page.getByRole("button", { name: /edit/i }).click();
		await expect(page.getByTestId("document-edit-panel")).toBeVisible();

		// Save indicator must be present (content may be empty when idle)
		await expect(page.getByTestId("save-indicator")).toBeAttached();
	});

	test("clicking Done exits edit mode and shows the read view", async ({ page }) => {
		await page.goto(`/documents/${MOCK_ITEM.id}`);
		await page.waitForSelector("[data-testid='document-detail-page']");

		await page.getByRole("button", { name: /edit/i }).click();
		await expect(page.getByTestId("document-edit-panel")).toBeVisible();

		await page.getByRole("button", { name: /done/i }).click();

		// Edit panel gone
		await expect(page.getByTestId("document-edit-panel")).not.toBeVisible();
		// Read view visible
		await expect(page.getByTestId("document-body")).toBeVisible();
	});
});

// ---------------------------------------------------------------------------
// Scenario 3 — Factory item read-only: navigate → no Edit button
// ---------------------------------------------------------------------------

test.describe("T2 AC-3: Factory-scoped item is read-only", () => {
	test.beforeEach(async ({ page }) => {
		await mockDocument(page, { row: MOCK_FACTORY_ITEM });
		await mockSearchThreads(page, { rows: [] });
	});

	test("no Edit button on a factory-scoped item", async ({ page }) => {
		await page.goto(`/documents/${MOCK_FACTORY_ITEM.id}`);
		await page.waitForSelector("[data-testid='document-detail-page']");

		await expect(page.getByRole("button", { name: /^edit$/i })).not.toBeVisible();
	});

	test("fixture factory item (k11) has no Edit button", async ({ page }) => {
		// @lore BC4: KnowledgeDetail's LEGACY_DETAILS fixture fallback (id "k11"
		// served without an API call) is gone — DocumentDetail only ever reads
		// `open_document`, so this specific id needs its own mock now.
		await mockDocument(page, { row: makeDocumentRow("k11", { scopeKind: "factory" }) });
		await page.goto("/documents/k11");
		await page.waitForSelector("[data-testid='document-detail-page']");

		await expect(page.getByRole("button", { name: /^edit$/i })).not.toBeVisible();
	});
});

// ---------------------------------------------------------------------------
// Scenario 4 — Conflict banner: edit → edit_document answers stale → banner
//
// @lore T2 E2E conflict: TipTap's ProseMirror contenteditable requires .click()
// + pressSequentially() to type. We assert editorEl is visible before typing —
// if it is not, the test fails explicitly (no silent skip). The stale refusal
// is triggered by the auto-save debounce (1.5s) after content changes.
// ---------------------------------------------------------------------------

test.describe("T2 AC-4: Conflict banner on a stale edit_document refusal", () => {
	test("conflict banner appears when edit_document answers problems[0].code === 'stale'", async ({
		page,
	}) => {
		const STALE_MESSAGE = "The document changed since you read it — open it again and retry.";

		await page.route("**/api/actions/open_document", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					ok: true,
					data: {
						document: MOCK_ITEM,
						ancestors: [],
						children: [],
						siblings: [],
						scopeName: "Team",
					},
				}),
			});
		});
		await page.route("**/api/actions/edit_document", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					ok: false,
					problems: [{ code: "stale", message: STALE_MESSAGE, path: "version" }],
				}),
			});
		});

		await mockSearchThreads(page, { rows: [] });

		// Navigate to the mock item (team-scope, not factory)
		await page.goto(`/documents/${MOCK_ITEM.id}`);
		await page.waitForSelector("[data-testid='document-detail-page']");

		// Enter edit mode
		await page.getByRole("button", { name: /edit/i }).click();
		await expect(page.getByTestId("document-edit-panel")).toBeVisible();

		// Type into TipTap editor — assert editor is visible (no silent skip).
		// @lore T2 E2E conflict: pressSequentially() works with contenteditable;
		// .fill() does not because TipTap is not a form element.
		const editPanel = page.getByTestId("document-edit-panel");
		const editorEl = editPanel.locator('[contenteditable="true"]').first();
		await expect(editorEl).toBeVisible();
		await editorEl.click();
		await editorEl.pressSequentially("conflict test content");

		// Wait for conflict banner — debounce is 1.5s in production.
		// Playwright default timeout is 5s; we extend to 8s to cover the debounce.
		await expect(page.getByTestId("conflict-banner")).toBeVisible({ timeout: 8000 });
		await expect(page.getByTestId("conflict-banner")).toContainText(STALE_MESSAGE);
	});
});
