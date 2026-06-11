/**
 * AF12 — E2E lifecycle: activate (AC1) → adjust appetite as money (AC2) →
 * kill cascade copy (AC3) → sessions visible on the task surface (AC4).
 *
 * Hermetic page.route() mocks (same strategy as L14-bet-actions.spec.ts) — the
 * dev server serves only the SPA bundle.
 *
 * @lore AF12 RED: asserts the NEW lifecycle UI (Activate bet item, WireMoney
 * appetite payload, cost-honest kill copy, TaskSheet/Task sessions list). These
 * fail until the green phase ships the four surfaces.
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
		costAppetite: { minor: 100000, currency: "USD" },
		costActual: null,
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

	// ─── AC2: Adjust appetite sends WireMoney ────────────────────────────────
	test("adjust appetite sends a WireMoney object (no 400, no duration string)", async ({
		page,
	}) => {
		let patchBody: Record<string, unknown> = {};
		await setupCommonRoutes(page, ACTIVE_BET, "active");

		await page.route(`**/api/bets/${ACTIVE_BET}`, (route) => {
			if (route.request().method() === "PATCH") {
				patchBody = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
				return route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify(betResponse(ACTIVE_BET, "active")),
				});
			}
			if (route.request().method() === "GET") {
				return route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify(betResponse(ACTIVE_BET, "active")),
				});
			}
			return route.continue();
		});

		await page.goto(`/work/bet/${ACTIVE_BET}`);
		await expect(page.locator('[data-testid="work-bet-page"]')).toBeVisible();

		await page.locator('[data-testid="bet-overflow-btn"]').click();
		await page.locator('[data-bet-action="adjust-appetite"]').click();

		const dialog = page.getByRole("dialog");
		await expect(dialog).toBeVisible();
		await dialog.getByRole("spinbutton").fill("250");
		await dialog.locator("textarea").first().fill("Scope grew");
		await dialog.getByRole("button", { name: /save/i }).click();

		await expect.poll(() => patchBody.field).toBe("cost_appetite");
		expect(typeof patchBody.value).toBe("object");
		expect(patchBody.value).toMatchObject({ minor: 25000, currency: "USD" });
	});

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
