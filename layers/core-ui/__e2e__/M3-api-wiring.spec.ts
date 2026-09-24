/**
 * M3 — API Wiring e2e tests.
 *
 * Covers the main user-visible paths affected by M3:
 *  - Auth: page loads and the user id shown is NOT "u-founder" literal (real auth)
 *  - Portfolio: empty state renders when no teams are returned
 *
 * All API calls are mocked via page.route() — no real server required.
 *
 * @lore AD8a: Rail section deleted — the Rail API (/api/rail) was removed in U6.
 * @lore AD8a: The RAIL_API_RESPONSE constant and "M3 — Rail" describe block no longer apply.
 *
 * @lore BC5 T9/T11: `GET /api/auth/me` and `GET/PATCH /api/settings` are
 * gone — `useCurrentUser` reads `open_user({})` (the fixtures.ts auto-use
 * default) and every settings section writes through `edit_user` directly,
 * one page at a time; there is no longer a single settings dialog reading one
 * blob, so the "M3 — Settings" describe block (a "user profile" button
 * opening a dialog that read `GET /api/settings`) tested a shape that does
 * not exist any more and is deleted rather than repointed. Portfolio's team
 * list is `search_users({})` now (`useTeams`), not `GET /api/teams`; its
 * page testid renamed `work-portfolio-page` → `work-overview-page` when the
 * page itself did (AD9), ahead of and unrelated to this change.
 */

import { expect, mockSearchThreads, mockSearchUsers, test } from "./fixtures";

/** Set up standard API mocks for M3 tests. */
async function setupApiMocks(page: import("@playwright/test").Page): Promise<void> {
	// Mock threads (needed by conversations view)
	await mockSearchThreads(page, { rows: [] });
}

test.describe("M3 — Auth: page loads with real user data", () => {
	test("page shell loads and does not render u-founder literal in visible text", async ({
		page,
	}) => {
		await setupApiMocks(page);
		await page.goto("/");
		await page.waitForSelector("[data-testid='main-content']");

		// The shell must render — check the main content area is visible
		await expect(page.getByTestId("main-content")).toBeVisible();

		// The literal "u-founder" string must NOT appear in the visible page text
		// (it was a hardcoded demo constant removed in M3 A11)
		const pageText = await page.evaluate(() => document.body.innerText);
		expect(pageText).not.toContain("u-founder");
	});
});

test.describe("M3 — Portfolio: empty state when no teams", () => {
	test("portfolio renders empty state when API returns no teams", async ({ page }) => {
		await setupApiMocks(page);
		await mockSearchUsers(page, { rows: [] });

		await page.goto("/work/portfolio");
		await page.waitForSelector("[data-testid='work-overview-page-empty']");

		// With no users (so no teams) from the API, the empty state should render
		// and no MOCK_PRODUCTS content ("HyperIdle Core", "Knowledge Fabric") should appear
		await expect(page.getByText("HyperIdle Core")).toHaveCount(0);
		await expect(page.getByText("Knowledge Fabric")).toHaveCount(0);
	});

	test("MOCK_PRODUCTS content ('HyperIdle Core') never appears from API mocked as empty", async ({
		page,
	}) => {
		await setupApiMocks(page);
		await mockSearchUsers(page, { rows: [] });

		await page.goto("/work/portfolio");
		await page.waitForSelector("[data-testid='work-overview-page-empty']");

		// All MOCK_PRODUCTS strings must be absent — fixture deleted in M3 C1
		const pageText = await page.evaluate(() => document.body.innerText);
		expect(pageText).not.toContain("HyperIdle Core");
		expect(pageText).not.toContain("Knowledge Fabric");
		expect(pageText).not.toContain("Review Workbench");
		expect(pageText).not.toContain("Agent Runtime");
	});
});
