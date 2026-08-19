/**
 * AH4 AC5 — Playwright E2E: Settings org chart displays a founder→team edge.
 *
 * SCOPE — UI RENDERING ONLY:
 * (a) These specs verify that the org-chart table in the Settings page correctly
 *     renders an edge row given the API shape. They do NOT stand up a real backend.
 * (b) The real backend-side-effect proof (edge created BY team creation; org edge
 *     written to DB; auth-context anti-spoof) is covered by the integration tests
 *     in packages/server/src/routes/__tests__/AH4-org-edge.integration.test.ts
 *     which run against a real Hono+PGlite server.
 * (c) The real-path frontend→backend E2E proof for AH4's (Playwright, required)
 *     scenarios is owned by AH5's live smoke lane (feat/AH5-live-smoke-lane).
 *     AH4 does not stand up a parallel real-path harness per AH5's spec.
 *
 * Strategy: use page.route() to mock GET /api/org returning a founder→team edge;
 * navigate to Settings; assert edge row visible.
 *
 * @lore N2: All AH4 E2E specs use page.route() mocking — consistent with 78/90
 * existing specs. See layers/core-ui/playwright.config.ts @lore N2.
 */

import * as path from "node:path";
import { expect, test } from "./fixtures";

const FOUNDER_ID = "test-founder";
const TEAM_ID = "team-ah4-e2e";
const TEAM_NAME = "AH4 E2E Team";
const EDGE_ID = "edge-ah4-e2e";

function makeOrgResponse() {
	return {
		edges: [
			{
				id: EDGE_ID,
				fromUserId: FOUNDER_ID,
				mechanism: "team",
				target: TEAM_ID,
				createdAt: new Date().toISOString(),
			},
		],
		users: [
			{
				id: FOUNDER_ID,
				kind: "human",
				name: "Test Founder",
				role: "founder",
			},
		],
		teams: [{ id: TEAM_ID, name: TEAM_NAME }],
	};
}

test.describe("AH4 AC5 — Org chart shows founder→team edge after team creation", () => {
	test("Settings Org Chart shows mechanism=team edge with no manual add", async ({ page }) => {
		// Mock GET /api/org to return the founder→team edge
		await page.route("**/api/org", async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify(makeOrgResponse()),
				});
			} else {
				await route.continue();
			}
		});

		// Navigate to settings page
		await page.goto("/settings");
		await page.waitForSelector("[data-testid='settings-page']");

		// Scroll/find the org chart section
		const orgChartSection = page.locator("[data-testid='settings-section-org-chart']");
		await expect(orgChartSection).toBeVisible();

		// The edge table must contain a row with "team" mechanism
		await expect(orgChartSection.getByText("team")).toBeVisible({ timeout: 5000 });

		// Screenshot for proof
		const screenshotDir = path.join("plans", "AH4", "proof");
		await page.screenshot({
			path: path.join(screenshotDir, "org-chart-team-edge.png"),
			fullPage: false,
		});
	});

	test("Org Chart edge row target matches the created team's id", async ({ page }) => {
		await page.route("**/api/org", async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify(makeOrgResponse()),
				});
			} else {
				await route.continue();
			}
		});

		await page.goto("/settings");
		await page.waitForSelector("[data-testid='settings-page']");

		const orgChartSection = page.locator("[data-testid='settings-section-org-chart']");

		// The target cell should contain the team id (teamMembers.id = teams.id after AU44 fold)
		await expect(orgChartSection.getByText(TEAM_ID)).toBeVisible({ timeout: 5000 });
	});
});
