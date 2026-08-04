/**
 * L14 — Playwright E2E: Bet-level human actions with consequence preview.
 *
 * Strategy: hermetic page.route() mocks for all API calls.
 * No DB seeding — dev server serves only the SPA bundle.
 *
 * AC-8: Escape closes ConsequencePreviewDialog (confirmation-never-dirty rule §1.1).
 *        SANCTIONED CHANGE #1 (AI2): was "Escape does NOT close". ConsequencePreviewDialog
 *        passes isDirty=false ALWAYS — so Esc closes, empty or typed reason. Cancel DOES
 *        also close it. See architecture.md §Sanctioned assertion changes #1.
 * AC-9: Fill reason, click Kill bet confirm → POST /kill called; status chip updates.
 * AC-11: Unblock → composer textarea focused.
 * AC-12: After kill action, revisionLog last entry has actor="u-founder".
 *
 * @lore AF12: updated to the current UI contract. Bet actions live behind the
 * overflow menu (`data-testid="bet-overflow-btn"` → `data-bet-action="…"`), not
 * top-level buttons. Statuses are the post-U1 set (draft|active|completed|killed)
 * — `in_progress`/`paused`/`shipped` are dead. Pause/Resume removed (no pause
 * state in the bet status enum); the AC-12 actor-in-revisionLog coverage now runs
 * through the kill action.
 *
 * @lore AU21 Increment 14a: AC-10 ("Adjust appetite flow") is HARD-DELETED
 * along with the rest of the cost-cap feature — no replacement.
 */

import { expect, test } from "./fixtures";

const BET_ID = "bet-l14-actions";
const FOUNDER_ID = "u-founder";
const THREAD_ID = "t-l14-thread";

function makeBetResponse(status = "active") {
	return {
		id: BET_ID,
		title: "L14 Test Bet",
		product: "Alpha",
		team: "t1",
		status,
		tokensActual: null,
		progress: { done: 1, total: 3 },
		description: "# Problem\n\nThis bet needs action bar testing.\n",
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
	betStatus = "active",
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

/** Open the bet overflow menu and click the named action item. */
async function openOverflowAction(
	page: Parameters<typeof setupCommonRoutes>[0],
	action: string,
): Promise<void> {
	await page.locator('[data-testid="bet-overflow-btn"]').click();
	await page.locator(`[data-bet-action="${action}"]`).click();
}

test.describe("L14 — Bet actions E2E", () => {
	// ─── AC-8: ConsequencePreviewDialog is non-skippable ──────────────────

	test.describe("AC-8 — Kill bet dialog (non-skippable)", () => {
		test("clicking Kill opens the consequence dialog", async ({ page }) => {
			await setupCommonRoutes(page, "active");
			await page.goto(`/work/bet/${BET_ID}`);

			await expect(page.locator('[data-testid="work-bet-page"]')).toBeVisible();

			await openOverflowAction(page, "kill");

			await expect(page.getByRole("dialog")).toBeVisible();
		});

		// SANCTIONED CHANGE #1 (AI2): was "pressing Escape does NOT close the dialog".
		// Under the confirmation-never-dirty rule (approved.md §1.1), ConsequencePreviewDialog
		// passes isDirty=false ALWAYS — so Esc closes whether reason is empty or typed.
		// This corrects the headline bug; the assertion flips from "still visible" to "not visible".
		test("pressing Escape closes the dialog (confirmation-never-dirty rule §1.1)", async ({
			page,
		}) => {
			await setupCommonRoutes(page, "active");
			await page.goto(`/work/bet/${BET_ID}`);
			await expect(page.locator('[data-testid="work-bet-page"]')).toBeVisible();

			await openOverflowAction(page, "kill");
			await expect(page.getByRole("dialog")).toBeVisible();

			// Press Escape — confirmation dialog always closes (isDirty=false always)
			await page.keyboard.press("Escape");

			// Dialog must be closed (not blocked by the guard, because isDirty=false)
			await expect(page.getByRole("dialog")).not.toBeVisible();
		});

		test("clicking Cancel closes the dialog", async ({ page }) => {
			await setupCommonRoutes(page, "active");
			await page.goto(`/work/bet/${BET_ID}`);
			await expect(page.locator('[data-testid="work-bet-page"]')).toBeVisible();

			await openOverflowAction(page, "kill");
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

			await setupCommonRoutes(page, "active");

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

			// Override GET — returns active initially, killed after the action (LIFO: this takes priority)
			await page.route(`**/api/bets/${BET_ID}`, (route) => {
				if (route.request().method() === "GET") {
					return route.fulfill({
						status: 200,
						contentType: "application/json",
						body: JSON.stringify(makeBetResponse(killed ? "killed" : "active")),
					});
				}
				return route.continue();
			});

			await page.goto(`/work/bet/${BET_ID}`);
			await expect(page.locator('[data-testid="work-bet-page"]')).toBeVisible();

			await openOverflowAction(page, "kill");
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
			await expect.poll(() => killBody.reason).toBe("No longer viable after pivot");
		});
	});

	// @lore AU21 Increment 14a: "AC-10 — Appetite adjust flow" describe block
	// is HARD-DELETED — the "Adjust appetite" action + AppetiteDialog no
	// longer exist (bets.costAppetite/costActual are dropped columns), no
	// replacement.

	// ─── AC-11: Unblock → composer textarea focused ────────────────────────

	test.describe("AC-11 — Unblock scrolls to thread composer", () => {
		test("clicking Unblock focuses the composer textarea", async ({ page }) => {
			await setupCommonRoutes(page, "active");

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

			await openOverflowAction(page, "unblock");

			// Composer textarea should be focused
			const composerTextarea = page.locator('[data-testid="composer-textarea"]');
			await expect(composerTextarea).toBeFocused();
		});
	});

	// ─── AC-12: Revision log actor after a human action ────────────────────

	test.describe("AC-12 — Revision log actor field", () => {
		test("kill action is reflected with actor='u-founder' in the revision log", async ({
			page,
		}) => {
			let killBody: Record<string, unknown> = {};
			let killed = false;
			const killedRevisionLog = JSON.stringify([
				{
					timestamp: new Date().toISOString(),
					field: "status",
					old_value: "active",
					new_value: "killed",
					reason: "Team load",
					actor: FOUNDER_ID,
				},
			]);

			await setupCommonRoutes(page, "active");

			// Intercept kill call
			await page.route(`**/api/bets/${BET_ID}/kill`, (route) => {
				killBody = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
				killed = true;
				return route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({
						...makeBetResponse("killed"),
						revisionLog: killedRevisionLog,
					}),
				});
			});

			// Override GET — returns active initially, killed after action (LIFO: takes priority)
			await page.route(`**/api/bets/${BET_ID}`, (route) => {
				if (route.request().method() === "GET") {
					return route.fulfill({
						status: 200,
						contentType: "application/json",
						body: JSON.stringify(
							killed
								? { ...makeBetResponse("killed"), revisionLog: killedRevisionLog }
								: makeBetResponse("active"),
						),
					});
				}
				return route.continue();
			});

			await page.goto(`/work/bet/${BET_ID}`);
			await expect(page.locator('[data-testid="work-bet-page"]')).toBeVisible();

			await openOverflowAction(page, "kill");
			await expect(page.getByRole("dialog")).toBeVisible();

			// Fill reason and confirm
			const dialog = page.getByRole("dialog");
			const reasonArea = dialog.locator("textarea").first();
			await reasonArea.fill("Team load");

			const confirmBtn = dialog.getByRole("button", { name: /kill bet/i });
			await confirmBtn.click();

			// Verify the kill route was called with reason
			await expect.poll(() => killBody.reason).toBe("Team load");

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
			const killEntry = log.find((e) => e.field === "status" && e.new_value === "killed");
			expect(killEntry).toBeDefined();
			expect(killEntry?.actor).toBe(FOUNDER_ID);
		});
	});

	// ─── AC-7: Action bar renders per status (E2E smoke) ───────────────────

	test.describe("AC-7 — Action bar per status (E2E smoke)", () => {
		test("draft bet offers Activate", async ({ page }) => {
			await setupCommonRoutes(page, "draft");
			await page.goto(`/work/bet/${BET_ID}`);
			await expect(page.locator('[data-testid="work-bet-page"]')).toBeVisible();

			await page.locator('[data-testid="bet-overflow-btn"]').click();
			await expect(page.locator('[data-bet-action="activate"]')).toBeVisible();
		});

		test("completed bet shows no kill action", async ({ page }) => {
			await setupCommonRoutes(page, "completed");
			await page.goto(`/work/bet/${BET_ID}`);
			await expect(page.locator('[data-testid="work-bet-page"]')).toBeVisible();

			await page.locator('[data-testid="bet-overflow-btn"]').click();
			await expect(page.locator('[data-bet-action="kill"]')).toHaveCount(0);
		});
	});
});
