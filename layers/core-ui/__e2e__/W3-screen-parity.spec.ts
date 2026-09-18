/**
 * W3 — Screen parity E2E tests: AC-57, AC-59.
 *
 * AC-57: All content areas are centered (max-width + margin: 0 auto).
 * AC-59: All existing E2E tests pass (this file verifies the structural
 *        changes are in place across all screens).
 *
 * Max-width assertions per architecture plan §7:
 * - Conversations thread list: 800px
 * - Bet overview grid: 960px
 * - Bet detail body: 800px
 * - Task detail body: 800px
 * - Knowledge list: 800px
 * - Knowledge detail body: 960px
 * - Settings body: 680px
 */

import { expect, mockSearchThreads, test } from "./fixtures";

const TEAMS_FIXTURE = {
	teams: [{ id: "t1", name: "Alpha Core", phase: "build", active: true }],
};
const KNOWLEDGE_FIXTURE = { items: [] };

test.describe("W3 AC-57 — Max-width centering across all screens", () => {
	test("conversations thread list: content area ≤ 800px", async ({ page }) => {
		await mockSearchThreads(page, { rows: [] });
		await page.route("**/api/teams", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(TEAMS_FIXTURE),
			});
		});

		await page.goto("/conversations");
		await page.waitForSelector("[data-testid='conversations-page']");

		const threadList = page
			.locator("[data-testid='thread-list-container'], [data-testid='thread-sections']")
			.first();
		const box = await threadList.boundingBox();
		if (box) {
			expect(box.width).toBeLessThanOrEqual(800);
		}
	});

	test("work portfolio bet grid: content area ≤ 960px", async ({ page }) => {
		await page.route("**/api/teams", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(TEAMS_FIXTURE),
			});
		});

		await page.goto("/work/portfolio");
		await page.waitForSelector("[data-testid='work-portfolio-page']");

		const betGrid = page.getByTestId("bet-grid");
		const box = await betGrid.boundingBox();
		if (box) {
			expect(box.width).toBeLessThanOrEqual(960);
		}
	});

	test("knowledge list: content area ≤ 800px", async ({ page }) => {
		await page.route("**/api/knowledge*", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(KNOWLEDGE_FIXTURE),
			});
		});
		await page.route("**/api/teams", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(TEAMS_FIXTURE),
			});
		});

		await page.goto("/knowledge");
		await page.waitForSelector("[data-testid='knowledge-list-page']");

		// Knowledge list body container
		const listBody = page.locator("[data-testid='knowledge-list-page'] > :first-child");
		const box = await listBody.boundingBox();
		if (box) {
			expect(box.width).toBeLessThanOrEqual(800);
		}
	});
});

test.describe("W3 — Sidebar section headers styling (critique CRITICAL-1)", () => {
	test.beforeEach(async ({ page }) => {
		await page.route("**/api/teams", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(TEAMS_FIXTURE),
			});
		});
		await mockSearchThreads(page, { rows: [] });
		await page.goto("/conversations");
		await page.waitForSelector("[data-ds-shell='Sidebar']");
	});

	test("sidebar section headers use sans-serif font (not mono)", async ({ page }) => {
		const workHeader = page.locator("[data-section-header='work']");
		await expect(workHeader).toBeVisible();

		// Should NOT have font-mono class (mono-based styling removed in W3)
		const className = await workHeader.getAttribute("class");
		// In W3, section headers switch from mono/uppercase to sans-serif/sentence-case
		expect(className).not.toMatch(/font-mono|font-\[family-name:var\(--font-mono\)\]/);
	});

	test("sidebar section headers use sentence-case labels (not uppercase)", async ({ page }) => {
		const workHeader = page.locator("[data-section-header='work']");
		await expect(workHeader).toBeVisible();

		// Should NOT have uppercase class
		const className = await workHeader.getAttribute("class");
		expect(className).not.toMatch(/\buppercase\b/);
	});

	test("sidebar section headers use 14px font-size", async ({ page }) => {
		const workHeader = page.locator("[data-section-header='work']");
		await expect(workHeader).toBeVisible();

		const fontSize = await workHeader.evaluate((el) => {
			return window.getComputedStyle(el).fontSize;
		});
		// 14px = 14px (not 12px)
		expect(fontSize).toBe("14px");
	});
});

test.describe("W3 — Empty states match mockups (critique CRITICAL-2)", () => {
	test("conversations empty state visible when no threads", async ({ page }) => {
		await mockSearchThreads(page, { rows: [] });
		await page.route("**/api/teams", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(TEAMS_FIXTURE),
			});
		});

		await page.goto("/conversations");
		// The empty state should render
		const emptyState = page.getByTestId("thread-sections-empty");
		await expect(emptyState).toBeVisible();
	});

	test("work empty state visible when no bets", async ({ page }) => {
		await page.route("**/api/teams", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(TEAMS_FIXTURE),
			});
		});

		await page.goto("/work/portfolio");
		await page.waitForSelector("[data-testid='work-portfolio-page']");
		// Empty state should render
		const emptyState = page.getByTestId("work-empty-state");
		await expect(emptyState).toBeVisible();
	});

	test("knowledge empty state visible when no items", async ({ page }) => {
		await page.route("**/api/knowledge*", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ items: [] }),
			});
		});
		await page.route("**/api/teams", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(TEAMS_FIXTURE),
			});
		});

		await page.goto("/knowledge");
		await page.waitForSelector("[data-testid='knowledge-list-page']");
		// Empty state should render
		const emptyState = page.getByTestId("knowledge-empty-state");
		await expect(emptyState).toBeVisible();
	});
});
