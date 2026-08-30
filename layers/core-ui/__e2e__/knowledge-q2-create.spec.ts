/**
 * Q2 E2E tests — Knowledge creation and scope change.
 *
 * AC-3: "+ New" button visible in KnowledgeList header; clicking opens KnowledgeCreateDialog.
 * AC-4: Creation dialog has scope picker, title, body; Create disabled until required fields filled.
 * AC-5: "Add knowledge" button on WorkBet opens dialog with scope=bet, locked.
 * AC-11: Create from bet detail → item visible in Knowledge list.
 * AC-12: Change scope from user→product → "Private" tag disappears.
 *
 * Red phase: none of these UI elements exist yet. All assertions will fail.
 */

import { expect, test } from "./fixtures";

// ---------------------------------------------------------------------------
// Helper: default API mocks for Q2 knowledge endpoints
// ---------------------------------------------------------------------------

const MOCK_KNOWLEDGE_ITEM = {
	id: "ki-test-1",
	title: "Test knowledge item",
	body: "This is a test",
	format: "markdown",
	status: "active",
	version: 1,
	updatedBy: "test-founder",
	scopeKind: "factory",
	scopeId: null,
	createdAt: new Date().toISOString(),
	updatedAt: new Date().toISOString(),
	signals: null,
};

const MOCK_KNOWLEDGE_USER_ITEM = {
	...MOCK_KNOWLEDGE_ITEM,
	id: "ki-user-1",
	title: "My private note",
	status: "draft",
	scopeKind: "user",
	updatedBy: "test-founder",
};

const MOCK_BET = {
	id: "bet-test-1",
	title: "Auth flow bet",
	product: "HyperIdle Core",
	team: "Core Team",
	status: "in_progress",
	appetite: "2 weeks",
	progress: { done: 1, total: 2 },
	description: "# Problem\n\nWe need better auth.\n",
	tasks: [],
	consequences: null,
	pitch_text: "We need better auth",
	doneCondition: null,
	hypothesis: null,
	appetiteWeeks: 2,
	createdAt: new Date().toISOString(),
	updatedAt: new Date().toISOString(),
};

// ---------------------------------------------------------------------------
// AC-3: "+ New" button in KnowledgeList
// ---------------------------------------------------------------------------

test.describe("Q2 AC-3: + New button in KnowledgeList", () => {
	test.beforeEach(async ({ page }) => {
		// Mock GET /api/knowledge
		await page.route("**/api/knowledge", async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({ items: [MOCK_KNOWLEDGE_ITEM] }),
				});
			} else {
				await route.continue();
			}
		});
	});

	test("Knowledge list page shows + New button in header", async ({ page }) => {
		await page.goto("/knowledge");
		await page.waitForSelector("[data-testid='knowledge-list-page']");

		const newButton = page.getByRole("button", { name: "+ New" });
		await expect(newButton).toBeVisible();
	});

	test("Clicking + New opens KnowledgeCreateDialog", async ({ page }) => {
		await page.goto("/knowledge");
		await page.waitForSelector("[data-testid='knowledge-list-page']");

		await page.getByRole("button", { name: "+ New" }).click();

		// Dialog should open
		const dialog = page.getByRole("dialog");
		await expect(dialog).toBeVisible();
		await expect(dialog).toContainText("New knowledge item");
	});

	test("KnowledgeCreateDialog has title input, body textarea, scope picker", async ({ page }) => {
		await page.goto("/knowledge");
		await page.waitForSelector("[data-testid='knowledge-list-page']");

		await page.getByRole("button", { name: "+ New" }).click();
		const dialog = page.getByRole("dialog");
		await expect(dialog).toBeVisible();

		// Title input
		await expect(dialog.getByPlaceholder("What did you learn?")).toBeVisible();
		// Body textarea
		await expect(dialog.getByPlaceholder("Describe it in markdown...")).toBeVisible();
		// Scope kind select
		await expect(dialog.getByRole("combobox").first()).toBeVisible();
	});

	test("KnowledgeCreateDialog defaults scope to factory", async ({ page }) => {
		await page.goto("/knowledge");
		await page.waitForSelector("[data-testid='knowledge-list-page']");

		await page.getByRole("button", { name: "+ New" }).click();
		const dialog = page.getByRole("dialog");
		await expect(dialog).toBeVisible();

		// The first select (scope kind) should default to "factory"
		const scopeSelect = dialog.getByRole("combobox").first();
		await expect(scopeSelect).toHaveValue("factory");
	});
});

// ---------------------------------------------------------------------------
// AC-4: Create button disabled until required fields are non-empty
// ---------------------------------------------------------------------------

test.describe("Q2 AC-4: Creation flow validation", () => {
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
					body: JSON.stringify({ ...MOCK_KNOWLEDGE_ITEM, id: "ki-new-1" }),
				});
			} else {
				await route.continue();
			}
		});
	});

	test("Create button is disabled when title and body are empty", async ({ page }) => {
		await page.goto("/knowledge");
		await page.waitForSelector("[data-testid='knowledge-list-page']");

		await page.getByRole("button", { name: "+ New" }).click();
		const dialog = page.getByRole("dialog");
		await expect(dialog).toBeVisible();

		// Create button should be disabled
		const createBtn = dialog.getByRole("button", { name: "Create" });
		await expect(createBtn).toBeDisabled();
	});

	test("Create button is enabled when title and body are filled", async ({ page }) => {
		await page.goto("/knowledge");
		await page.waitForSelector("[data-testid='knowledge-list-page']");

		await page.getByRole("button", { name: "+ New" }).click();
		const dialog = page.getByRole("dialog");
		await expect(dialog).toBeVisible();

		await dialog.getByPlaceholder("What did you learn?").fill("My test title");
		await dialog.getByPlaceholder("Describe it in markdown...").fill("My test body");

		const createBtn = dialog.getByRole("button", { name: "Create" });
		await expect(createBtn).not.toBeDisabled();
	});

	test("Cancel button closes the dialog", async ({ page }) => {
		await page.goto("/knowledge");
		await page.waitForSelector("[data-testid='knowledge-list-page']");

		await page.getByRole("button", { name: "+ New" }).click();
		const dialog = page.getByRole("dialog");
		await expect(dialog).toBeVisible();

		await dialog.getByRole("button", { name: "Cancel" }).click();
		await expect(dialog).not.toBeVisible();
	});

	test("After successful creation dialog closes", async ({ page }) => {
		await page.goto("/knowledge");
		await page.waitForSelector("[data-testid='knowledge-list-page']");

		await page.getByRole("button", { name: "+ New" }).click();
		const dialog = page.getByRole("dialog");
		await expect(dialog).toBeVisible();

		await dialog.getByPlaceholder("What did you learn?").fill("Test title");
		await dialog.getByPlaceholder("Describe it in markdown...").fill("Test body content");
		await dialog.getByRole("button", { name: "Create" }).click();

		// Dialog should close after creation
		await expect(dialog).not.toBeVisible();
	});
});

// ---------------------------------------------------------------------------
// AC-5: Contextual creation from bet detail
// ---------------------------------------------------------------------------

test.describe("Q2 AC-5: Add knowledge from bet detail", () => {
	test.beforeEach(async ({ page }) => {
		// Mock bet detail API
		await page.route("**/api/bets/bet-test-1", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(MOCK_BET),
			});
		});

		// Mock knowledge creation
		await page.route("**/api/knowledge", async (route) => {
			if (route.request().method() === "POST") {
				await route.fulfill({
					status: 201,
					contentType: "application/json",
					body: JSON.stringify({
						...MOCK_KNOWLEDGE_ITEM,
						id: "ki-bet-1",
						scopeKind: "bet",
						scopeId: "bet-test-1",
					}),
				});
			} else {
				await route.continue();
			}
		});

		// Mock bet artifacts/threads
		await page.route("**/api/artifacts**", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ items: [], nextCursor: null }),
			});
		});
		await page.route("**/api/threads/**", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ thread: null }),
			});
		});
	});

	test("WorkBet page shows Add knowledge button", async ({ page }) => {
		await page.goto("/work/bet/bet-test-1");
		await page.waitForSelector("[data-testid='bet-detail-page']", { timeout: 5000 }).catch(() => {
			// Fallback: wait for any bet-related content
		});

		const addKnowledgeBtn = page.getByRole("button", { name: "Add knowledge" });
		await expect(addKnowledgeBtn).toBeVisible();
	});

	test("Add knowledge from bet opens dialog with bet scope locked", async ({ page }) => {
		await page.goto("/work/bet/bet-test-1");

		const addKnowledgeBtn = page.getByRole("button", { name: "Add knowledge" });
		await addKnowledgeBtn.click();

		const dialog = page.getByRole("dialog");
		await expect(dialog).toBeVisible();

		// Scope should show "bet" as a locked tag (not a select)
		await expect(dialog.getByText("bet")).toBeVisible();
		// The scope select should not be visible (scope is locked as read-only Tag)
		await expect(dialog.getByRole("combobox", { name: /scope kind/i })).not.toBeVisible();
	});
});

// ---------------------------------------------------------------------------
// AC-11: E2E — Create from bet detail, item visible in Knowledge list
// ---------------------------------------------------------------------------

test.describe("Q2 AC-11: Create knowledge from bet detail, visible in list", () => {
	test("item created on bet detail page appears in knowledge list", async ({ page }) => {
		const createdItem = {
			...MOCK_KNOWLEDGE_ITEM,
			id: "ki-bet-created",
			title: "Bet knowledge item",
			scopeKind: "bet",
			scopeId: "bet-test-1",
		};

		// Mock bet detail
		await page.route("**/api/bets/bet-test-1", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(MOCK_BET),
			});
		});

		// Mock knowledge endpoints
		let knowledgeCreated = false;
		await page.route("**/api/knowledge", async (route) => {
			if (route.request().method() === "POST") {
				knowledgeCreated = true;
				await route.fulfill({
					status: 201,
					contentType: "application/json",
					body: JSON.stringify(createdItem),
				});
			} else if (route.request().method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({
						items: knowledgeCreated ? [createdItem] : [],
					}),
				});
			} else {
				await route.continue();
			}
		});

		// Mock artifacts/threads on bet page
		await page.route("**/api/artifacts**", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ items: [], nextCursor: null }),
			});
		});
		await page.route("**/api/threads/**", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ thread: null }),
			});
		});

		// Navigate to bet, create knowledge item
		await page.goto("/work/bet/bet-test-1");

		const addKnowledgeBtn = page.getByRole("button", { name: "Add knowledge" });
		await addKnowledgeBtn.click();

		const dialog = page.getByRole("dialog");
		await expect(dialog).toBeVisible();
		await dialog.getByPlaceholder("What did you learn?").fill("Bet knowledge item");
		await dialog.getByPlaceholder("Describe it in markdown...").fill("Body content");
		await dialog.getByRole("button", { name: "Create" }).click();
		await expect(dialog).not.toBeVisible();

		// Navigate to knowledge list and check item is visible
		await page.goto("/knowledge");
		await page.waitForSelector("[data-testid='knowledge-list-page']");
		await expect(page.getByText("Bet knowledge item")).toBeVisible();
	});
});

// ---------------------------------------------------------------------------
// AC-12: E2E — Change scope from user→product → Private tag disappears
// ---------------------------------------------------------------------------

test.describe("Q2 AC-12: Change scope from user to product", () => {
	test("changing scope from user to product removes Private tag", async ({ page }) => {
		const userItem = {
			...MOCK_KNOWLEDGE_USER_ITEM,
			id: "ki-private-1",
		};

		let currentScopeKind = "user";

		// Mock knowledge list — item starts as user-scoped with Private tag
		await page.route("**/api/knowledge", async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({
						items: [
							{
								...userItem,
								scopeKind: currentScopeKind,
							},
						],
					}),
				});
			} else {
				await route.continue();
			}
		});

		// Mock GET for single item (exact path match)
		await page.route(`**/api/knowledge/${userItem.id}`, async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({
						...userItem,
						scopeKind: currentScopeKind,
					}),
				});
			} else {
				await route.continue();
			}
		});

		// Mock the scope change. It rides the ordinary document edit —
		// PATCH /api/knowledge/:id — because scope is a field like any other. The
		// separate /:id/scope endpoint is deleted.
		await page.route(`**/api/knowledge/${userItem.id}`, async (route) => {
			if (route.request().method() === "PATCH") {
				const body = (await route.request().postDataJSON()) as {
					scopeKind?: string;
				};
				if (body.scopeKind) {
					currentScopeKind = body.scopeKind;
				}
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({
						...userItem,
						scopeKind: currentScopeKind,
						scopeId: "prod-abc",
						version: 2,
					}),
				});
			} else {
				await route.continue();
			}
		});

		// Navigate to knowledge list
		await page.goto("/knowledge");
		await page.waitForSelector("[data-testid='knowledge-list-page']");

		// User-scoped item should show Private tag (exact: true to avoid case-insensitive
		// substring match with item title "My private note" which contains "private")
		await expect(page.getByText("Private", { exact: true })).toBeVisible();

		// Click on the item to go to detail page
		await page.getByText("My private note").click();
		await page
			.waitForSelector("[data-testid='knowledge-detail-page']", { timeout: 5000 })
			.catch(() => {});

		// Click "Change scope"
		const changeScopeBtn = page.getByRole("button", { name: "Change scope" });
		await expect(changeScopeBtn).toBeVisible();
		await changeScopeBtn.click();

		const dialog = page.getByRole("dialog");
		await expect(dialog).toBeVisible();

		// Select new scope = product
		const newScopeSelect = dialog.getByRole("combobox").first();
		await newScopeSelect.selectOption("product");

		// Fill scope_id — plain text input, located by placeholder
		await dialog.getByPlaceholder("product ID").fill("prod-abc");

		// Save
		await dialog.getByRole("button", { name: "Save" }).click();
		await expect(dialog).not.toBeVisible();

		// Navigate back to knowledge list
		await page.goto("/knowledge");
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
		await page.route("**/api/knowledge", async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({ items: [MOCK_KNOWLEDGE_USER_ITEM] }),
				});
			} else {
				await route.continue();
			}
		});

		await page.goto("/knowledge");
		await page.waitForSelector("[data-testid='knowledge-list-page']");

		await expect(page.getByText("Private", { exact: true })).toBeVisible();
	});

	test("non-user-scoped item does NOT render Private tag", async ({ page }) => {
		await page.route("**/api/knowledge", async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({ items: [MOCK_KNOWLEDGE_ITEM] }),
				});
			} else {
				await route.continue();
			}
		});

		await page.goto("/knowledge");
		await page.waitForSelector("[data-testid='knowledge-list-page']");

		await expect(page.getByText("Private", { exact: true })).not.toBeVisible();
	});
});
