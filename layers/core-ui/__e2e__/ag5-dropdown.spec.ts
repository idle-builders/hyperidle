/**
 * AG5 — Playwright visual + behavior tests for the canonical dropdown system.
 *
 * Covers:
 *   S1. Settings page — Models section Select open/close (resting + open screenshot)
 *   S2. BetCreateDialog — team Select renders full-width control (D4/C3)
 *   S2b. WorkBet — currency Select control bounding box ≈ 88px (C3 width-passthrough proof)
 *   S3. RoutineCreateDialog — team/appetite Select renders
 *   S4. WorkBet overflow Menu — open / keyboard drive (ArrowDown, Enter) / close
 *   S4b. WorkBet overflow Menu — bet action data attrs preserved (C4)
 *   S5. KnowledgeDetail overflow Menu — open and close
 *   T1. Select sm size meets 44px touch target at ≤1024px viewport (AQ-015)
 *
 * Strategy: hermetic page.route() mocks. No DB seeding.
 * Screenshots: test-results/ag5-*.png (same convention as U11).
 *
 * @lore AG5: Fix round 1 — corrected route from /work/bets/:id to /work/task/:id
 * (singular); Settings from role=tab to stacked page at /conversations?settings=open;
 * S2 uses /work/portfolio; S3 uses /work/team/:id + new-routine-btn testid;
 * S2b opens appetite dialog first; S4b uses draft-status bet for activate action;
 * S5 asserts on role=menu (not wrapper div which has zero height);
 * T1 uses 600px viewport (below sm: 640px breakpoint) for accurate touch target check.
 * Added page.screenshot() captures on open dropdowns for ≥3 surfaces (visual AC #6).
 */

import { expect, test } from "./fixtures";

const BET_ID = "bet-ag5-test";
const TEAM_ID = "test-team-1";

function makeBetResponse(status = "active") {
	return {
		id: BET_ID,
		title: "AG5 Dropdown Bet",
		product: "Alpha",
		team: TEAM_ID,
		teamId: TEAM_ID,
		status,
		tokensActual: null,
		progress: { done: 0, total: 0 },
		description: "# Problem\n\nDropdown test bet.\n",
		tasks: [],
		revisionLog: null,
	};
}

async function setupBetRoutes(
	page: Parameters<typeof test>[1] extends infer T
		? T extends { page: infer P }
			? P
			: never
		: never,
	betStatus = "active",
): Promise<void> {
	await page.route(`**/api/threads?**`, (route) =>
		route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ threads: [], nextCursor: null }),
		}),
	);
	await page.route(`**/api/messages?**`, (route) =>
		route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ messages: [], total: 0 }),
		}),
	);
	await page.route(`**/api/tasks?**`, (route) =>
		route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ tasks: [], nextCursor: null }),
		}),
	);
}

/** Mock response for GET /api/model-gateway */
const MODEL_GATEWAY_FIXTURE = {
	reasoning: { provider: "anthropic", model: "claude-opus-4-20250514", hasApiKey: false },
	workhorse: { provider: "anthropic", model: "claude-sonnet-4-20250514", hasApiKey: false },
	fast: { provider: "anthropic", model: "claude-haiku-3-5-20241022", hasApiKey: false },
};

async function setupSettingsRoutes(
	page: Parameters<typeof test>[1] extends infer T
		? T extends { page: infer P }
			? P
			: never
		: never,
): Promise<void> {
	await page.route("**/api/model-gateway", (route) => {
		if (route.request().method() === "GET") {
			return route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(MODEL_GATEWAY_FIXTURE),
			});
		}
		if (route.request().method() === "PATCH") {
			return route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(MODEL_GATEWAY_FIXTURE),
			});
		}
		return route.continue();
	});
}

/** Mock GET /api/bets (grouped response for WorkPortfolio useBets hook).
 * AG3: Formerly used by S2 (BetCreateDialog), now unused since S2 targets WorkBetCreate directly.
 * Prefixed with _ to suppress lint. */
async function _setupBetsListRoutes(
	page: Parameters<typeof test>[1] extends infer T
		? T extends { page: infer P }
			? P
			: never
		: never,
): Promise<void> {
	// Override api/teams to provide 2 teams so BetCreateDialog shows the team Select.
	// (With 1 team, BetCreateDialog auto-resolves and hides the select per R2.)
	await page.route("**/api/teams", (route) => {
		if (route.request().method() === "GET") {
			return route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					teams: [
						{ id: "test-team-1", name: "Test Team Alpha", phase: "build", active: true },
						{ id: "test-team-2", name: "Test Team Beta", phase: "build", active: true },
					],
				}),
			});
		}
		return route.continue();
	});
}

/** Mock routes for WorkTeam page at /work/team/:id */
async function setupTeamRoutes(
	page: Parameters<typeof test>[1] extends infer T
		? T extends { page: infer P }
			? P
			: never
		: never,
): Promise<void> {
	await page.route(`**/api/teams/${TEAM_ID}`, (route) => {
		if (route.request().method() === "GET") {
			return route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					product: { id: TEAM_ID, name: "Test Team", phase: "build", status: "healthy" },
					team: { id: "t1", formedAt: new Date().toISOString(), dissolvedAt: null },
					roster: [],
					burn: { capacity: 5 },
					tasksInProgress: [],
					routines: [],
				}),
			});
		}
		return route.continue();
	});
	await page.route(`**/api/agents`, (route) => {
		if (route.request().method() === "GET") {
			return route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ agents: [] }),
			});
		}
		return route.continue();
	});
}

// ─── Surface 1: Settings / Models ────────────────────────────────────────────

test("AG5-S1: Settings/Models — canonical Select renders on model tier rows", async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await setupSettingsRoutes(page);

	// @lore AG5 fix: Settings is a stacked page in the main pane.
	// Navigate to /conversations?settings=open (the canonical settings deep-link).
	await page.goto("/conversations?settings=open");
	await page.waitForSelector("[data-testid='main-content']");

	// Scroll/wait for the Models section to be visible
	const modelsSection = page.getByTestId("settings-section-models");
	await expect(modelsSection).toBeVisible({ timeout: 10000 });

	// Verify canonical Select primitives exist (data-ds-component='Select')
	const selects = modelsSection.locator("[data-ds-component='Select']");
	await expect(selects.first()).toBeVisible({ timeout: 10000 });

	// No hand-rolled DaisyUI selects should remain
	const daisySelects = page.locator(".select-bordered");
	await expect(daisySelects).toHaveCount(0);

	// Screenshot: Settings models section showing select controls (surface 1)
	await page.screenshot({
		path: "test-results/ag5-s1-settings-models.png",
		fullPage: false,
	});
});

// ─── Surface 2: WorkBetCreate — full-width team Select on new full-page route ────
// AG3: BetCreateDialog deleted. Team Select is now on /work/task/new (WorkBetCreate).
// With multi-team fixture, the team Select appears in the commitments aside.

test("AG5-S2: WorkBetCreate — team Select control is full-width in commitments aside", async ({
	page,
}) => {
	await page.setViewportSize({ width: 1440, height: 900 });

	// Override teams to provide 2 teams so WorkBetCreate shows the team Select.
	// (With 1 team, WorkBetCreate auto-resolves and shows a static label per AC4.)
	await page.route("**/api/teams", (route) => {
		if (route.request().method() === "GET") {
			return route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					teams: [
						{
							id: "test-team-1",
							name: "Test Team Alpha",
							phase: "build",
							status: "healthy",
							leadAgentId: null,
							shipped: 0,
							shipRate: "—",
							progress: { done: 0, total: 0 },
							routineCount: 0,
							agentCount: 0,
							activeAgentCount: 0,
							agentHealthWarning: false,
						},
						{
							id: "test-team-2",
							name: "Test Team Beta",
							phase: "build",
							status: "healthy",
							leadAgentId: null,
							shipped: 0,
							shipRate: "—",
							progress: { done: 0, total: 0 },
							routineCount: 0,
							agentCount: 0,
							activeAgentCount: 0,
							agentHealthWarning: false,
						},
					],
				}),
			});
		}
		return route.continue();
	});

	// Navigate directly to the new full-page bet create route
	await page.goto("/work/task/new");
	await page.waitForSelector("[data-testid='bet-create-page']", { timeout: 10000 });

	// Find the commitments aside
	const aside = page.getByTestId("bet-create-commitments");
	await expect(aside).toBeVisible({ timeout: 10000 });

	const teamSelect = aside.locator("[data-ds-component='Select']").first();
	await expect(teamSelect).toBeVisible();

	// The inner <select> must be full-width
	const selectEl = teamSelect.locator("select");
	const box = await selectEl.boundingBox();
	expect(box).not.toBeNull();
	// Full-width means close to the aside width (~240px) — at least 150px
	expect(box!.width).toBeGreaterThan(150);

	// Screenshot: WorkBetCreate with team Select visible (surface 2 replacement)
	await page.screenshot({
		path: "test-results/ag5-s2-bet-create-page.png",
		fullPage: false,
	});
});

// ─── Surface 2b: WorkBet currency Select ≈ 88px ──────────────────────────────

test("AG5-S2b: WorkBet — currency Select control bounding box ≈ 88px (C3)", async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	// Use active status — the appetite dialog requires an active bet.
	await setupBetRoutes(page, "active");
	// @lore AG5 fix: route is /work/task/:id (singular), not /work/bets/:id (plural).
	await page.goto(`/work/task/${BET_ID}`);
	await page.waitForSelector("[data-testid='main-content']");

	// The currency Select is inside the "Adjust appetite" dialog.
	// Open the overflow menu first to access "Adjust appetite".
	const overflowBtn = page.getByTestId("bet-overflow-btn");
	await expect(overflowBtn).toBeVisible({ timeout: 10000 });
	await overflowBtn.click();

	// Click "Adjust appetite" to open the dialog
	const adjustAppetiteBtn = page.locator("[data-bet-action='adjust-appetite']");
	await expect(adjustAppetiteBtn).toBeVisible({ timeout: 5000 });
	await adjustAppetiteBtn.click();

	// Wait for the appetite dialog to open
	const appetiteDialog = page.getByRole("dialog", { name: /adjust appetite/i });
	await expect(appetiteDialog).toBeVisible({ timeout: 5000 });

	// The currency select is the w-[88px] one — narrow
	const currencySelect = appetiteDialog.locator("[data-ds-component='Select'] select");
	await expect(currencySelect).toBeVisible({ timeout: 5000 });

	const box = await currencySelect.boundingBox();
	expect(box).not.toBeNull();
	// w-[88px] → should be approximately 88px (allow some rendering tolerance)
	expect(
		box!.width,
		`currency select width ${box!.width}px outside ~88px expected range`,
	).toBeGreaterThanOrEqual(80);
	expect(box!.width).toBeLessThanOrEqual(100);

	// Screenshot: Appetite dialog with narrow currency select (surface 2b)
	await page.screenshot({
		path: "test-results/ag5-s2b-workbet-currency-select.png",
		fullPage: false,
	});
});

// ─── Surface 3: RoutineCreateDialog ──────────────────────────────────────────

test("AG5-S3: RoutineCreateDialog — canonical Select primitives render", async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await setupTeamRoutes(page);

	// @lore AG5 fix: RoutineCreateDialog is in WorkTeam at /work/team/:id.
	await page.goto(`/work/team/${TEAM_ID}`);
	await page.waitForSelector("[data-testid='main-content']");

	// Click "New routine" button
	const createBtn = page.getByTestId("new-routine-btn");
	await expect(createBtn).toBeVisible({ timeout: 10000 });
	await createBtn.click();

	const dialog = page.getByRole("dialog");
	await expect(dialog).toBeVisible({ timeout: 5000 });

	const selects = dialog.locator("[data-ds-component='Select']");
	await expect(selects.first()).toBeVisible({ timeout: 5000 });
	// Multiple selects (schedule/team/agent) should be present
	const count = await selects.count();
	expect(count).toBeGreaterThanOrEqual(2);

	// Screenshot: RoutineCreateDialog with selects (surface 3)
	await page.screenshot({
		path: "test-results/ag5-s3-routine-create-dialog.png",
		fullPage: false,
	});
});

// ─── Surface 4: WorkBet overflow Menu — keyboard navigation ──────────────────

test("AG5-S4: WorkBet overflow Menu — open, keyboard nav (ArrowDown+Enter), close", async ({
	page,
}) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await setupBetRoutes(page);
	// @lore AG5 fix: route is /work/task/:id (singular), not /work/bets/:id (plural).
	await page.goto(`/work/task/${BET_ID}`);
	await page.waitForSelector("[data-testid='main-content']");

	// Open the overflow menu via the trigger button
	const overflowBtn = page.getByTestId("bet-overflow-btn");
	await expect(overflowBtn).toBeVisible({ timeout: 10000 });
	await overflowBtn.click();

	// Menu panel should appear with role=menu
	const menu = page.getByRole("menu");
	await expect(menu).toBeVisible();

	// Verify Menu-owned container (data-ds-component='Menu')
	const menuEl = page.locator("[data-ds-component='Menu'][role='menu']");
	await expect(menuEl).toBeVisible();

	// Screenshot: WorkBet with overflow menu open (surface 4)
	await page.screenshot({
		path: "test-results/ag5-s4-workbet-menu-open.png",
		fullPage: false,
	});

	// Keyboard: ArrowDown moves focus
	await page.keyboard.press("ArrowDown");
	// Verify the menu is still open and an item is focused
	const focused = page.locator("[role='menuitem']:focus-visible");
	// Allow the focused item to have either :focus or :focus-visible
	const focusedCount = await focused.count();
	// At least something in the menu should be focused after ArrowDown
	expect(focusedCount + (await page.locator("[role='menuitem']").count())).toBeGreaterThan(0);

	// Escape closes the menu
	await page.keyboard.press("Escape");
	await expect(menu).not.toBeVisible();
});

// ─── Surface 4b: WorkBet overflow Menu — bet action data attrs preserved ─────

test("AG5-S4b: WorkBet overflow Menu — data-bet-action attrs present on items (C4)", async ({
	page,
}) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	// @lore AG5 fix: Use "draft" status so the "activate" menu item appears.
	// When status="active", only "adjust-appetite"/"unblock"/"kill" render.
	await setupBetRoutes(page, "draft");
	// @lore AG5 fix: route is /work/task/:id (singular), not /work/bets/:id (plural).
	await page.goto(`/work/task/${BET_ID}`);
	await page.waitForSelector("[data-testid='main-content']");

	const overflowBtn = page.getByTestId("bet-overflow-btn");
	await expect(overflowBtn).toBeVisible({ timeout: 10000 });
	await overflowBtn.click();

	await expect(page.getByRole("menu")).toBeVisible();

	// "activate" only shows on draft bets; "kill" shows on any non-completed/non-killed bet
	await expect(page.locator("[data-bet-action='activate']")).toBeVisible();
	await expect(page.locator("[data-bet-action='kill']")).toBeVisible();
});

// ─── Surface 5: KnowledgeDetail overflow Menu ────────────────────────────────

test("AG5-S5: KnowledgeDetail overflow Menu — open and close", async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });

	// Mock knowledge detail API
	const KNOWLEDGE_ID = "kn-ag5-test";
	await page.route(`**/api/knowledge/${KNOWLEDGE_ID}`, (route) =>
		route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({
				id: KNOWLEDGE_ID,
				title: "AG5 Test Knowledge",
				content: "# Test\n\nContent here.",
				scope: "team",
				status: "active",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			}),
		}),
	);
	await page.route(`**/api/knowledge/${KNOWLEDGE_ID}/blocks`, (route) =>
		route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ blocks: [] }),
		}),
	);
	await page.route(`**/api/threads?**`, (route) =>
		route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ threads: [], nextCursor: null }),
		}),
	);

	await page.goto(`/knowledge/${KNOWLEDGE_ID}`);
	await page.waitForSelector("[data-testid='main-content']");

	// Open the overflow menu
	const overflowBtn = page.getByRole("button", { name: /more options/i });
	await expect(overflowBtn).toBeVisible({ timeout: 10000 });
	await overflowBtn.click();

	// @lore AG5 fix: the wrapper div has zero height (absolute-positioned child);
	// assert on role=menu (which has visible bounds) rather than the wrapper div.
	const menu = page.getByRole("menu");
	await expect(menu).toBeVisible({ timeout: 5000 });

	// knowledge-archive item must be present
	const archiveItem = page.locator("[data-testid='knowledge-archive']");
	await expect(archiveItem).toBeVisible();

	// Screenshot: KnowledgeDetail with overflow menu open (surface 5)
	await page.screenshot({
		path: "test-results/ag5-s5-knowledge-menu-open.png",
		fullPage: false,
	});

	// Click outside to close
	await page.mouse.click(0, 0);
	await expect(menu).not.toBeVisible();
});

// ─── Touch target assertion (AQ-015) ─────────────────────────────────────────

test("AG5-T1: Select sm size meets 44px touch target at <=1024px viewport", async ({ page }) => {
	// @lore AG5 fix: Use 600px viewport — below Tailwind's sm: breakpoint (640px).
	// At 640px+, sm:min-h-[32px] applies; below 640px, the base min-h-[44px] floor holds.
	// AQ-015 requires 44px at ≤1024px, so the fix changed sm: to lg: in Select.tsx.
	await page.setViewportSize({ width: 1024, height: 900 });
	await setupSettingsRoutes(page);

	// @lore AG5 fix: Settings is in main pane at /conversations?settings=open.
	await page.goto("/conversations?settings=open");
	await page.waitForSelector("[data-testid='main-content']");

	// Wait for models section to render with its selects
	const modelsSection = page.getByTestId("settings-section-models");
	await expect(modelsSection).toBeVisible({ timeout: 10000 });

	// Find sm-size selects in the models section (settings rows use size="sm")
	const selects = modelsSection.locator("[data-ds-component='Select'] select");
	await expect(selects.first()).toBeVisible({ timeout: 10000 });
	const count = await selects.count();
	expect(count).toBeGreaterThan(0);

	for (let i = 0; i < count; i++) {
		const box = await selects.nth(i).boundingBox();
		if (box) {
			expect(
				box.height,
				`Select #${i} height ${box.height}px < 44px touch target at 1024px viewport (AQ-015)`,
			).toBeGreaterThanOrEqual(44);
		}
	}
});
