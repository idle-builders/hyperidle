/**
 * AF12 — E2E lifecycle: activate (AC1) → kill cascade copy (AC3) → sessions
 * visible on the task surface (AC4).
 *
 * Hermetic page.route() mocks (same strategy as L14-bet-actions.spec.ts) — the
 * dev server serves only the SPA bundle.
 *
 * @lore AF12 RED: asserts the NEW lifecycle UI (Activate bet item,
 * cost-honest kill copy, TaskSheet/Task sessions list). These fail until the
 * green phase ships the surfaces.
 *
 * @lore AU21 Increment 14a: AC2 ("adjust appetite as money") is HARD-DELETED
 * along with the rest of the cost-cap feature — no replacement.
 */

import { expect, test } from "./fixtures";

const DRAFT_BET = "bet-af12-draft";
const ACTIVE_BET = "bet-af12-active";

function betResponse(id: string, status: string) {
	return {
		id,
		title: "AF12 Lifecycle Bet",
		product: "Alpha",
		team: "t1",
		status,
		tokensActual: null,
		progress: { done: 0, total: 0 },
		description: "# Problem\n\nLifecycle bet.\n",
		tasks: [],
		revisionLog: null,
	};
}

async function setupCommonRoutes(
	page: Parameters<typeof test>[1] extends infer T
		? T extends { page: infer P }
			? P
			: never
		: never,
	betId: string,
	status: string,
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
	await page.route(`**/api/bets/${betId}/artifact-thread-summary`, (route) =>
		route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ summaries: [], totalCount: 0, truncated: false }),
		}),
	);
	await page.route(`**/api/bets/${betId}`, (route) => {
		if (route.request().method() === "GET") {
			return route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(betResponse(betId, status)),
			});
		}
		return route.continue();
	});
}

test.describe("AF12 — bet/task lifecycle E2E", () => {
	// ─── AC1: Activate a draft bet ──────────────────────────────────────────
	test("activate a draft bet → POST /commit fires and status flips to active", async ({ page }) => {
		let activated = false;
		await setupCommonRoutes(page, DRAFT_BET, "draft");

		await page.route(`**/api/bets/${DRAFT_BET}/commit`, (route) => {
			activated = true;
			return route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(betResponse(DRAFT_BET, "active")),
			});
		});
		await page.route(`**/api/bets/${DRAFT_BET}`, (route) => {
			if (route.request().method() === "GET") {
				return route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify(betResponse(DRAFT_BET, activated ? "active" : "draft")),
				});
			}
			return route.continue();
		});

		await page.goto(`/work/bet/${DRAFT_BET}`);
		await expect(page.locator('[data-testid="work-bet-page"]')).toBeVisible();

		await page.locator('[data-testid="bet-overflow-btn"]').click();
		await page.locator('[data-bet-action="activate"]').click();

		await expect.poll(() => activated).toBe(true);
	});

	// @lore AU21 Increment 14a: "AC2: Adjust appetite sends WireMoney" is
	// HARD-DELETED — the "Adjust appetite" action + AppetiteDialog no longer
	// exist (bets.costAppetite/costActual are dropped columns), no replacement.

	// ─── AC3: Kill dialog copy is cost-honest ────────────────────────────────
	test("kill dialog copy is cost-honest (no 'immediately', has 'finish their current step')", async ({
		page,
	}) => {
		await setupCommonRoutes(page, ACTIVE_BET, "active");

		await page.goto(`/work/bet/${ACTIVE_BET}`);
		await expect(page.locator('[data-testid="work-bet-page"]')).toBeVisible();

		await page.locator('[data-testid="bet-overflow-btn"]').click();
		await page.locator('[data-bet-action="kill"]').click();

		const dialog = page.getByRole("dialog");
		await expect(dialog).toBeVisible();
		await expect(dialog).toContainText(/finish their current step/i);
		await expect(dialog).not.toContainText(/immediately/i);
	});
});
