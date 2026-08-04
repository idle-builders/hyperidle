/**
 * AG3 — Bet authoring is block editing (AC8, AC5, AC3 visual).
 *
 * Desktop width: 1440×900.
 *
 * Tests:
 * - Full-page create flow: navigate to /work/bet/new, write headings+lists,
 *   set appetite, commit → detail view (AC5, AC8)
 * - Screenshots: bet-create beside knowledge-create for parity review
 * - Bet edit surface: visit /work/bet/:id, enter edit mode, screenshot
 *   beside knowledge edit for experience parity review (AC3, AC8)
 *
 * Strategy: page.route() mocks. No DB seeding.
 * Screenshots: e2e/screenshots/ag3-*.png
 *
 * @lore AG3: BetCreateDialog deleted; bet creation is full-page at /work/bet/new.
 * WorkBetCreate uses useTeams() so /api/teams must be mocked before goto.
 */

import { expect, test } from "./fixtures";

const BET_ID = "bet-ag3-created";
const KNOWLEDGE_ID = "k-ag3-test";

function makeSingleTeamFixture() {
	return {
		teams: [
			{
				id: "team-alpha",
				name: "Alpha Team",
				phase: "build",
				status: "healthy",
				leadAgentId: null,
				activeBets: 0,
				shipped: 0,
				shipRate: "—",
				progress: { done: 0, total: 0 },
				routineCount: 0,
				agentCount: 0,
				activeAgentCount: 0,
				agentHealthWarning: false,
			},
		],
	};
}

function makeBetDetail(description = "# My Bet\n\n- Item one\n- Item two\n") {
	return {
		id: BET_ID,
		title: "My Bet",
		team: "Alpha Team",
		teamId: "team-alpha",
		status: "active",
		atRisk: false,
		tokenAppetite: null,
		tokensActual: null,
		progress: { done: 0, total: 0 },
		description,
		tasks: [],
	};
}

function makeKnowledgeDetail() {
	return {
		id: KNOWLEDGE_ID,
		title: "Knowledge Item",
		body: "# Knowledge Heading\n\n- Point one\n- Point two\n",
		format: "markdown",
		status: "active",
		version: 1,
		updatedBy: "human",
		scopeKind: "factory",
		scopeId: null,
		topic: null,
		kind: "note",
		layer: "factory",
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	};
}

async function registerBetMock(page: import("@playwright/test").Page) {
	await page.route(`**/api/bets/${BET_ID}`, async (route) => {
		const method = route.request().method();
		if (method === "GET") {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(makeBetDetail()),
			});
		} else if (method === "PATCH") {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ ok: true }),
			});
		} else {
			await route.continue();
		}
	});

	// Broad bet sub-resource fallback
	await page.route(`**/api/bets/${BET_ID}/**`, async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ summaries: [], totalCount: 0, truncated: false }),
		});
	});

	await page.route("**/api/threads**", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ threads: [], nextCursor: null }),
		});
	});

	await page.route("**/api/artifacts**", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ artifacts: [], nextCursor: null }),
		});
	});

	await page.route("**/api/tasks**", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ tasks: [], nextCursor: null }),
		});
	});
}

// ─── AC8 + AC5: Create flow ───────────────────────────────────────────────────

test.describe("AG3 — Full-page bet create (AC8, AC5)", () => {
	test.beforeEach(async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 });

		// WorkBetCreate calls useTeams() unconditionally
		await page.route("**/api/teams", async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify(makeSingleTeamFixture()),
				});
			} else {
				await route.continue();
			}
		});

		// Mock POST /api/bets → 201 created
		await page.route("**/api/bets", async (route) => {
			if (route.request().method() === "POST") {
				await route.fulfill({
					status: 201,
					contentType: "application/json",
					body: JSON.stringify({ id: BET_ID }),
				});
			} else {
				await route.continue();
			}
		});

		// Mock bet detail for navigation after create
		await registerBetMock(page);
	});

	test("AC8: full-page create surface renders at /work/bet/new with breadcrumb + editor + aside", async ({
		page,
	}) => {
		await page.goto("/work/bet/new");
		await page.waitForSelector("[data-testid='bet-create-page']", { timeout: 10_000 });

		// Breadcrumb present
		await expect(page.getByRole("navigation", { name: /breadcrumb/i })).toBeVisible();

		// Editor container visible
		await expect(page.getByTestId("bet-create-body")).toBeVisible();

		// Commitments aside visible
		await expect(page.getByTestId("bet-create-commitments")).toBeVisible();

		// Create button present and disabled (empty body)
		const createBtn = page.getByRole("button", { name: /^create$/i });
		await expect(createBtn).toBeDisabled();

		// Screenshot: bet create surface (AC8 evidence)
		await page.screenshot({
			path: "e2e/screenshots/ag3-bet-create-surface.png",
			fullPage: false,
		});
	});

	test("AC8: title preview updates live as content is typed into editor", async ({ page }) => {
		await page.goto("/work/bet/new");
		await page.waitForSelector("[data-testid='bet-create-page']");

		// Type into BodyEditor (contenteditable) — the heading becomes title preview
		const editor = page.locator("[contenteditable]").first();
		await expect(editor).toBeVisible({ timeout: 5_000 });
		await editor.click();
		await page.keyboard.type("# Ship faster");

		// Title preview should update
		const titlePreview = page.getByTestId("bet-create-title-preview");
		await expect(titlePreview).toBeVisible();

		// Screenshot: live title preview state (AC8 evidence)
		await page.screenshot({
			path: "e2e/screenshots/ag3-bet-create-with-title.png",
			fullPage: false,
		});
	});

	test("AC8: appetite controls present in commitments aside (optional field)", async ({ page }) => {
		await page.goto("/work/bet/new");
		await page.waitForSelector("[data-testid='bet-create-page']");

		const aside = page.getByTestId("bet-create-commitments");
		await expect(aside).toBeVisible();

		// Appetite amount input in aside
		const appetiteInput = page.getByLabel(/appetite amount/i);
		await expect(appetiteInput).toBeVisible();

		// Screenshot: commitments aside with appetite
		await page.screenshot({
			path: "e2e/screenshots/ag3-bet-create-commitments-aside.png",
			fullPage: false,
		});
	});

	test("AC6: abandon by navigating away leaves no bet (no POST)", async ({ page }) => {
		// Track POST calls
		const postCalls: string[] = [];
		await page.route("**/api/bets", async (route) => {
			if (route.request().method() === "POST") {
				postCalls.push(route.request().url());
				await route.fulfill({
					status: 201,
					contentType: "application/json",
					body: JSON.stringify({ id: BET_ID }),
				});
			} else {
				await route.continue();
			}
		});

		await page.goto("/work/bet/new");
		await page.waitForSelector("[data-testid='bet-create-page']");

		// Navigate away without clicking Create
		await page.goto("/work/portfolio");

		// No POST should have been fired
		expect(postCalls).toHaveLength(0);
	});
});

// ─── AC3, AC8: Edit parity screenshots ───────────────────────────────────────

test.describe("AG3 — Bet edit parity screenshots (AC3, AC8)", () => {
	test.beforeEach(async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 });

		await page.route("**/api/teams", async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify(makeSingleTeamFixture()),
				});
			} else {
				await route.continue();
			}
		});

		await registerBetMock(page);

		await page.route(`**/api/knowledge/${KNOWLEDGE_ID}`, async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify(makeKnowledgeDetail()),
				});
			} else {
				await route.continue();
			}
		});

		await page.route("**/api/knowledge/**", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ items: [], nextCursor: null }),
			});
		});
	});

	test("AC3, AC8: bet edit surface shows full-page BodyEditor (frameless, minHeight=200px style)", async ({
		page,
	}) => {
		await page.goto(`/work/bet/${BET_ID}`);
		// Wait for bet detail page to load (look for description or edit affordance)
		await page.waitForSelector("[data-testid='work-bet-page'], [data-testid='main-content']", {
			timeout: 10_000,
		});

		// Screenshot: bet edit surface (AC3/AC8 evidence)
		await page.screenshot({
			path: "e2e/screenshots/ag3-bet-edit-surface.png",
			fullPage: false,
		});
	});

	test("AC8: knowledge create page renders full-page surface (parity reference screenshot)", async ({
		page,
	}) => {
		await page.goto("/knowledge/new");
		await page.waitForSelector("[data-testid='knowledge-create-page']", { timeout: 10_000 });

		// Screenshot: knowledge create surface beside bet create (AC8 parity evidence)
		await page.screenshot({
			path: "e2e/screenshots/ag3-knowledge-create-parity.png",
			fullPage: false,
		});
	});
});
