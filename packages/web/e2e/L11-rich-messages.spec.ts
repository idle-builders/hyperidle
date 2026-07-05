/**
 * L11 step5 (write-tests) — Playwright e2e for inline rich messages
 * (AC-1, AC-3, AC-8, AC-11, AC-13).
 *
 * Approved.md §10 acceptance map. Plan §3 + §11 T13.
 *
 * Hermetic page.route() mocks (mirrors threads.spec.ts pattern). The page
 * issues GET /api/threads/:id and POST /api/threads/:id/messages — the
 * canonical surface chosen by plan CONFUSION resolution A.
 *
 * Coverage:
 *   - Open a review thread → RichMessageCard mounts inline → ArtifactView
 *     and the 5 verdict buttons render inside the card.
 *   - Click Approve → POST has `{type:'verdict', payload:{decision,
 *     resolvesMessageId}, clientKey}`; verdict CommentRow appears; banner
 *     shows resolved.
 *   - 7-letter shortcut sweep on document body produces ZERO POSTs.
 *   - No deleted top toolbar (`[data-testid='review-header']`) mounts.
 *   - No `[data-testid='thread-head']` mounts (plan §6.3).
 *
 * @lore L11 step5: red-phase. The card / data-testid='rich-message-card'
 * does not exist yet, so all three tests fail before plan T4 lands.
 */

import { expect, test } from "./fixtures";

const NOW = "2026-04-28T10:00:00.000Z";
const LATER = "2026-04-28T10:05:00.000Z";

const FOUNDER_ID = "u-founder";
const AGENT_ID = "a-aria";

const THREAD_ID = "t-l11-review";
const REVIEW_ID = "m-l11-review";

function reviewFixture(resolvedAt: string | null = null) {
	const reviewMessage = {
		id: REVIEW_ID,
		threadId: THREAD_ID,
		senderId: AGENT_ID,
		clientKey: "ck-l11-review-001",
		deletedAt: null,
		redactedAt: null,
		resolvedAt,
		createdAt: NOW,
		type: "review",
		payload: {
			title: "Approve L11 inline rendering",
			reasoning: ["Inline action surface attaches to the message."],
			artifactRef: { id: "art-l11", kind: "text_diff" },
		},
	};
	return {
		thread: {
			id: THREAD_ID,
			hostKind: "task",
			hostId: "task-l11",
			initiatorId: AGENT_ID,
			participants: [AGENT_ID, FOUNDER_ID].sort(),
			pinned: false,
			resolvedAt: resolvedAt ? LATER : null,
			lastActiveAt: NOW,
			createdAt: NOW,
		},
		messages: [reviewMessage],
		headMessageId: resolvedAt ? null : REVIEW_ID,
		nextMessagesCursor: null,
	};
}

test.describe("L11 — rich messages render inline", () => {
	test("RichMessageCard mounts inline with ArtifactView + 5 verdict buttons", async ({ page }) => {
		const fixture = reviewFixture();
		await page.route(`**/api/threads/${THREAD_ID}`, async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify(fixture),
				});
				return;
			}
			await route.continue();
		});

		await page.goto(`/conversations/${THREAD_ID}`);

		// Card is mounted as part of the message stream (AC-1, AC-8).
		const card = page.locator("[data-testid='rich-message-card']");
		await expect(card).toBeVisible();
		await expect(card).toContainText("Approve L11 inline rendering");
		// ArtifactView is mounted INSIDE the card.
		await expect(card.locator("[data-component='ArtifactView']")).toBeVisible();
		// All 5 verdict buttons in the card's action toolbar.
		const toolbar = card.getByRole("toolbar", { name: /verdict actions/i });
		await expect(toolbar.getByRole("button", { name: /^approve$/i })).toBeVisible();
		await expect(toolbar.getByRole("button", { name: /approve with comments/i })).toBeVisible();
		await expect(toolbar.getByRole("button", { name: /request changes/i })).toBeVisible();
		await expect(toolbar.getByRole("button", { name: /^edit$/i })).toBeVisible();
		await expect(toolbar.getByRole("button", { name: /reject/i })).toBeVisible();

		// Deleted surfaces no longer mount (AC-2, AC-5).
		await expect(page.locator("[data-testid='review-header']")).toHaveCount(0);
		await expect(page.locator("[data-testid='thread-head']")).toHaveCount(0);
	});

	test("clicking Approve dispatches a verdict POST with the canonical shape and the card resolves", async ({
		page,
	}) => {
		const before = reviewFixture(null);
		const after = reviewFixture(LATER);
		// Append a verdict CommentRow to the resolved fixture.
		const verdictMessage = {
			id: "m-l11-verdict",
			threadId: THREAD_ID,
			senderId: FOUNDER_ID,
			clientKey: "ck-l11-verdict-001",
			deletedAt: null,
			redactedAt: null,
			resolvedAt: null,
			createdAt: LATER,
			type: "verdict",
			payload: { decision: "approve", resolvesMessageId: REVIEW_ID },
		};
		const afterWithVerdict = {
			...after,
			messages: [verdictMessage, { ...before.messages[0], resolvedAt: LATER }],
		};

		let postObserved = false;
		const captured: Array<{ url: string; body: unknown }> = [];

		await page.route(`**/api/threads/${THREAD_ID}`, async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify(postObserved ? afterWithVerdict : before),
				});
				return;
			}
			await route.continue();
		});

		await page.route(`**/api/threads/${THREAD_ID}/messages`, async (route) => {
			if (route.request().method() === "POST") {
				postObserved = true;
				captured.push({
					url: route.request().url(),
					body: route.request().postDataJSON(),
				});
				await route.fulfill({
					status: 201,
					contentType: "application/json",
					body: JSON.stringify({
						message: verdictMessage,
						thread: { ...before.thread, resolvedAt: LATER },
					}),
				});
				return;
			}
			await route.continue();
		});

		await page.goto(`/conversations/${THREAD_ID}`);
		const card = page.locator("[data-testid='rich-message-card']");
		await expect(card).toBeVisible();

		await card.getByRole("button", { name: /^approve$/i }).click();

		// POST captured with the canonical shape.
		await expect.poll(() => captured.length).toBeGreaterThan(0);
		const body = captured[0].body as {
			type?: string;
			payload?: { decision?: string; resolvesMessageId?: string };
			clientKey?: string;
		};
		expect(body.type).toBe("verdict");
		expect(body.payload?.decision).toBe("approve");
		expect(body.payload?.resolvesMessageId).toBe(REVIEW_ID);
		expect(typeof body.clientKey).toBe("string");
		expect((body.clientKey as string).length).toBeGreaterThan(0);

		// Verdict CommentRow appears in the stream.
		// Note: the resolved card also renders an APPROVED label.
		await expect(page.getByText("APPROVED").first()).toBeVisible();
		// Resolved card collapses to single-line summary.
		await expect(
			page.locator("[data-testid='rich-message-card'][data-state='resolved']"),
		).toBeVisible();
	});

	test("the 7 verdict keyboard shortcuts (A/R/X/S/C/I/E) produce ZERO POSTs (AC-3)", async ({
		page,
	}) => {
		const fixture = reviewFixture();
		let postCount = 0;

		await page.route(`**/api/threads/${THREAD_ID}`, async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify(fixture),
				});
				return;
			}
			await route.continue();
		});
		await page.route(`**/api/threads/${THREAD_ID}/messages`, async (route) => {
			if (route.request().method() === "POST") {
				postCount += 1;
			}
			await route.fulfill({
				status: 201,
				contentType: "application/json",
				body: JSON.stringify({}),
			});
		});

		await page.goto(`/conversations/${THREAD_ID}`);
		await expect(page.locator("[data-testid='rich-message-card']")).toBeVisible();

		// Focus the document body so a hypothetical global keydown listener
		// (the original ReviewHeader trigger condition) would fire.
		await page.evaluate(() => {
			(document.body as HTMLElement).focus();
		});

		for (const key of ["a", "r", "x", "s", "c", "i", "e"]) {
			await page.keyboard.press(key);
		}

		// Tiny settle before asserting no POST happened.
		await page.waitForTimeout(200);
		expect(postCount).toBe(0);
	});
});
