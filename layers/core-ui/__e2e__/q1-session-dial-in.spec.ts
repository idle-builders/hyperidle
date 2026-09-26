/**
 * Q1 E2E — AC7: interjection posts a message to a task thread; inline
 * document reference keeps the composer draft when opened and closed.
 *
 * @lore BC3: the thread door is `POST /api/actions/{search_threads,
 * open_thread, send_message}` — never `GET/POST /api/threads*`. There is no
 * `task` host kind; a task's own thread is `team`-hosted (architecture.md
 * §3.9) and `Thread.members` replaced `participants`.
 *
 * @lore BC3: AC5/AC6/AC8/AC9 (the "Dial In" affordance from the generic
 * Conversations view) are deleted, not repointed. `Conversations.tsx` no
 * longer has any active-session lookup for the generic view — that
 * affordance is retired; the task page (WorkTaskPage) shows its own active
 * sessions directly (see the BC3 build report). AC7 (interjection) and the WS
 * thread-list refresh survive — neither depends on it.
 *
 * @lore artifacts-become-knowledge: the inline "artifact" reference this test
 * used to click (`kind:"artifact"` InlineRef) renders as a non-navigating
 * label now (part.ts's `inlineRefToEmbed`) — a review canvas anchor, not a
 * navigable target. A `document` EntityRef is the surviving inline reference
 * that opens inline (`onInspectPath` → the conversation's own split pane), so
 * this test now exercises that instead of the deleted artifact route.
 */

import {
	expect,
	makeDocumentRow,
	makeIdentity,
	makeMessage,
	makeThread,
	mockDocument,
	mockSearchThreads,
	mockThread,
	test,
} from "./fixtures";

const NOW_ISO = new Date().toISOString();

const TASK_THREAD = makeThread("task-thread-id", {
	hostKind: "team",
	hostId: "team-1",
	initiatorId: "agent-1",
	members: ["test-founder", "agent-1"],
	lastActiveAt: NOW_ISO,
	createdAt: NOW_ISO,
});

const THREAD_MEMBERS = [
	makeIdentity("test-founder", { name: "Test Founder", role: "founder" }),
	makeIdentity("agent-1", { name: "Builder Bot", role: "builder", isAgent: true }),
];

const DOCUMENT_ID = "inline-inspect-document";
const THREAD_MESSAGES = [
	...Array.from({ length: 24 }, (_, index) =>
		makeMessage(`context-${index}`, TASK_THREAD.id, {
			senderId: "agent-1",
			clientKey: `context-key-${index}`,
			payload: { text: `Preserved conversation context line ${index + 1}.`, refs: [] },
			createdAt: NOW_ISO,
		}),
	),
	makeMessage("document-reference", TASK_THREAD.id, {
		senderId: "agent-1",
		clientKey: "document-reference-key",
		payload: {
			text: "Inspect the referenced document without leaving this thread.",
			refs: [{ kind: "document", id: DOCUMENT_ID }],
		},
		createdAt: NOW_ISO,
	}),
];

test.describe("Q1 — task thread composer + inline document inspect", () => {
	test.beforeEach(async ({ page }) => {
		await mockSearchThreads(page, {
			rows: [{ ...TASK_THREAD, hasUnresolvedReview: false, lastMessagePreview: null }],
		});

		await mockThread(page, {
			thread: TASK_THREAD,
			members: THREAD_MEMBERS,
			messages: THREAD_MESSAGES,
		});

		await mockDocument(page, {
			row: makeDocumentRow(DOCUMENT_ID, {
				title: "Referenced document",
				body: "Inline pane body.",
			}),
		});
	});

	// The mobile compact layout is the one that proves the split view actually
	// folds/unfolds (desktop keeps both panes mounted side-by-side) — a real
	// browser is required because jsdom does no layout.
	test("inline document Inspect preserves the live thread draft and scroll position", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 375, height: 812 });
		await page.goto("/conversations/task-thread-id");
		await expect(page.getByTestId("conversation-surface")).toBeVisible();

		const draft = page.locator("[data-testid='conversation-surface'] textarea");
		await draft.fill("Draft that must survive Inspect");
		const scroll = page.locator("[data-testid='conversation-surface'] main > div").first();
		await scroll.evaluate((node) => {
			node.scrollTop = Math.max(1, node.scrollHeight - node.clientHeight - 20);
		});
		const beforeScroll = await scroll.evaluate((node) => node.scrollTop);

		await page.getByRole("button", { name: `Open ${DOCUMENT_ID}` }).click();
		await expect(page).toHaveURL(/\/conversations\/task-thread-id$/);
		await expect(page.getByText("Inline pane body.")).toBeVisible();

		const backButton = page.getByRole("button", { name: "Back to conversation" });
		await expect(backButton).toBeVisible();
		await backButton.click();

		await expect(draft).toHaveValue("Draft that must survive Inspect");
		expect(Math.abs((await scroll.evaluate((node) => node.scrollTop)) - beforeScroll)).toBeLessThan(
			12,
		);
	});

	// AC7: interjection — user can post a message via the thread composer
	test("AC7: interjection posts a message to the task thread", async ({ page }) => {
		let postCalled = false;
		await page.route("**/api/actions/send_message", async (route) => {
			postCalled = true;
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					ok: true,
					data: {
						message: makeMessage("msg-interject", TASK_THREAD.id, {
							senderId: "test-founder",
							clientKey: "ck-interject",
							payload: { text: "Interject this" },
							createdAt: NOW_ISO,
						}),
						thread: TASK_THREAD,
					},
				}),
			});
		});

		await page.goto("/conversations/task-thread-id");
		await expect(page.getByTestId("conversation-surface")).toBeVisible();

		const composer = page.locator("[data-testid='conversation-surface'] textarea");
		await composer.fill("Interject this");
		await page.getByRole("button", { name: /^send$/i }).click();

		await expect.poll(() => postCalled).toBe(true);
		await expect(page.getByText("Interject this")).toBeVisible();
	});
});
