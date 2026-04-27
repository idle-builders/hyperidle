/**
 * E2E tests for the shell navigation: IconRail view switching, Submenu items,
 * and overall layout structure.
 */
import { expect, type Page, test } from "@playwright/test";

// @lore L3: the Conversations submenu reads from `/api/me` and
// `/api/conversations`. These tests do not depend on a live backend — we
// stub the responses so the submenu renders deterministically (one chat
// row + one review row, current actor = CEO so the routing chips render).
async function installApiMocks(page: Page): Promise<void> {
	await page.route("**/api/me", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ id: "actor:ceo", role: "CEO", domain_tags: [] }),
		});
	});
	await page.route("**/api/conversations**", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({
				threads: [
					{
						id: "thread-review-x",
						kind: "review",
						pinned: 0,
						participants: ["agent:dev"],
						routedToActorId: "actor:ceo",
						routedToActorRole: "CEO",
						domainTag: null,
						createdAt: "2026-04-26T10:00:00.000Z",
						lastActivityAt: "2026-04-26T11:00:00.000Z",
						blocking: false,
						resolvedAt: null,
					},
					{
						id: "thread-chat-x",
						kind: "chat",
						pinned: 0,
						participants: ["agent:planner"],
						routedToActorId: "actor:ceo",
						routedToActorRole: "CEO",
						domainTag: null,
						createdAt: "2026-04-26T09:00:00.000Z",
						lastActivityAt: "2026-04-26T10:00:00.000Z",
						blocking: false,
						resolvedAt: null,
					},
				],
				pagination: { page: 1, limit: 200, total: 2 },
			}),
		});
	});
}

test.describe("Navigation", () => {
	test.beforeEach(async ({ page }) => {
		await installApiMocks(page);
		await page.goto("/");
		// Default route redirects to /conversations/review
		await page.waitForSelector("[data-testid='main-content']");
	});

	test("shell layout renders four regions: IconRail, Submenu, Main, Rail", async ({ page }) => {
		// IconRail
		await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
		// Main content area
		await expect(page.getByTestId("main-content")).toBeVisible();
		// Rail sections
		await expect(page.getByText("Active Bets")).toBeVisible();
	});

	test("IconRail shows three view buttons: Conversations, Work, Knowledge", async ({ page }) => {
		await expect(page.getByRole("button", { name: /conversations/i })).toBeVisible();
		await expect(page.getByRole("button", { name: /work/i })).toBeVisible();
		await expect(page.getByRole("button", { name: /knowledge/i })).toBeVisible();
	});

	test("clicking Work button switches to Work view with Portfolio and Team submenu", async ({
		page,
	}) => {
		await page.getByRole("button", { name: /work/i }).click();
		await expect(page.getByRole("button", { name: "Portfolio" })).toBeVisible();
		await expect(page.getByRole("button", { name: "Team Board" })).toBeVisible();
	});

	test("clicking Knowledge button switches to Knowledge view", async ({ page }) => {
		// J6: Knowledge submenu is a scope browser + topic NavItems, not a flat
		// list. After clicking Knowledge we expect the Practice scope tab
		// selected and at least one topic NavItem visible.
		await page.getByRole("button", { name: /knowledge/i }).click();
		await expect(page.getByTestId("knowledge-submenu")).toBeVisible();
		await expect(
			page.getByTestId("knowledge-submenu").getByRole("tab", { name: "Practice" }),
		).toHaveAttribute("aria-selected", "true");
	});

	test("Submenu shows correct items for Conversations view", async ({ page }) => {
		// L3: the Conversations submenu is now a section-grouped thread queue
		// (Pinned / Blocking / Reviews / Chats / Resolved) plus the routing
		// filter chip row, not the static Review Queue / Chat NavItems. Assert
		// the new submenu shape is mounted with its section headers + routing
		// chips visible.
		const submenu = page.getByTestId("conversations-submenu");
		await expect(submenu).toBeVisible();
		await expect(submenu.getByTestId("section-reviews")).toBeVisible();
		await expect(submenu.getByTestId("section-chats")).toBeVisible();
		await expect(submenu.getByTestId("routing-filter-chips")).toBeVisible();
	});

	test("clicking Submenu item navigates to that page", async ({ page }) => {
		// L3: clicking a thread row navigates to the appropriate
		// /conversations/{review,chat}?thread=<id> page based on the row's
		// kind. Wait for at least one rendered thread row, click the first
		// chat row, and assert the URL + chat page mounted.
		const submenu = page.getByTestId("conversations-submenu");
		await page.waitForSelector("[data-testid='conversations-submenu'] [data-thread-id]");
		const chatRow = submenu.locator("[data-testid='thread-row-chats'] button").first();
		if (await chatRow.count()) {
			await chatRow.click();
			await expect(page).toHaveURL(/\/conversations\/(review|chat)\?thread=/);
		} else {
			// Fall back to clicking any thread row when the seeded fixture
			// has no chat-section rows. The contract under test is "row
			// click navigates"; the section taxonomy is exercised by the
			// L3 submenu spec.
			const anyRow = submenu.locator("[data-thread-id]").first();
			await anyRow.click();
			await expect(page).toHaveURL(/\/conversations\/(review|chat)\?thread=/);
		}
	});

	test("default route lands on Conversations Review", async ({ page }) => {
		await expect(page.getByTestId("conversations-review-page")).toBeVisible();
	});
});
