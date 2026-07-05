/**
 * J8 — axe-core accessibility audit.
 *
 * @lore Zero-tolerance for WCAG 2.1 A/AA violations on the primary routes.
 * The audit is scoped to rules tagged `wcag2a`, `wcag2aa`, and `wcag21aa` to
 * keep the assertion precise; best-practice-tagged rules are noisy on
 * DaisyUI-based layouts and are not part of the acceptance criterion.
 *
 * When this suite fails, fix the violation at the primitive level so every
 * consumer benefits — never annotate the DOM just to silence axe.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "./fixtures";

// L9: /conversations/review and /conversations/chat replaced by /conversations.
const ROUTES = [
	{ path: "/conversations", selector: "[data-testid='conversations-page']" },
	{ path: "/work/portfolio", selector: "[data-testid='work-overview-page']" },
	// @lore L13: /work/team was removed in L13; the route now redirects to
	// /work/portfolio. We replace it with a product drilldown to keep route
	// coverage. The /api/teams/p1 mock is registered in beforeEach so this
	// test is hermetic on CI (no real DB needed).
	{ path: "/work/product/p1", selector: "[data-testid='work-team-page']" },
	{ path: "/work/bet/b1", selector: "[data-testid='work-bet-page']" },
	{ path: "/knowledge", selector: "[data-testid='knowledge-list-page']" },
	{ path: "/knowledge/k1", selector: "[data-testid='knowledge-detail-page']" },
] as const;

test.describe("axe-core — zero WCAG 2.1 AA violations", () => {
	// @lore L16: WorkBet calls useBet (real API). Mock /api/bets/b1 so the
	// bet route is hermetic on CI where no real DB is present.
	// @lore L13: WorkProduct calls useProduct. Mock /api/teams/p1 so the
	// product drilldown route (added after WorkTeam removal) is also hermetic.
	test.beforeEach(async ({ page }) => {
		await page.route("**/api/bets/b1", (route) =>
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					id: "b1",
					title: "User auth flow",
					product: "Alpha",
					team: "Alpha Core",
					status: "committed",
					costAppetite: { minor: 100000, currency: "USD" },
					costActual: { minor: 4200, currency: "USD" },
					tokensActual: null,
					progress: { done: 3, total: 8 },
					description: "# Problem\n\nAuth is broken.\n",
					tasks: [
						{
							id: "t1",
							betId: "b1",
							title: "Implement login endpoint",
							ownerAgentId: "agent-dev-1",
							state: "done",
							costActual: { minor: 4200, currency: "USD" },
							costCap: null,
							latestSessionOutcome: null,
							latestSessionCost: null,
							latestSessionTokensInput: null,
							latestSessionTokensOutput: null,
							latestSessionHarnessUrl: null,
						},
					],
				}),
			}),
		);
		await page.route("**/api/teams/p1", (route) =>
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					team: {
						id: "p1",
						name: "Alpha",
						phase: "build",
						status: "healthy",
						leadAgentId: "agent-1",
					},
					teamMembers: { id: "t1", formedAt: "2024-01-01T00:00:00Z", dissolvedAt: null },
					roster: [{ agentId: "agent-1", name: "Alice", role: "Lead Engineer", isLead: true }],
					burn: {
						costActual: { minor: 10000, currency: "USD" },
						costCap: { minor: 100000, currency: "USD" },
						capacity: 3,
						activeBets: 1,
					},
					activeBets: [
						{
							id: "b1",
							descriptionTitle: "User auth flow",
							costAppetite: { minor: 100000, currency: "USD" },
							status: "active",
							progressDone: 3,
							progressTotal: 8,
						},
					],
				}),
			}),
		);
	});

	for (const route of ROUTES) {
		test(`no WCAG 2.1 AA violations on ${route.path}`, async ({ page }) => {
			await page.goto(route.path);
			await page.waitForSelector(route.selector);
			const results = await new AxeBuilder({ page })
				.withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
				.analyze();
			expect(results.violations).toEqual([]);
		});
	}

	test("Settings overlay passes the audit while open", async ({ page }) => {
		await page.goto("/");
		await page.waitForSelector("[data-testid='main-content']");
		await page.getByRole("button", { name: /^settings$/i }).click();
		await expect(page.getByTestId("settings-page")).toBeVisible();
		// @lore P4 replaced the old Settings dialog with an in-shell settings
		// page. Keep this audit on the rendered settings content instead of the
		// deleted modal role.
		const results = await new AxeBuilder({ page })
			.include("[data-testid='settings-page']")
			.withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
			.analyze();
		expect(results.violations).toEqual([]);
	});
});
