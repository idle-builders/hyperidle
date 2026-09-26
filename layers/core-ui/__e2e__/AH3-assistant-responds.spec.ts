/**
 * Journey: sending a message to the assistant with no API key configured
 * shows a guidance notice — never leaks secret material.
 *
 * @lore BC3: repointed at `POST /api/actions/{search_threads,open_thread,
 * send_message}` — never `GET /api/threads/assistant` (deleted; the overlay
 * resolves the assistant's thread via `useThreads({host:{kind:"agent",
 * id:myAgentId}})`, `myAgentId` found from `search_users({kind:"ai"})` by
 * `ownerUserId`).
 *
 * @lore BC5 T9/T11: `GET /api/auth/me` and `GET /api/agents` are gone —
 * `useCurrentUser` reads `open_user({})` (this file overrides the fixtures.ts
 * auto-use default with `mockUser({ self: true })`) and `useAgents` reads
 * `search_users({kind:"ai"})`.
 *
 * The real-model reply path needs a live API key and belongs to the harness
 * lane, not this mocked suite — it is not tested here.
 */
import {
	expect,
	makeIdentity,
	makeThreadListRow,
	makeUserRow,
	mockSearchThreads,
	mockSearchUsers,
	mockUser,
	test,
} from "./fixtures";

// ---------------------------------------------------------------------------
// Common scaffolding: assistant thread mock data
// ---------------------------------------------------------------------------

const FOUNDER_ROW = makeUserRow("test-founder", {
	name: "Test Founder",
	role: "founder",
});

const ASSISTANT_AGENT_ROW = makeUserRow("ast-test-founder", {
	kind: "ai",
	name: "Assistant",
	role: "assistant",
	ownerUserId: "test-founder",
	status: "active",
});

const WELCOME_TEXT = "Welcome to HyperIdle! I'm your assistant.";

const ASSISTANT_THREAD = {
	id: "t-assistant-ah3",
	hostKind: "agent",
	hostId: "ast-test-founder",
	initiatorId: "ast-test-founder",
	members: ["test-founder", "ast-test-founder"],
	title: null,
	computedTitle: "Assistant",
	pinned: false,
	resolvedAt: null,
	deletedAt: null,
	lastActiveAt: new Date().toISOString(),
	createdAt: new Date().toISOString(),
};

const ASSISTANT_THREAD_MEMBERS = [
	makeIdentity("test-founder", { name: "Test Founder", role: "founder" }),
	makeIdentity("ast-test-founder", { name: "Assistant", role: "assistant", isAgent: true }),
];

const ASSISTANT_THREAD_WITH_WELCOME = {
	thread: ASSISTANT_THREAD,
	members: ASSISTANT_THREAD_MEMBERS,
	messages: [
		{
			id: "msg-welcome-1",
			threadId: "t-assistant-ah3",
			senderId: "ast-test-founder",
			type: "plain",
			payload: { text: WELCOME_TEXT },
			clientKey: "ck-welcome-1",
			blockId: null,
			deletedAt: null,
			redactedAt: null,
			resolvedAt: null,
			createdAt: new Date(Date.now() - 60_000).toISOString(),
		},
	],
	headMessageId: "msg-welcome-1",
	hostTitle: null,
};

// ---------------------------------------------------------------------------
// Scenario: no valid key → send message → missing_key notice visible
// ---------------------------------------------------------------------------

test.describe("AH3: no-key path → missing_key notice in overlay", () => {
	test.beforeEach(async ({ page }) => {
		// open_user({}) as set up (user exists)
		await mockUser(page, { row: FOUNDER_ROW, self: true });

		// search_users({kind:"ai"}) — myAgentId resolution (AssistantOverlay
		// finds its own agent by ownerUserId).
		await mockSearchUsers(page, { rows: [ASSISTANT_AGENT_ROW] });

		// search_threads({host:{kind:"agent",id:"ast-test-founder"}}) — the
		// overlay's existing-thread lookup.
		await mockSearchThreads(page, {
			rows: [
				makeThreadListRow(ASSISTANT_THREAD.id, { ...ASSISTANT_THREAD, hasUnresolvedReview: false }),
			],
		});

		// Simulate the server returning a missing_key notice message after send
		// (the real server does this when no credential is configured)
		// @lore AH3: after the send, the overlay re-runs open_thread and shows
		// the notice. This proves the overlay renders the notice correctly.
		// The real-model path (AH5) doesn't need this mock.
		let sendCount = 0;
		await page.route("**/api/actions/send_message", async (route) => {
			sendCount++;
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					ok: true,
					data: {
						message: { id: "msg-ah3-1", threadId: ASSISTANT_THREAD.id },
						thread: ASSISTANT_THREAD,
					},
				}),
			});
		});
		// The welcome-thread load AND its post-send refresh, both through open_thread.
		await page.route("**/api/actions/open_thread", async (route) => {
			const threadData =
				sendCount === 0
					? ASSISTANT_THREAD_WITH_WELCOME
					: {
							...ASSISTANT_THREAD_WITH_WELCOME,
							messages: [
								...ASSISTANT_THREAD_WITH_WELCOME.messages,
								{
									id: "msg-ah3-notice-1",
									threadId: ASSISTANT_THREAD.id,
									senderId: "ast-test-founder",
									type: "plain",
									payload: {
										text: "I can't think yet — no API key is configured. Add your Anthropic key in Settings → Credentials.",
										notice: { kind: "missing_key" },
									},
									clientKey: "ck-notice-1",
									blockId: null,
									deletedAt: null,
									redactedAt: null,
									resolvedAt: null,
									createdAt: new Date().toISOString(),
								},
							],
						};
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ ok: true, data: threadData }),
			});
		});
	});

	test("send message with no key → missing_key guidance notice visible in overlay", async ({
		page,
	}) => {
		await page.goto("/");

		// Open the assistant overlay (trigger button)
		const assistantTrigger = page.getByRole("button", { name: /assistant/i });
		await assistantTrigger.click();

		// Overlay opens with welcome message
		await expect(page.getByText(WELCOME_TEXT)).toBeVisible();

		// Type and send a message
		const composer = page.getByRole("textbox");
		await composer.fill("Hello, can you help me?");
		await composer.press("Enter");

		// After send + refresh, the notice should appear
		await expect(page.getByText(/no api key/i)).toBeVisible({ timeout: 5000 });

		// Must have a Settings → Credentials affordance
		await expect(page.getByText(/credentials/i)).toBeVisible();

		// Notice must NOT contain any secret material
		const noticeText = await page.getByText(/no api key/i).textContent();
		expect(noticeText).not.toContain("sk-");
		expect(noticeText).not.toContain("ANTHROPIC_API_KEY");
	});
});
