/**
 * L1a — Playwright e2e for the shipping rich message types (TRACK-L:43, AC-13).
 *
 * Strategy: hermetic page.route() mocks. Each case intercepts
 * `POST /api/actions/open_thread` (and any `send_message` follow-up) the
 * page issues and returns realistic Thread/Message payloads matching the
 * `@hyperidle/domain-model` discriminated union. No DB seeding, no server
 * dependency — the dev server only serves the SPA bundle. A future contract
 * drift (e.g. renaming `payload.text`) breaks these mocks the same way it
 * breaks production: the page fails to render the expected shape.
 *
 * @lore L1 step10 (DoD gap-1): the previous draft of this spec used
 *   `page.goto("/conversations/review")` without `?id=`, which lands on the
 *   page's `EmptyState` branch — `[data-testid='thread-shell']` never mounts.
 *   Both have been replaced with hermetic route mocks below.
 *
 * @lore L9: routes changed from `/conversations/review?id=X` to
 *   `/conversations/X` (canonical path). All `goto()` calls updated.
 *
 * @lore BC3: repointed at `POST /api/actions/{open_thread,send_message}` —
 *   never `GET/POST /api/threads*`. `Thread.members` replaced `participants`;
 *   there is no `task` host kind (a task's own thread is `team`-hosted). This
 *   is a mechanical mock migration only — every test below is already on
 *   `known-pre-existing-failures.ts` (AM1 removed ThreadShell/RichMessageCard/
 *   CommentRow/inline-verdict from the conversation surface in favor of the
 *   Part-based ConversationSurface).
 *
 * Coverage (AC-13: "at least one thread renders correctly with each shipping
 * rich message type inline"):
 *   - review-shape:   ThreadHead + ReviewVerdictBar + plain CommentRow.
 *   - plain-shape:    no head, plain CommentRow renders inline.
 *   - back-compat:    legacy `subject + body` collapsed into `payload.text`
 *                     reads through the new endpoint.
 *   - composer:       plain-message round-trip via POST.
 *   - verdict click:  Approve → verdict CommentRow with APPROVED label.
 *
 * Deferred to L1b: questionnaire UI (T1), thread re-open via UI affordance
 * (no shipping button in L1a — verdict-only flow), WorkBet/ConversationsChat
 * pages.
 */

import { expect, makeIdentity, makeMessage, makeThread, test } from "./fixtures";

// --- canonical fixture builders (shape-mirrored from @hyperidle/domain-model) ----

const NOW = "2026-04-28T10:00:00.000Z";
const LATER = "2026-04-28T10:05:00.000Z";

const FOUNDER_ID = "u-founder";
const AGENT_ID = "a-aria";

function reviewThreadFixture(): {
	thread: ReturnType<typeof makeThread>;
	members: ReturnType<typeof makeIdentity>[];
	messages: Array<Record<string, unknown>>;
	headMessageId: string;
	hostTitle: null;
} {
	const threadId = "t-review-1";
	const reviewMessage = makeMessage("m-review-1", threadId, {
		senderId: AGENT_ID,
		clientKey: "ck-review-msg-001",
		createdAt: NOW,
		type: "review",
		payload: {
			title: "Approve copy update",
			reasoning: ["Headline tightens to 8 words.", "CTA color now matches brand."],
		},
	});
	const plainFollowup = makeMessage("m-plain-1", threadId, {
		senderId: FOUNDER_ID,
		clientKey: "ck-plain-msg-001",
		createdAt: LATER,
		type: "plain",
		payload: { text: "Looking at this now." },
	});
	return {
		thread: makeThread(threadId, {
			hostKind: "team",
			hostId: "task-42",
			initiatorId: AGENT_ID,
			members: [AGENT_ID, FOUNDER_ID].sort(),
			lastActiveAt: LATER,
			createdAt: NOW,
		}),
		members: [makeIdentity(AGENT_ID, { isAgent: true }), makeIdentity(FOUNDER_ID)],
		// Server returns DESC by createdAt (most-recent first).
		messages: [plainFollowup, reviewMessage],
		headMessageId: "m-review-1",
		hostTitle: null,
	};
}

function plainOnlyThreadFixture(): {
	thread: ReturnType<typeof makeThread>;
	members: ReturnType<typeof makeIdentity>[];
	messages: Array<Record<string, unknown>>;
	headMessageId: null;
	hostTitle: null;
} {
	const threadId = "t-plain-1";
	const m = makeMessage("m-plain-only-1", threadId, {
		senderId: FOUNDER_ID,
		clientKey: "ck-plain-only-001",
		createdAt: NOW,
		type: "plain",
		payload: { text: "Quick question for the team." },
	});
	return {
		thread: makeThread(threadId, {
			hostKind: "user",
			hostId: FOUNDER_ID,
			initiatorId: FOUNDER_ID,
			members: [FOUNDER_ID, AGENT_ID].sort(),
			lastActiveAt: NOW,
			createdAt: NOW,
		}),
		members: [makeIdentity(FOUNDER_ID), makeIdentity(AGENT_ID, { isAgent: true })],
		messages: [m],
		headMessageId: null,
		hostTitle: null,
	};
}

function legacyBackCompatThreadFixture(): {
	thread: ReturnType<typeof makeThread>;
	members: ReturnType<typeof makeIdentity>[];
	messages: Array<Record<string, unknown>>;
	headMessageId: null;
	hostTitle: null;
} {
	// Migration projects legacy `kind='chat'` rows into `payload.text` by
	// concatenating `subject` and `body`. The fixture mirrors the post-
	// migration shape exactly.
	const threadId = "t-legacy-1";
	const m = makeMessage("m-legacy-1", threadId, {
		senderId: FOUNDER_ID,
		clientKey: "ck-legacy-mig-001",
		createdAt: NOW,
		type: "plain",
		payload: { text: "Legacy subject\n\nLegacy body content." },
	});
	return {
		thread: makeThread(threadId, {
			hostKind: "user",
			hostId: FOUNDER_ID,
			initiatorId: FOUNDER_ID,
			members: [FOUNDER_ID],
			lastActiveAt: NOW,
			createdAt: NOW,
		}),
		members: [makeIdentity(FOUNDER_ID)],
		messages: [m],
		headMessageId: null,
		hostTitle: null,
	};
}

// ---------------------------------------------------------------------------

test.describe("L11 — review-shape thread renders RichMessageCard inline", () => {
	test("card mounts inline; 5 verdict buttons in card footer; plain follow-up renders in stream", async ({
		page,
	}) => {
		const fixture = reviewThreadFixture();

		await page.route("**/api/actions/open_thread", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ ok: true, data: fixture }),
			});
		});

		await page.goto("/conversations/t-review-1");

		// ThreadShell mounted via the new fetch path.
		await expect(page.locator("[data-testid='thread-shell']")).toBeVisible();

		// L11: the in-stream RichMessageCard carries the review title.
		const card = page.locator("[data-testid='rich-message-card']");
		await expect(card).toBeVisible();
		await expect(card).toContainText("Approve copy update");

		// All 5 binding verdicts live in the card's action toolbar.
		const toolbar = card.getByRole("toolbar", { name: /verdict actions/i });
		await expect(toolbar.getByRole("button", { name: /^approve$/i })).toBeVisible();
		await expect(toolbar.getByRole("button", { name: /approve with comments/i })).toBeVisible();
		await expect(toolbar.getByRole("button", { name: /request changes/i })).toBeVisible();
		await expect(toolbar.getByRole("button", { name: /^edit$/i })).toBeVisible();
		await expect(toolbar.getByRole("button", { name: /reject/i })).toBeVisible();

		// The plain follow-up message renders in the stream as a CommentRow.
		await expect(page.getByText("Looking at this now.")).toBeVisible();
	});
});

test.describe("L1a — plain-shape thread (chat-only)", () => {
	test("a thread with no unresolved review/questionnaire renders chat-shape (no head)", async ({
		page,
	}) => {
		const fixture = plainOnlyThreadFixture();

		await page.route("**/api/actions/open_thread", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ ok: true, data: fixture }),
			});
		});

		await page.goto("/conversations/t-plain-1");

		// Shell mounts.
		await expect(page.locator("[data-testid='thread-shell']")).toBeVisible();

		// Head is absent (head=null when no unresolved review/questionnaire).
		// ThreadShell does not render a <ThreadHead> when headMessageId is null,
		// so the testid count is zero.
		await expect(page.locator("[data-testid='thread-head']")).toHaveCount(0);

		// The plain message renders as a CommentRow.
		const rows = page.locator("[data-testid='comment-row']");
		await expect(rows).toHaveCount(1);
		await expect(rows.first()).toContainText("Quick question for the team.");

		// Composer is mounted (chat-shape always has a composer at the floor).
		await expect(page.getByPlaceholder(/reply to thread/i)).toBeVisible();
	});
});

test.describe("L1a — back-compat (legacy review/chat collapse projection)", () => {
	test("legacy subject+body load through the new endpoint as payload.text", async ({ page }) => {
		const fixture = legacyBackCompatThreadFixture();

		await page.route("**/api/actions/open_thread", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ ok: true, data: fixture }),
			});
		});

		await page.goto("/conversations/t-legacy-1");

		await expect(page.locator("[data-testid='thread-shell']")).toBeVisible();

		// The migration concatenates subject+body into payload.text. We assert
		// both halves are visible, proving the projection round-trips through
		// the new endpoint and renders inline.
		const rows = page.locator("[data-testid='comment-row']");
		await expect(rows).toHaveCount(1);
		await expect(rows.first()).toContainText("Legacy subject");
		await expect(rows.first()).toContainText("Legacy body content.");
	});
});

test.describe("L1a — composer round-trips a plain message", () => {
	test("typing in the composer + clicking Send POSTs and renders the new message", async ({
		page,
	}) => {
		const before = plainOnlyThreadFixture();
		const composedText = "hello via L1";

		// State flag: GETs return `before` until a POST has been observed, then
		// `after`. This is robust against React StrictMode's effect-double-fire
		// (which counts as two GETs in dev mode) and any future intermediate
		// re-fetches the page may add.
		let postObserved = false;
		const newMessage = makeMessage("m-plain-only-2", "t-plain-1", {
			senderId: FOUNDER_ID,
			clientKey: "ck-plain-only-002",
			createdAt: LATER,
			type: "plain",
			payload: { text: composedText },
		});
		const after = {
			...before,
			messages: [newMessage, ...before.messages],
		};

		await page.route("**/api/actions/open_thread", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ ok: true, data: postObserved ? after : before }),
			});
		});

		await page.route("**/api/actions/send_message", async (route) => {
			postObserved = true;
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ ok: true, data: { message: newMessage, thread: before.thread } }),
			});
		});

		await page.goto("/conversations/t-plain-1");
		await expect(page.locator("[data-testid='thread-shell']")).toBeVisible();

		const composer = page.getByPlaceholder(/reply to thread/i);
		await composer.fill(composedText);
		await page.getByRole("button", { name: /^send$/i }).click();

		// The new message appears in the stream after the page re-fetches.
		await expect(page.getByText(composedText)).toBeVisible();
	});
});

test.describe("L1a — verdict click resolves the review and renders APPROVED", () => {
	test("clicking Approve POSTs a verdict and the verdict CommentRow + RESOLVED status appear", async ({
		page,
	}) => {
		const before = reviewThreadFixture();

		// State flag: GETs return `before` until a POST has been observed.
		// Robust against React StrictMode's double-effect.
		let postObserved = false;

		const verdictMessage = makeMessage("m-verdict-1", "t-review-1", {
			senderId: FOUNDER_ID,
			clientKey: "ck-verdict-msg-001",
			createdAt: LATER,
			type: "verdict",
			payload: {
				decision: "approve",
				resolvesMessageId: "m-review-1",
			},
		});
		const headResolved = {
			...before.messages[1],
			resolvedAt: LATER,
		};
		// After the verdict POST: resolved thread, head message resolved,
		// new verdict message in the stream → headMessageId flips to null.
		const after = {
			thread: { ...before.thread, resolvedAt: LATER },
			members: before.members,
			headMessageId: null,
			hostTitle: null,
			messages: [verdictMessage, before.messages[0], headResolved],
		};

		await page.route("**/api/actions/open_thread", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ ok: true, data: postObserved ? after : before }),
			});
		});

		await page.route("**/api/actions/send_message", async (route) => {
			postObserved = true;
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					ok: true,
					data: {
						message: verdictMessage,
						thread: { ...before.thread, resolvedAt: LATER },
					},
				}),
			});
		});

		await page.goto("/conversations/t-review-1");
		// L11: the promoted RichMessageCard mounts inline with the verdict toolbar.
		const card = page.locator("[data-testid='rich-message-card']");
		await expect(card).toBeVisible();
		await card.getByRole("button", { name: /^approve$/i }).click();

		// Verdict CommentRow appears (label "APPROVED" comes from
		// `verdictDecisionLabel('approve')`). After L11 the resolved card
		// also renders an APPROVED label, so .first() picks either.
		await expect(page.getByText("APPROVED").first()).toBeVisible();
		// Banner now carries the "Resolved" tag — thread.resolvedAt set.
		// Scope to ThreadShell + .first() to avoid the resolved-card label.
		await expect(
			page
				.locator("[data-testid='thread-shell']")
				.getByText(/^resolved$/i)
				.first(),
		).toBeVisible();
	});
});

// L1b deferrals — questionnaire UI (T1) and the re-open follow-up review
// affordance (no L1a UI surface) ship in L1b. They have their own e2e cases
// in L1b's plan.
