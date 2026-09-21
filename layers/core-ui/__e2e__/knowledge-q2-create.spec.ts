/**
 * Q2 E2E tests — Document list surface, scope change, and scope tags.
 *
 * AC-3: "+ New" button visible in DocumentList header.
 * AC-12: Change scope from user→team → "Private" tag disappears.
 * AC-20: "Private" tag renders for user-scoped items in list.
 *
 * @lore BC4: `KnowledgeCreateDialog` (AC-3's dialog assertions, AC-4's
 * validation flow) no longer exists — create is a full page now
 * (`DocumentCreate`, at `/documents/new`); `AZ2-page-scroll.spec.ts` covers
 * that route. AC-5/AC-11 ("Add knowledge" from a WorkBet) are deleted too —
 * bets are gone (BB1, one task primitive) and a task's produced documents go
 * through `ArtifactSection`, not a knowledge-creation dialog on the task
 * page. AC-12's mechanism is rewritten, not just re-pointed: the old free
 * scope-kind `<select>` + "product ID" text input is a `ScopePicker` (pill
 * buttons: Shared/Team/Private) + a labeled "Scope ID" input now, and
 * "product" is not a scope kind (`SCOPE_KINDS` = factory|team|user).
 *
 * Repointed at `POST /api/actions/{search_documents,open_document,
 * edit_document}` — never `GET/PATCH /api/knowledge*`.
 */

import { expect, makeDocumentRow, mockSearchDocuments, mockSearchThreads, test } from "./fixtures";

const MOCK_ITEM = makeDocumentRow("ki-test-1", { title: "Test document" });

const MOCK_USER_ITEM = makeDocumentRow("ki-user-1", {
	title: "My private note",
	status: "proposed",
	scopeKind: "user",
});

// ---------------------------------------------------------------------------
// AC-3: "+ New" button in DocumentList
// ---------------------------------------------------------------------------

test.describe("Q2 AC-3: + New button in DocumentList", () => {
	test.beforeEach(async ({ page }) => {
		await mockSearchDocuments(page, { rows: [MOCK_ITEM] });
	});

	test("Document list page shows + New button in header", async ({ page }) => {
		await page.goto("/documents");
		await page.waitForSelector("[data-testid='knowledge-list-page']");

		const newButton = page.getByRole("button", { name: "+ New" });
		await expect(newButton).toBeVisible();
	});
});

// ---------------------------------------------------------------------------
// AC-12: E2E — Change scope from user→team → Private tag disappears
// ---------------------------------------------------------------------------

test.describe("Q2 AC-12: Change scope from user to team", () => {
	test("changing scope from user to team removes the Private tag", async ({ page }) => {
		let currentRow = MOCK_USER_ITEM;

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
		await page.waitForSelector("[data-testid='knowledge-list-page']");

		// User-scoped item should show Private tag (exact: true to avoid case-insensitive
		// substring match with item title "My private note" which contains "private")
		await expect(page.getByText("Private", { exact: true })).toBeVisible();

		// Click on the item to go to detail page
		await page.getByText("My private note").click();
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
		await page.waitForSelector("[data-testid='knowledge-list-page']");

		// Private tag should no longer appear
		await expect(page.getByText("Private", { exact: true })).not.toBeVisible();
	});
});

// ---------------------------------------------------------------------------
// AC-20: "Private" tag renders for user-scoped items in list
// ---------------------------------------------------------------------------

test.describe("Q2 AC-20: Private tag for user-scoped items in list", () => {
	test("user-scoped item renders Private tag", async ({ page }) => {
		await mockSearchDocuments(page, { rows: [MOCK_USER_ITEM] });

		await page.goto("/documents");
		await page.waitForSelector("[data-testid='knowledge-list-page']");

		await expect(page.getByText("Private", { exact: true })).toBeVisible();
	});

	test("non-user-scoped item does NOT render Private tag", async ({ page }) => {
		await mockSearchDocuments(page, { rows: [MOCK_ITEM] });

		await page.goto("/documents");
		await page.waitForSelector("[data-testid='knowledge-list-page']");

		await expect(page.getByText("Private", { exact: true })).not.toBeVisible();
	});
});
