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

import type { Page } from "./fixtures";
import { expect, type Route, test } from "./fixtures";

// Canonical Artifact fixtures — match ArtifactPage shape
const ARTIFACT_FIXTURES = [
	{
		id: "art-e2e-l12-1",
		producingTaskId: "task-e2e-1",
		producingTaskTitle: "Build auth service",
		kind: "code_diff",
		preview: {
			kind: "code_diff",
			file: "layers/core-ui/src/auth.ts",
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
		threadCount: 0,
		createdAt: "2026-05-01T10:00:00.000Z",
	},
	{
		id: "art-e2e-l12-2",
		producingTaskId: "task-e2e-2",
		producingTaskTitle: "Design pitch deck",
		kind: "deck",
		preview: { kind: "deck", slideCount: 8, firstSlideTitle: "Executive summary" },
		threadCount: 2,
		createdAt: "2026-05-01T09:00:00.000Z",
	},
];

const ARTIFACT_PAGE_RESPONSE = { items: ARTIFACT_FIXTURES, nextCursor: null };
const ARTIFACT_PAGE_WITH_CURSOR = { items: ARTIFACT_FIXTURES, nextCursor: "next-page-cursor" };
const SINGLE_ARTIFACT = { items: [ARTIFACT_FIXTURES[0]], nextCursor: null };

async function mockArtifactsOnPage(
	page: Page,
	response: typeof ARTIFACT_PAGE_RESPONSE,
): Promise<void> {
	await page.route("**/api/artifacts?**", async (route: Route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify(response),
		});
	});
}

async function mockThreadEndpoints(page: Page): Promise<void> {
	await page.route("**/api/threads**", async (route: Route) => {
		const url = route.request().url();
		if (url.includes("?")) {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ threads: [], nextCursor: null }),
			});
		} else {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					thread: { id: "thread-stub" },
					messages: [],
					headMessageId: null,
					nextMessagesCursor: null,
				}),
			});
		}
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

async function mockAppShellEndpoints(page: Page): Promise<void> {
	await page.route("**/api/threads?**participant_id=**", async (route: Route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ threads: [], nextCursor: null }),
		});
	});

	await page.route("**/api/teams**", async (route: Route) => {
		const url = route.request().url();
		// Match /api/teams list endpoint (not a team detail like /api/teams/:id)
		if (url.match(/\/api\/teams\/?(\?|$)/)) {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ teams: [] }),
			});
			return;
		}

		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({
				product: {
					id: "prod-stub",
					name: "Stub Product",
					status: "active",
					phase: "build",
					leadAgentId: null,
					activeBets: 0,
					shipped: 0,
					shipRate: "0%",
					progress: { done: 0, total: 0 },
				},
				roster: [],
				burn: { activeBets: 0, capacity: 3 },
				activeBets: [],
			}),
		});
	});
}

test.describe("L12 — Artifact surfaces on Work pages", () => {
	test.beforeEach(async ({ page }) => {
		await mockAppShellEndpoints(page);
	});

	// ── WorkPortfolio ─────────────────────────────────────────────────────────

	test("WorkPortfolio: ArtifactGalleryCard renders when artifacts exist", async ({ page }) => {
		await mockArtifactsOnPage(page, ARTIFACT_PAGE_RESPONSE);
		await page.goto("/work/portfolio");
		await page.waitForSelector("[data-testid='work-portfolio-page']");

		// ArtifactSection renders gallery cards
		await expect(page.locator("[data-ds-component='ArtifactGalleryCard']").first()).toBeVisible();
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

	test("WorkPortfolio: 'View all' is a non-interactive span when nextCursor exists", async ({
		page,
	}) => {
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
		await page.route("**/api/teams/**", async (route: Route) => {
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
					},
					team: { id: "team-e2e", formedAt: "2024-01-01T00:00:00Z", dissolvedAt: null },
					roster: [],
					burn: { activeBets: 0, capacity: 3 },
					activeBets: [],
				}),
			});
		});
		await mockArtifactsOnPage(page, ARTIFACT_PAGE_RESPONSE);

		await page.goto("/work/team/prod-e2e");
		await page.waitForSelector("[data-testid='work-team-page']");

		await expect(page.locator("[data-ds-component='ArtifactStackItem']").first()).toBeVisible();
	});

	// ── WorkBet ───────────────────────────────────────────────────────────────

	test("WorkBet: ArtifactStackItem renders when artifacts exist", async ({ page }) => {
		await page.route("**/api/bets/bet-e2e/artifact-thread-summary", async (route: Route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ summaries: [], totalCount: 0, truncated: false }),
			});
		});
		await page.route("**/api/bets/bet-e2e", async (route: Route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					id: "bet-e2e",
					title: "E2E Test Bet",
					product: "E2E Product",
					team: "E2E Team",
					status: "committed",
					tokensActual: null,
					progress: { done: 1, total: 3 },
					description: "# Problem\nTest.",
					tasks: [],
				}),
			});
		});
		await mockThreadEndpoints(page);
		await mockArtifactsOnPage(page, ARTIFACT_PAGE_RESPONSE);

		await page.goto("/work/bet/bet-e2e");
		await page.waitForSelector("[data-testid='work-bet-page']");

		await expect(page.locator("[data-ds-component='ArtifactStackItem']").first()).toBeVisible();
	});

	test("WorkBet: ArtifactSection appears BEFORE thread section in DOM", async ({ page }) => {
		const ORDER_BET_ID = "bet-e2e-order";
		const ORDER_THREAD_ID = "thread-order-1";
		await page.route(`**/bets/${ORDER_BET_ID}/artifact-thread-summary`, async (route: Route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ summaries: [], totalCount: 0, truncated: false }),
			});
		});
		await page.route(`**/bets/${ORDER_BET_ID}`, async (route: Route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					id: ORDER_BET_ID,
					title: "Order Test Bet",
					product: "E2E Product",
					team: "E2E Team",
					status: "committed",
					tokensActual: null,
					progress: { done: 0, total: 1 },
					description: "# Problem\nTest order.",
					tasks: [],
				}),
			});
		});
		// Thread mocks must return a real thread so HostThreadSection renders
		await page.route(`**/threads?**host_kind=bet**`, async (route: Route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					threads: [
						{
							id: ORDER_THREAD_ID,
							hostKind: "bet",
							hostId: ORDER_BET_ID,
							hasUnresolvedReview: false,
						},
					],
					nextCursor: null,
				}),
			});
		});
		await page.route(`**/threads/${ORDER_THREAD_ID}`, async (route: Route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					thread: { id: ORDER_THREAD_ID, hostKind: "bet", hostId: ORDER_BET_ID },
					messages: [],
					headMessageId: null,
					nextMessagesCursor: null,
				}),
			});
		});
		// Catch-all for remaining thread requests (e.g. conversations sidebar)
		await page.route("**/api/threads**", async (route: Route) => {
			const url = route.request().url();
			if (url.includes("?")) {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({ threads: [], nextCursor: null }),
				});
			} else {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({
						thread: { id: "stub", hostKind: "bet", hostId: ORDER_BET_ID },
						messages: [],
						headMessageId: null,
						nextMessagesCursor: null,
					}),
				});
			}
		});
		await mockArtifactsOnPage(page, ARTIFACT_PAGE_RESPONSE);

		await page.goto(`/work/bet/${ORDER_BET_ID}`);
		await page.waitForSelector("[data-testid='work-bet-page']");

		// Verify ArtifactSection and thread section both render
		const artifactSectionEl = page.locator("[data-testid='artifact-section-container']");
		const threadSection = page.locator("[data-testid='host-thread-section']");

		await expect(artifactSectionEl).toBeVisible();
		await expect(threadSection.first()).toBeVisible();

		// Verify ArtifactSection appears BEFORE thread section in DOM order
		const artifactBeforeThread = await page.evaluate(() => {
			const artifact = document.querySelector("[data-testid='artifact-section-container']");
			const thread = document.querySelector("[data-testid='host-thread-section']");
			if (!(artifact && thread)) return false;
			// compareDocumentPosition bit 4 = DOCUMENT_POSITION_FOLLOWING
			return (artifact.compareDocumentPosition(thread) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
		});
		expect(artifactBeforeThread).toBe(true);
	});

	// ── Click-through: Portfolio → ArtifactPreview ────────────────────────────

	test("WorkPortfolio: clicking ArtifactGalleryCard navigates to /artifacts/:id and shows ArtifactPreview", async ({
		page,
	}) => {
		// Mock artifact list for portfolio
		await mockArtifactsOnPage(page, ARTIFACT_PAGE_RESPONSE);

		// Mock the individual artifact endpoint (ArtifactPermalink calls /api/artifacts/:id)
		await page.route("**/api/artifacts/art-e2e-l12-1", async (route: Route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(ARTIFACT_FIXTURES[0]),
			});
		});

		// Mock artifact thread summaries (ArtifactPermalink includes HostThreadSection)
		await page.route("**/api/artifact-thread-summaries?**", async (route: Route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ summaries: [], totalCount: 0, truncated: false }),
			});
		});
		await mockThreadEndpoints(page);

		await page.goto("/work/portfolio");
		await page.waitForSelector("[data-testid='work-portfolio-page']");

		// Wait for the gallery card to appear (below the cycle-stripe per W-1 fix)
		const firstCard = page.locator("[data-ds-component='ArtifactGalleryCard']").first();
		await expect(firstCard).toBeVisible();

		// Click the first gallery card
		await firstCard.click();

		// Assert URL changed to /artifacts/:id
		await page.waitForURL("**/artifacts/art-e2e-l12-1");
		expect(page.url()).toContain("/artifacts/art-e2e-l12-1");

		// Assert ArtifactPreview is visible on the permalink page
		await expect(page.locator("[data-ds-component='ArtifactPreview']").first()).toBeVisible();
	});

	// ── TaskSheet ─────────────────────────────────────────────────────────────

	test("TaskSheet: ArtifactPreview renders when task has artifacts", async ({ page }) => {
		await page.route("**/api/bets/bet-ts-e2e/artifact-thread-summary", async (route: Route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ summaries: [], totalCount: 0, truncated: false }),
			});
		});
		await page.route("**/api/bets/bet-ts-e2e", async (route: Route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					id: "bet-ts-e2e",
					title: "Task Sheet Bet",
					product: "TS Product",
					team: "TS Team",
					status: "committed",
					tokensActual: null,
					progress: { done: 0, total: 1 },
					description: "# Test",
					tasks: [
						{
							id: "task-ts-1",
							betId: "bet-ts-e2e",
							title: "Task for sheet",
							state: "in_progress",
							ownerAgentId: "agent-dev-1",
							latestSessionOutcome: null,
							latestSessionTokensInput: null,
							latestSessionTokensOutput: null,
							latestSessionHarnessUrl: null,
						},
					],
				}),
			});
		});
		await mockThreadEndpoints(page);
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
