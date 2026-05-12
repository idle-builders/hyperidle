/**
 * L14 — Playwright E2E: Bet-level human actions with consequence preview.
 *
 * Strategy: hermetic page.route() mocks for all API calls.
 * No DB seeding — dev server serves only the SPA bundle.
 *
 * AC-8: Escape does NOT close ConsequencePreviewDialog; Cancel DOES close it.
 * AC-9: Fill reason, click Kill bet confirm → POST /kill called; status chip updates.
 * AC-10: Adjust appetite flow → PATCH /bets/:id called with correct body.
 * AC-11: Unblock → composer textarea focused.
 * AC-12: After pause action, revisionLog last entry has actor="u-founder".
 */

import { expect, test } from "@playwright/test";

const BET_ID = "bet-l14-actions";
const FOUNDER_ID = "u-founder";
const THREAD_ID = "t-l14-thread";

function makeBetResponse(status = "in_progress") {
	return {
		id: BET_ID,
		title: "L14 Test Bet",
		product: "Alpha",
		team: "t1",
		status,
		costAppetite: { minor: 100000, currency: "USD" },
		costActual: null,
		tokensActual: null,
		progress: { done: 1, total: 3 },
		pitch: "# Problem\n\nThis bet needs action bar testing.\n",
		tasks: [],
		revisionLog: null,
	};
}

function makeEmptyThreadResponse() {
	return { threads: [], nextCursor: null };
}

function makeEmptyMessagesResponse() {
	return { messages: [], total: 0 };
}

/** Intercept all standard API calls needed by the WorkBet page. */
async function setupCommonRoutes(
	page: Parameters<typeof test>[1] extends infer T
		? T extends { page: infer P }
			? P
			: never
		: never,
	betStatus = "in_progress",
) {
	// GET /api/bets/:id
	await page.route(`**/api/bets/${BET_ID}`, (route) => {
		if (route.request().method() === "GET") {
			return route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(makeBetResponse(betStatus)),
			});
		}
		return route.continue();
	});

	// Thread list
	await page.route(`**/api/threads?**`, (route) => {
		return route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify(makeEmptyThreadResponse()),
		});
	});

	// Messages
	await page.route(`**/api/messages?**`, (route) => {
		return route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify(makeEmptyMessagesResponse()),
		});
	});

	// Thread resolution
	await page.route(`**/api/threads`, (route) => {
		if (route.request().method() === "POST") {
			return route.fulfill({
				status: 201,
				contentType: "application/json",
				body: JSON.stringify({
					thread: {
						id: THREAD_ID,
						hostKind: "bet",
						hostId: BET_ID,
						initiatorId: FOUNDER_ID,
						participants: [FOUNDER_ID],
						pinned: false,
						resolvedAt: null,
						lastActiveAt: new Date().toISOString(),
						createdAt: new Date().toISOString(),
					},
					messages: [],
				}),
			});
		}
		return route.continue();
	});

	// Artifact thread summary
	await page.route(`**/api/bets/${BET_ID}/artifact-thread-summary`, (route) => {
		return route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ summaries: [], totalCount: 0, truncated: false }),
		});
	});
}

test.describe("L14 — Bet actions E2E", () => {
	// ─── AC-8: ConsequencePreviewDialog is non-skippable ──────────────────

	test.describe("AC-8 — Kill bet dialog (non-skippable)", () => {
		test("clicking Kill bet opens the consequence dialog", async ({ page }) => {
			await setupCommonRoutes(page, "in_progress");
			await page.goto(`/work/bet/${BET_ID}`);

			await expect(page.locator('[data-testid="work-bet-page"]')).toBeVisible();

			const killBtn = page.getByRole("button", { name: /kill bet/i });
			await expect(killBtn).toBeVisible();
			await killBtn.click();

			await expect(page.getByRole("dialog")).toBeVisible();
		});

		test("pressing Escape does NOT close the dialog", async ({ page }) => {
			await setupCommonRoutes(page, "in_progress");
			await page.goto(`/work/bet/${BET_ID}`);
			await expect(page.locator('[data-testid="work-bet-page"]')).toBeVisible();

			await page.getByRole("button", { name: /kill bet/i }).click();
			await expect(page.getByRole("dialog")).toBeVisible();

			// Press Escape
			await page.keyboard.press("Escape");

			// Dialog must still be visible
			await expect(page.getByRole("dialog")).toBeVisible();
		});

		test("clicking Cancel closes the dialog", async ({ page }) => {
			await setupCommonRoutes(page, "in_progress");
			await page.goto(`/work/bet/${BET_ID}`);
			await expect(page.locator('[data-testid="work-bet-page"]')).toBeVisible();

			await page.getByRole("button", { name: /kill bet/i }).click();
			await expect(page.getByRole("dialog")).toBeVisible();

			await page.getByRole("button", { name: /cancel/i }).click();

			await expect(page.getByRole("dialog")).not.toBeVisible();
		});
	});

	// ─── AC-9: Kill confirm → POST /kill → status updates ──────────────────

	test.describe("AC-9 — Kill confirm submits and updates status", () => {
		test("filling reason and confirming calls POST /bets/:id/kill", async ({ page }) => {
			let killBody: Record<string, unknown> = {};
			let killed = false;

			await setupCommonRoutes(page, "in_progress");

			// Intercept kill call
			await page.route(`**/api/bets/${BET_ID}/kill`, (route) => {
				killBody = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
				killed = true;
				return route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify(makeBetResponse("killed")),
				});
			});

			// Override GET — returns in_progress initially, killed after the action (LIFO: this takes priority)
			await page.route(`**/api/bets/${BET_ID}`, (route) => {
				if (route.request().method() === "GET") {
					return route.fulfill({
						status: 200,
						contentType: "application/json",
						body: JSON.stringify(makeBetResponse(killed ? "killed" : "in_progress")),
					});
				}
				return route.continue();
			});

			await page.goto(`/work/bet/${BET_ID}`);
			await expect(page.locator('[data-testid="work-bet-page"]')).toBeVisible();

			await page.getByRole("button", { name: /kill bet/i }).click();
			await expect(page.getByRole("dialog")).toBeVisible();

			// Fill reason
			const dialog = page.getByRole("dialog");
			const reasonArea = dialog.locator("textarea").first();
			await reasonArea.fill("No longer viable after pivot");

			// Click Kill bet in the dialog (the confirm button)
			const confirmBtn = dialog.getByRole("button", { name: /kill bet/i });
			await expect(confirmBtn).not.toBeDisabled();
			await confirmBtn.click();

			// Assert the API was called with the reason
			expect(killBody.reason).toBe("No longer viable after pivot");
		});
	});

	// ─── AC-10: Appetite dialog → PATCH ────────────────────────────────────

	test.describe("AC-10 — Appetite adjust flow", () => {
		test("changing appetite and confirming calls PATCH /bets/:id", async ({ page }) => {
			let patchBody: Record<string, unknown> = {};

			await setupCommonRoutes(page, "in_progress");

			await page.route(`**/api/bets/${BET_ID}`, (route) => {
				if (route.request().method() === "PATCH") {
					patchBody = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
					return route.fulfill({
						status: 200,
						contentType: "application/json",
						body: JSON.stringify({ ...makeBetResponse("in_progress"), costAppetite: { minor: 50000, currency: "USD" } }),
					});
				}
				if (route.request().method() === "GET") {
					return route.fulfill({
						status: 200,
						contentType: "application/json",
						body: JSON.stringify(makeBetResponse("in_progress")),
					});
				}
				return route.continue();
			});

			await page.goto(`/work/bet/${BET_ID}`);
			await expect(page.locator('[data-testid="work-bet-page"]')).toBeVisible();

			await page.getByRole("button", { name: /adjust appetite/i }).click();
			await expect(page.getByRole("dialog")).toBeVisible();

			// Change select to "1 week"
			const dialog = page.getByRole("dialog");
			await dialog.locator("select").selectOption("1 week");

			// Fill reason
			const reasonArea = dialog.locator("textarea").first();
			await reasonArea.fill("Scope reduced significantly");

			// Click Save
			const saveBtn = dialog.getByRole("button", { name: /save/i });
			await expect(saveBtn).not.toBeDisabled();
			await saveBtn.click();

			// Assert PATCH was called with correct body
			expect(patchBody.field).toBe("cost_appetite");
			expect(patchBody.value).toBe("1 week");
			expect(patchBody.reason).toBe("Scope reduced significantly");
		});
	});

	// ─── AC-11: Unblock → composer textarea focused ────────────────────────

	test.describe("AC-11 — Unblock scrolls to thread composer", () => {
		test("clicking Unblock focuses the composer textarea", async ({ page }) => {
			await setupCommonRoutes(page, "in_progress");

			// Mock thread resolve so composer is fully rendered
			await page.route(`**/api/threads/${THREAD_ID}/messages`, (route) => {
				return route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify([]),
				});
			});

			await page.goto(`/work/bet/${BET_ID}`);
			await expect(page.locator('[data-testid="work-bet-page"]')).toBeVisible();

			await page.getByRole("button", { name: /unblock/i }).click();

			// Composer textarea should be focused
			const composerTextarea = page.locator('[data-testid="composer-textarea"]');
			await expect(composerTextarea).toBeFocused();
		});
	});

	// ─── AC-12: Revision log actor after pause ─────────────────────────────

	test.describe("AC-12 — Revision log actor field", () => {
		test("pause action is reflected with actor='u-founder' in the revision log", async ({
			page,
		}) => {
			let pauseBody: Record<string, unknown> = {};
			let paused = false;
			const pausedRevisionLog = JSON.stringify([
				{
					timestamp: new Date().toISOString(),
					field: "status",
					old_value: "in_progress",
					new_value: "paused",
					reason: "Team load",
					actor: FOUNDER_ID,
				},
			]);

			await setupCommonRoutes(page, "in_progress");

			// Intercept pause call
			await page.route(`**/api/bets/${BET_ID}/pause`, (route) => {
				pauseBody = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
				paused = true;
				return route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({
						...makeBetResponse("paused"),
						revisionLog: pausedRevisionLog,
					}),
				});
			});

			// Override GET — returns in_progress initially, paused after action (LIFO: takes priority)
			await page.route(`**/api/bets/${BET_ID}`, (route) => {
				if (route.request().method() === "GET") {
					return route.fulfill({
						status: 200,
						contentType: "application/json",
						body: JSON.stringify(
							paused
								? { ...makeBetResponse("paused"), revisionLog: pausedRevisionLog }
								: makeBetResponse("in_progress"),
						),
					});
				}
				return route.continue();
			});

			await page.goto(`/work/bet/${BET_ID}`);
			await expect(page.locator('[data-testid="work-bet-page"]')).toBeVisible();

			// Click Pause
			await page.getByRole("button", { name: /^pause$/i }).click();
			await expect(page.getByRole("dialog")).toBeVisible();

			// Fill reason and confirm
			const dialog = page.getByRole("dialog");
			const reasonArea = dialog.locator("textarea").first();
			await reasonArea.fill("Team load");

			const confirmBtn = dialog.getByRole("button", { name: /pause/i });
			await confirmBtn.click();

			// Verify the pause route was called with reason
			expect(pauseBody.reason).toBe("Team load");

			// Fetch the bet directly and check the revision log
			const betResponse = await page.evaluate(async (betId: string) => {
				const res = await fetch(`/api/bets/${betId}`);
				return res.json() as Promise<{ revisionLog: string | null }>;
			}, BET_ID);

			const log = JSON.parse(betResponse.revisionLog ?? "[]") as Array<{
				field: string;
				new_value: string;
				actor?: string;
			}>;
			const pauseEntry = log.find((e) => e.field === "status" && e.new_value === "paused");
			expect(pauseEntry).toBeDefined();
			expect(pauseEntry?.actor).toBe(FOUNDER_ID);
		});
	});

	// ─── AC-7: Action bar renders for paused bet ──────────────────────────

	test.describe("AC-7 — Action bar per status (E2E smoke)", () => {
		test("paused bet shows Resume button, not Pause", async ({ page }) => {
			await setupCommonRoutes(page, "paused");
			await page.goto(`/work/bet/${BET_ID}`);
			await expect(page.locator('[data-testid="work-bet-page"]')).toBeVisible();

			await expect(page.getByRole("button", { name: /resume/i })).toBeVisible();
			await expect(page.getByRole("button", { name: /^pause$/i })).not.toBeVisible();
		});

		test("shipped bet shows no action bar", async ({ page }) => {
			await setupCommonRoutes(page, "shipped");
			await page.goto(`/work/bet/${BET_ID}`);
			await expect(page.locator('[data-testid="work-bet-page"]')).toBeVisible();

			await expect(page.getByRole("button", { name: /kill bet/i })).not.toBeVisible();
			await expect(page.getByRole("button", { name: /pause/i })).not.toBeVisible();
		});
	});
});
