/**
 * L12 — Artifact view family across Work surfaces E2E tests.
 *
 * AC coverage:
 *  - WorkPortfolio: ArtifactGalleryCard renders on /work/portfolio
 *  - WorkProduct: ArtifactStackItem renders on /work/product/:id
 *  - WorkBet: ArtifactStackItem renders on /work/bet/:id (BEFORE thread section)
 *  - TaskSheet: ArtifactPreview renders when task sheet is open
 *  - Overflow "View all" is a non-interactive <span> (not a link or button)
 *
 * @lore L12 (B-2): E2E selectors use data-ds-component="ArtifactGalleryCard"
 * (NOT data-component). The dsProps() helper sets data-ds-component per ds-attrs.ts.
 */
import { expect, type Route, test } from "@playwright/test";
import type { Page } from "@playwright/test";

// Canonical Artifact fixtures — match ArtifactPage shape
const ARTIFACT_FIXTURES = [
	{
		id: "art-e2e-l12-1",
		producingTaskId: "task-e2e-1",
		producingTaskTitle: "Build auth service",
		kind: "code_diff",
		preview: {
			kind: "code_diff",
			file: "packages/web/src/auth.ts",
			hunks: [
				{
					header: "@@ -1,2 +1,3 @@",
					lines: [
						{ kind: "ctx", text: "context" },
						{ kind: "add", text: "+ added" },
					],
				},
			],
		},
		cost: { money: "$0.04", tokens: "1.2k" },
		threadCount: 0,
		createdAt: "2026-05-01T10:00:00.000Z",
	},
	{
		id: "art-e2e-l12-2",
		producingTaskId: "task-e2e-2",
		producingTaskTitle: "Design pitch deck",
		kind: "deck",
		preview: { kind: "deck", slideCount: 8, firstSlideTitle: "Executive summary" },
		cost: { money: "$0.12", tokens: "8k" },
		threadCount: 2,
		createdAt: "2026-05-01T09:00:00.000Z",
	},
];

const ARTIFACT_PAGE_RESPONSE = { items: ARTIFACT_FIXTURES, nextCursor: null };
const ARTIFACT_PAGE_WITH_CURSOR = { items: ARTIFACT_FIXTURES, nextCursor: "next-page-cursor" };
const SINGLE_ARTIFACT = { items: [ARTIFACT_FIXTURES[0]], nextCursor: null };

async function mockArtifactsOnPage(page: Page, response: typeof ARTIFACT_PAGE_RESPONSE): Promise<void> {
	await page.route("**/api/artifacts?**", async (route: Route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify(response),
		});
	});
}

async function mockEmptyArtifacts(page: Page): Promise<void> {
	await page.route("**/api/artifacts?**", async (route: Route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ items: [], nextCursor: null }),
		});
	});
}

test.describe("L12 — Artifact surfaces on Work pages", () => {
	// ── WorkPortfolio ─────────────────────────────────────────────────────────

	test("WorkPortfolio: ArtifactGalleryCard renders when artifacts exist", async ({ page }) => {
		await mockArtifactsOnPage(page, ARTIFACT_PAGE_RESPONSE);
		await page.goto("/work/portfolio");
		await page.waitForSelector("[data-testid='work-portfolio-page']");

		// ArtifactSection renders gallery cards
		await expect(
			page.locator("[data-ds-component='ArtifactGalleryCard']").first(),
		).toBeVisible();
	});

	test("WorkPortfolio: 'Artifacts' heading renders above the gallery", async ({ page }) => {
		await mockArtifactsOnPage(page, ARTIFACT_PAGE_RESPONSE);
		await page.goto("/work/portfolio");
		await page.waitForSelector("[data-testid='work-portfolio-page']");

		await expect(page.getByText("Artifacts")).toBeVisible();
	});

	test("WorkPortfolio: no gallery cards when artifacts are empty", async ({ page }) => {
		await mockEmptyArtifacts(page);
		await page.goto("/work/portfolio");
		await page.waitForSelector("[data-testid='work-portfolio-page']");

		const galleryCards = page.locator("[data-ds-component='ArtifactGalleryCard']");
		await expect(galleryCards).toHaveCount(0);
	});

	test("WorkPortfolio: 'View all' is a non-interactive span when nextCursor exists", async ({ page }) => {
		await mockArtifactsOnPage(page, ARTIFACT_PAGE_WITH_CURSOR);
		await page.goto("/work/portfolio");
		await page.waitForSelector("[data-testid='work-portfolio-page']");

		const viewAll = page.locator("[data-testid='artifact-section-view-all']");
		await expect(viewAll).toBeVisible();

		// Must be a span (non-interactive), NOT an anchor or button
		const tagName = await viewAll.evaluate((el) => el.tagName.toLowerCase());
		expect(tagName).toBe("span");
	});

	// ── WorkProduct ───────────────────────────────────────────────────────────

	test("WorkProduct: ArtifactStackItem renders when artifacts exist", async ({ page }) => {
		await page.route("**/api/products/**", async (route: Route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					product: {
						id: "prod-e2e",
						name: "E2E Test Product",
						status: "active",
						phase: "build",
						leadAgentId: null,
						activeBets: 0,
						shipped: 0,
						shipRate: "0%",
						progress: { done: 0, total: 0 },
					},
					roster: [],
					burn: { costActual: 0, costCap: null, activeBets: 0, capacity: 3 },
					activeBets: [],
				}),
			});
		});
		await mockArtifactsOnPage(page, ARTIFACT_PAGE_RESPONSE);

		await page.goto("/work/product/prod-e2e");
		await page.waitForSelector("[data-testid='work-product-page']");

		await expect(
			page.locator("[data-ds-component='ArtifactStackItem']").first(),
		).toBeVisible();
	});

	// ── WorkBet ───────────────────────────────────────────────────────────────

	test("WorkBet: ArtifactStackItem renders when artifacts exist", async ({ page }) => {
		await page.route("**/api/bets/**", async (route: Route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					id: "bet-e2e",
					title: "E2E Test Bet",
					product: "E2E Product",
					team: "E2E Team",
					status: "committed",
					appetite: "2 weeks",
					progress: { done: 1, total: 3 },
					pitch: "# Problem\nTest.",
					tasks: [],
				}),
			});
		});
		await page.route("**/api/artifact-thread-summaries?**", async (route: Route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ summaries: [], totalCount: 0, truncated: false }),
			});
		});
		await page.route("**/api/threads/**", async (route: Route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ id: "thread-e2e", messages: [], participants: [] }),
			});
		});
		await mockArtifactsOnPage(page, ARTIFACT_PAGE_RESPONSE);

		await page.goto("/work/bet/bet-e2e");
		await page.waitForSelector("[data-testid='work-bet-page']");

		await expect(
			page.locator("[data-ds-component='ArtifactStackItem']").first(),
		).toBeVisible();
	});

	test("WorkBet: ArtifactSection appears BEFORE thread section in DOM", async ({ page }) => {
		await page.route("**/api/bets/**", async (route: Route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					id: "bet-e2e-order",
					title: "Order Test Bet",
					product: "E2E Product",
					team: "E2E Team",
					status: "committed",
					appetite: "2 weeks",
					progress: { done: 0, total: 1 },
					pitch: "# Problem\nTest order.",
					tasks: [],
				}),
			});
		});
		await page.route("**/api/artifact-thread-summaries?**", async (route: Route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ summaries: [], totalCount: 0, truncated: false }),
			});
		});
		await page.route("**/api/threads/**", async (route: Route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ id: "thread-e2e-order", messages: [], participants: [] }),
			});
		});
		await mockArtifactsOnPage(page, ARTIFACT_PAGE_RESPONSE);

		await page.goto("/work/bet/bet-e2e-order");
		await page.waitForSelector("[data-testid='work-bet-page']");

		// Verify ArtifactSection renders before the thread host section in DOM
		// data-ds-shell="HostThreadSection" is set by dsShellProps in HostThreadSection
		const artifactSectionEl = page.locator("[data-testid='artifact-section-container']");
		const threadSection = page.locator("[data-ds-shell='HostThreadSection']");

		// Both must be visible
		await expect(artifactSectionEl).toBeVisible();
		await expect(threadSection.first()).toBeVisible();

		// ArtifactSection's top offset must be less than thread section's top offset
		const artifactBox = await artifactSectionEl.boundingBox();
		const threadBox = await threadSection.first().boundingBox();

		expect(artifactBox).not.toBeNull();
		expect(threadBox).not.toBeNull();

		if (artifactBox && threadBox) {
			expect(artifactBox.y).toBeLessThan(threadBox.y);
		}
	});

	// ── TaskSheet ─────────────────────────────────────────────────────────────

	test("TaskSheet: ArtifactPreview renders when task has artifacts", async ({ page }) => {
		await page.route("**/api/bets/**", async (route: Route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					id: "bet-ts-e2e",
					title: "Task Sheet Bet",
					product: "TS Product",
					team: "TS Team",
					status: "committed",
					appetite: "1 week",
					progress: { done: 0, total: 1 },
					pitch: "# Test",
					tasks: [{ id: "task-ts-1", title: "Task for sheet", state: "in_progress", owner: "Dev", cost: "$1.00" }],
				}),
			});
		});
		await page.route("**/api/artifact-thread-summaries?**", async (route: Route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ summaries: [], totalCount: 0, truncated: false }),
			});
		});
		await page.route("**/api/threads/**", async (route: Route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ id: "thread-ts-e2e", messages: [], participants: [] }),
			});
		});
		// Mock with single artifact for the task
		await page.route("**/api/artifacts?**", async (route: Route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(SINGLE_ARTIFACT),
			});
		});

		await page.goto("/work/bet/bet-ts-e2e");
		await page.waitForSelector("[data-testid='work-bet-page']");

		// Click the task row to open TaskSheet
		const taskRow = page.getByTestId("bet-task-row").first();
		await taskRow.click();

		// TaskSheet should open and show ArtifactPreview
		await expect(page.locator("[data-ds-component='ArtifactPreview']").first()).toBeVisible();
	});
});
