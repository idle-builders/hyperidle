/**
 * Journeys: the document list's "+ New" button is reachable, a private
 * document's scope can be widened to a team (its Private tag then
 * disappears), and only user-scoped documents show that tag.
 */

import { expect, makeDocumentRow, mockSearchDocuments, mockSearchThreads, test } from "./fixtures";

const MOCK_ITEM = makeDocumentRow("ki-test-1", { title: "Test document" });

// A tree document (has a parent), not a root memory — a parentless
// scopeKind="user" document reads back as a memory and ScopeChangeDialog
// refuses to widen it. The scope-change journey needs a real scope change,
// so this fixture carries a parent.
const MOCK_USER_ITEM = makeDocumentRow("ki-user-1", {
	title: "My private note",
	status: "proposed",
	scopeKind: "user",
	parentKind: "document",
	parentId: "ki-parent-1",
});

test.describe("+ New button in the document list", () => {
	test.beforeEach(async ({ page }) => {
		await mockSearchDocuments(page, { rows: [MOCK_ITEM] });
	});

	test("the button is visible in the header", async ({ page }) => {
		await page.goto("/documents");
		await page.waitForSelector("[data-testid='document-list-page']");

		const newButton = page.getByRole("button", { name: "+ New" });
		await expect(newButton).toBeVisible();
	});
});

test.describe("changing a document's scope from user to team", () => {
	test("removes the Private tag", async ({ page }) => {
		let currentRow = MOCK_USER_ITEM;

		// ScopeChangeDialog gates the "Team" pill on the current user having a
		// team (`hasTeam = user?.teamId !== undefined`) — the fixture's default
		// `open_user` row already carries one.

		await page.route("**/api/actions/search_documents", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ ok: true, data: [currentRow] }),
			});
		});
		await page.route("**/api/actions/open_document", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					ok: true,
					data: {
						document: currentRow,
						ancestors: [],
						children: [],
						siblings: [],
						scopeName: currentRow.scopeKind === "user" ? "You" : "Alpha",
					},
				}),
			});
		});
		await page.route("**/api/actions/edit_document", async (route) => {
			const input = JSON.parse(route.request().postData() ?? "{}") as {
				scopeKind?: string;
				scopeId?: string;
			};
			currentRow = {
				...currentRow,
				scopeKind: (input.scopeKind ?? currentRow.scopeKind) as typeof currentRow.scopeKind,
				scopeId: input.scopeId ?? currentRow.scopeId,
				version: currentRow.version + 1,
			};
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					ok: true,
					data: {
						document: currentRow,
						ancestors: [],
						children: [],
						siblings: [],
						scopeName: "Alpha",
					},
				}),
			});
		});
		await mockSearchThreads(page, { rows: [] });

		// Navigate to the document list
		await page.goto("/documents");
		await page.waitForSelector("[data-testid='document-list-page']");

		// User-scoped item should show the row's Private tag. DocumentList also
		// renders a "Private" scope-filter pill in its own toolbar (unrelated,
		// always present) — `getByText("Private")` matches both, so target the
		// row tag's own testid (`pages/DocumentList.tsx`'s `private-badge`).
		await expect(page.getByTestId("private-badge")).toBeVisible();

		// Click on the item to go to detail page. Scope to the list row — the
		// sidebar's fast-nav (search_documents-backed) also renders an item with
		// this same title, so a bare text locator is ambiguous.
		await page.getByTestId("document-row").filter({ hasText: "My private note" }).click();
		await page.waitForSelector("[data-testid='document-detail-page']", { timeout: 5000 });

		// Open the overflow menu, click "Change scope"
		await page.getByRole("button", { name: /more options/i }).click();
		const changeScopeItem = page.locator("[data-testid='document-change-scope']");
		await expect(changeScopeItem).toBeVisible();
		await changeScopeItem.click();

		const dialog = page.getByRole("dialog", { name: "Change scope" });
		await expect(dialog).toBeVisible();

		// Select the "Team" pill (a ScopePicker, not a <select>)
		await dialog.getByTestId("scope-pill-change-team").click();

		// Fill the Scope ID input
		await dialog.getByLabel("Scope ID").fill("team-alpha");

		// Save
		await dialog.getByRole("button", { name: "Save" }).click();
		await expect(dialog).not.toBeVisible();

		// Navigate back to the document list
		await page.goto("/documents");
		await page.waitForSelector("[data-testid='document-list-page']");

		// Private tag should no longer appear on the row (the toolbar's scope
		// filter pill stays — see comment above).
		await expect(page.getByTestId("private-badge")).not.toBeVisible();
	});
});

test.describe("the Private tag in the document list", () => {
	test("renders for a user-scoped item", async ({ page }) => {
		await mockSearchDocuments(page, { rows: [MOCK_USER_ITEM] });

		await page.goto("/documents");
		await page.waitForSelector("[data-testid='document-list-page']");

		// Scoped to the row's own badge — the toolbar's "Private" scope-filter
		// pill also matches an unscoped text locator.
		await expect(page.getByTestId("private-badge")).toBeVisible();
	});

	test("does not render for a non-user-scoped item", async ({ page }) => {
		await mockSearchDocuments(page, { rows: [MOCK_ITEM] });

		await page.goto("/documents");
		await page.waitForSelector("[data-testid='document-list-page']");

		await expect(page.getByTestId("private-badge")).not.toBeVisible();
	});
});
