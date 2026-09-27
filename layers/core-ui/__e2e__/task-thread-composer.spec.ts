/**
 * Journeys: posting a message via a task thread's composer, and inline
 * document Inspect preserving the live draft and scroll position when
 * opened and closed.
 *
 * @lore an artifact inline reference now renders as a non-navigating label — a document reference is the surviving inline reference.
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

test.describe("task thread composer and inline document inspect", () => {
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
			25,
		);
	});

	test("posting a message via the thread composer", async ({ page }) => {
		let postCalled = false;
		const interjectMessage = makeMessage("msg-interject", TASK_THREAD.id, {
			senderId: "test-founder",
			clientKey: "ck-interject",
			payload: { text: "Interject this" },
			createdAt: NOW_ISO,
		});

		await page.route("**/api/actions/send_message", async (route) => {
			postCalled = true;
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					ok: true,
					data: { message: interjectMessage, thread: TASK_THREAD },
				}),
			});
		});
		// onSend() refetches via open_thread after a successful send (never
		// trusts send_message's own response for the rendered list) — override
		// the beforeEach's fixed fixture so the refetch actually carries the
		// new message.
		await page.route("**/api/actions/open_thread", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					ok: true,
					data: {
						thread: TASK_THREAD,
						members: THREAD_MEMBERS,
						messages: postCalled ? [...THREAD_MESSAGES, interjectMessage] : THREAD_MESSAGES,
						headMessageId: null,
						hostTitle: null,
					},
				}),
			});
		});

		await page.goto("/conversations/task-thread-id");
		await expect(page.getByTestId("conversation-surface")).toBeVisible();

		const composer = page.locator("[data-testid='conversation-surface'] textarea");
		await composer.fill("Interject this");
		await page.getByRole("button", { name: /send message/i }).click();

		await expect.poll(() => postCalled).toBe(true);
		await expect(page.getByText("Interject this")).toBeVisible();
	});
});
