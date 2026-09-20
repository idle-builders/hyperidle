/**
 * W3 — Sidebar E2E tests: AC-1, AC-2, AC-3, AC-4.
 *
 * AC-1: Sidebar bottom strip has three elements: Search hint with ⌘K badge,
 *       user avatar (settings trigger), and Assistant/CoC button.
 * AC-2: Work section sub-nav shows teams from API.
 * AC-3: Knowledge section has NO sub-items (no Practices/Products/Factory).
 * AC-4: Conversations sub-nav shows recent threads.
 */

import { expect, makeThreadListRow, mockSearchThreads, test } from "./fixtures";

const TEAMS_FIXTURE = {
	teams: [
		{ id: "t1", name: "Alpha Core", phase: "build", active: true },
		{ id: "t2", name: "Beta Squad", phase: "build", active: true },
	],
};

// @lore BC3: no `task` host kind — a task's own thread is `team`-hosted.
const THREADS_FIXTURE = [
	makeThreadListRow("th1", {
		title: "Auth implementation review",
		computedTitle: "Auth implementation review",
		hostKind: "team",
		hostId: "task-1",
		initiatorId: "u-founder",
		members: ["u-founder"],
		lastActiveAt: new Date().toISOString(),
		createdAt: new Date().toISOString(),
		hasUnresolvedReview: false,
	}),
];

test.describe("W3 AC-1 — Sidebar bottom strip", () => {
	test.beforeEach(async ({ page }) => {
		await page.route("**/api/teams", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(TEAMS_FIXTURE),
			});
		});
		await mockSearchThreads(page, { rows: THREADS_FIXTURE });
		await page.goto("/conversations");
		await page.waitForSelector("[data-ds-shell='Sidebar']");
	});

	test("sidebar bottom strip has a search hint with Cmd+K badge", async ({ page }) => {
		const searchHint = page.getByTestId("sidebar-search-hint");
		await expect(searchHint).toBeVisible();
		// Must contain the ⌘K shortcut
		await expect(searchHint).toContainText(/cmd\+k/i);
	});

	test("sidebar bottom strip has user avatar as settings trigger", async ({ page }) => {
		const avatarBtn = page.getByTestId("sidebar-avatar-btn");
		await expect(avatarBtn).toBeVisible();
	});

	test("sidebar bottom strip has 'Assistant' CoC button", async ({ page }) => {
		// Regression guard: old agent label should not be visible; 'Assistant' is the current label.
		await expect(page.getByText("Chief of Staff")).not.toBeVisible();
		await expect(page.getByText("Assistant")).toBeVisible();
	});

	test("clicking search hint triggers search (Cmd+K behavior)", async ({ page }) => {
		const searchHint = page.getByTestId("sidebar-search-hint");
		await searchHint.click();
		// Command palette / search dialog should open
		await expect(page.getByRole("dialog", { name: /search|command/i })).toBeVisible();
	});
});

test.describe("W3 AC-3 — Knowledge section has no scope sub-items", () => {
	test.beforeEach(async ({ page }) => {
		await page.route("**/api/teams", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(TEAMS_FIXTURE),
			});
		});
		await page.goto("/knowledge");
		await page.waitForSelector("[data-ds-shell='Sidebar']");
	});

	test("Knowledge section has no 'Practices' sub-item", async ({ page }) => {
		await expect(page.getByRole("button", { name: /^practices$/i })).not.toBeVisible();
	});

	test("Knowledge section has no 'Products' sub-item", async ({ page }) => {
		await expect(page.getByRole("button", { name: /^products$/i })).not.toBeVisible();
	});

	test("Knowledge section has no 'Factory' sub-item", async ({ page }) => {
		await expect(page.getByRole("button", { name: /^factory$/i })).not.toBeVisible();
	});
});

test.describe("W3 AC-2 — Work section shows teams from API", () => {
	test.beforeEach(async ({ page }) => {
		await page.route("**/api/teams", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(TEAMS_FIXTURE),
			});
		});
		await page.goto("/work/portfolio");
		await page.waitForSelector("[data-ds-shell='Sidebar']");
	});

	test("Work section shows team names from API", async ({ page }) => {
		// Alpha Core and Beta Squad should appear in the sidebar Work section
		const sidebar = page.locator("[data-ds-shell='Sidebar']");
		await expect(sidebar.getByText("Alpha Core")).toBeVisible();
		await expect(sidebar.getByText("Beta Squad")).toBeVisible();
	});
});

test.describe("W3 AC-4 — Conversations sub-nav shows recent threads", () => {
	test.beforeEach(async ({ page }) => {
		await mockSearchThreads(page, { rows: THREADS_FIXTURE });
		await page.route("**/api/teams", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(TEAMS_FIXTURE),
			});
		});
		await page.goto("/conversations");
		await page.waitForSelector("[data-ds-shell='Sidebar']");
	});

	test("sidebar conversations section shows thread titles", async ({ page }) => {
		const sidebar = page.locator("[data-ds-shell='Sidebar']");
		await expect(sidebar.getByText("Auth implementation review")).toBeVisible();
	});
});
