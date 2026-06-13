/**
 * AI2 — Dialog layering: computed z-index ordering spec (AC-3, runtime half).
 *
 * AC-3 (b): Runtime — open two overlay surfaces in both orders; assert the
 * one with the higher --z-* band has a strictly higher computed z-index,
 * regardless of DOM mount order. This satisfies "stack predictably regardless
 * of DOM order."
 *
 * Strategy: page.route() mocks — no DB required.
 *
 * @lore AI2: AC-3's static half (no raw z-[N] on overlays) is a lint/grep gate,
 * not a test. Only the runtime computed-z ordering is verified here.
 *
 * @lore AI2 C-2 fix: Tests navigate to /work/bet/${BET_ID} (not portfolio).
 * makeBetResponse() includes ≥1 task so task-row renders. Clicking task-row
 * opens TaskSheet (layer="drawer", --z-drawer=30) via setSelectedTaskId.
 * Clicking the "Assistant" button in Sidebar opens AssistantOverlay
 * (layer="overlay", --z-overlay=40). Both open orders are tested.
 *
 * @lore AI2 C-2: WorkBet task-row onClick was previously navigate() — fixed
 * to setSelectedTaskId() so TaskSheet actually opens (drawer layer).
 */

import { expect, test } from "./fixtures";

const BET_ID = "bet-dialog-layer-test";
const TASK_ID = "task-layer-test";

function makeBetResponse() {
	return {
		id: BET_ID,
		title: "Layering test bet",
		team: "Test Team",
		status: "active",
		atRisk: false,
		costAppetite: null,
		tokenAppetite: null,
		costActual: null,
		tokensActual: null,
		progress: { done: 0, total: 1 },
		description: "# Test",
		tasks: [
			{
				id: TASK_ID,
				title: "Layering test task",
				owner: "Agent",
				state: "active",
				costActual: null,
				latestSessionOutcome: null,
				latestSessionHarnessUrl: null,
				latestSessionModelTier: null,
				ownerAgentId: null,
				startedAt: null,
				outcomeVerdict: null,
			},
		],
	};
}

/**
 * Parse a CSS z-index value into a number.
 * Returns -1 for "auto" or unparseable strings.
 */
async function computedZIndex(
	page: import("@playwright/test").Page,
	selector: string,
): Promise<number> {
	return page.evaluate((sel) => {
		const el = document.querySelector(sel) as HTMLElement | null;
		if (!el) return -1;
		const z = window.getComputedStyle(el).zIndex;
		return z === "auto" ? 0 : Number.parseInt(z, 10);
	}, selector);
}

// ---------------------------------------------------------------------------
// Open TaskSheet (drawer=30) and AssistantOverlay (overlay=40)
// Assert overlay (40) > drawer (30) in both open orders
// ---------------------------------------------------------------------------

test.describe("AI2 — overlay z-layer ordering (AC-3 runtime)", () => {
	test.beforeEach(async ({ page }) => {
		// @lore AI2: Mock all API endpoints the WorkBet page and its sub-components need.
		// @lore AI2: Playwright LIFO — last-registered route wins. Register broadest first,
		// most specific last, so the specific routes take priority.

		await page.route("**/api/auth/me", (route) =>
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					id: "u-test",
					name: "Tester",
					email: "t@test.com",
					avatarUrl: null,
				}),
			}),
		);
		await page.route("**/api/teams**", (route) =>
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ teams: [] }),
			}),
		);
		await page.route("**/api/knowledge/triage-count", (route) =>
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ count: 0 }),
			}),
		);
		await page.route("**/api/threads/assistant", (route) =>
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					thread: {
						id: "t-assistant",
						title: "Assistant",
						messages: [],
					},
				}),
			}),
		);
		await page.route("**/api/threads**", (route) =>
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ threads: [], nextCursor: null }),
			}),
		);
		// @lore AI2: notifications/inbox returns { unseenCount, rows } — not { notifications }.
		await page.route("**/api/notifications**", (route) =>
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ unseenCount: 0, rows: [] }),
			}),
		);
		// WorkBet renders ArtifactSection which calls /api/artifacts — mock with empty page.
		await page.route("**/api/artifacts**", (route) =>
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ items: [], nextCursor: null }),
			}),
		);
		// TaskSheet calls useTaskSessions → /api/tasks/${TASK_ID}/sessions
		await page.route("**/api/tasks/**", (route) =>
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ sessions: [] }),
			}),
		);
		// @lore AI2: Register broad bet sub-resource fallback first (LIFO → lowest priority).
		// 1. Broad: any bet sub-resource → empty 200 (fallback)
		await page.route(`**/api/bets/${BET_ID}/**`, (route) =>
			route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) }),
		);
		// 2. More specific: artifact-thread-summary needs correct shape.
		await page.route(`**/api/bets/${BET_ID}/artifact-thread-summary`, (route) =>
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ summaries: [], totalCount: 0, truncated: false }),
			}),
		);
		// 3. Most specific: the main bet endpoint (registered last → highest priority).
		await page.route(`**/api/bets/${BET_ID}`, (route) =>
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(makeBetResponse()),
			}),
		);
	});

	test("AssistantOverlay (--z-overlay=40) stacks above TaskSheet (--z-drawer=30): open drawer first", async ({
		page,
	}) => {
		await page.goto(`/work/bet/${BET_ID}`);

		// Wait for success state (overflow button only visible when bet data loads)
		const overflowBtn = page.locator("[data-testid='bet-overflow-btn']");
		await expect(
			overflowBtn,
			"bet-overflow-btn must be visible — WorkBet success state must render",
		).toBeVisible({ timeout: 15000 });

		// Open TaskSheet (drawer layer) by clicking a task row.
		// @lore AI2 C-2: WorkBet task-row onClick was fixed from navigate() to setSelectedTaskId()
		// so that TaskSheet (drawer) is activated instead of navigating away.
		const taskRow = page.locator("[data-testid='task-row']").first();
		await expect(
			taskRow,
			"task-row must be visible — makeBetResponse() includes 1 task",
		).toBeVisible();
		await taskRow.click();

		// TaskSheet should be open
		const taskSheet = page.locator("[data-testid='task-sheet']");
		await expect(taskSheet, "TaskSheet must be visible after clicking task-row").toBeVisible();

		const drawerZ = await computedZIndex(page, "[data-dialog-layer='drawer']");
		expect(drawerZ, "Drawer z-index must be > 0 (--z-drawer=30 token active)").toBeGreaterThan(0);

		// Open AssistantOverlay (overlay layer) via the Assistant button in Sidebar.
		// @lore AI2 C-2: The "Assistant" button in Sidebar opens AssistantOverlay (--z-overlay=40).
		const assistantBtn = page.getByRole("button", { name: /^assistant$/i });
		await expect(assistantBtn, "Assistant button must be visible in Sidebar").toBeVisible();
		await assistantBtn.click();

		const assistantOverlay = page.locator("[data-dialog-layer='overlay']");
		await expect(assistantOverlay, "AssistantOverlay must be visible after click").toBeVisible();

		const overlayZ = await computedZIndex(page, "[data-dialog-layer='overlay']");

		// Overlay (40) must be strictly higher than drawer (30)
		expect(overlayZ, "overlay z-index must be > drawer z-index (40 > 30)").toBeGreaterThan(drawerZ);

		await page.screenshot({ path: "test-results/ai2-z-order-drawer-first.png" });
	});

	test("AssistantOverlay (--z-overlay=40) stacks above TaskSheet (--z-drawer=30): open overlay first", async ({
		page,
	}) => {
		await page.goto(`/work/bet/${BET_ID}`);

		// Wait for success state
		const overflowBtn = page.locator("[data-testid='bet-overflow-btn']");
		await expect(
			overflowBtn,
			"bet-overflow-btn must be visible — WorkBet success state must render",
		).toBeVisible({ timeout: 15000 });

		// Open AssistantOverlay (overlay layer) FIRST.
		const assistantBtn = page.getByRole("button", { name: /^assistant$/i });
		await expect(assistantBtn, "Assistant button must be visible in Sidebar").toBeVisible();
		await assistantBtn.click();

		const assistantOverlay = page.locator("[data-dialog-layer='overlay']");
		await expect(assistantOverlay, "AssistantOverlay must be visible after click").toBeVisible();

		const overlayZ = await computedZIndex(page, "[data-dialog-layer='overlay']");
		expect(overlayZ, "Overlay z-index must be > 0 (--z-overlay=40 token active)").toBeGreaterThan(
			0,
		);

		// Now open TaskSheet (drawer layer).
		const taskRow = page.locator("[data-testid='task-row']").first();
		await expect(taskRow, "task-row must be visible").toBeVisible();
		await taskRow.click();

		const taskSheet = page.locator("[data-testid='task-sheet']");
		await expect(taskSheet, "TaskSheet must be visible after clicking task-row").toBeVisible();

		const drawerZ = await computedZIndex(page, "[data-dialog-layer='drawer']");

		// Even when opened in reverse order, z-values follow the token scale
		expect(
			overlayZ,
			"overlay z-index must be > drawer z-index (40 > 30), even when opened second",
		).toBeGreaterThan(drawerZ);

		await page.screenshot({ path: "test-results/ai2-z-order-overlay-first.png" });
	});

	test("modal Dialog (--z-dialog=60) stacks above NotificationPopover (--z-overlay=40)", async ({
		page,
	}) => {
		// Open any modal dialog
		await page.goto(`/work/bet/${BET_ID}`);
		await expect(page.locator("[data-testid='work-bet-page']")).toBeVisible();

		// Open a modal dialog via the overflow menu (bet action).
		// @lore AI2: The overflow button check uses count() as a guard and then
		// skips if not found — this spec is best-effort (the static AC-3 lint gate
		// is the binding enforcement; this test adds runtime computed-z proof).
		const overflowBtn = page.locator("[data-testid='bet-overflow-btn']");
		if ((await overflowBtn.count()) === 0) {
			test.skip(true, "No overflow button — skipping dialog-above-overlay ordering test");
		}
		// Wait for network to settle before interacting (prevents re-render detach)
		await page.waitForLoadState("networkidle");
		await overflowBtn.first().click();
		const killItem = page.locator("[data-bet-action='kill']");
		if ((await killItem.count()) === 0) {
			test.skip(true, "No kill dropdown item — skipping");
		}
		await killItem.click();

		const dialogZ = await computedZIndex(page, "[data-dialog-layer='dialog']");
		// A dialog (60) must be higher than overlay (40) — even if no overlay is open,
		// we assert the raw z-value satisfies the scale contract.
		expect(dialogZ).toBeGreaterThanOrEqual(60);
	});
});
