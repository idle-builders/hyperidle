/**
 * Q1 E2E — AC1 / AC2 / AC3 / AC4: New DM thread creation via recipient picker.
 *
 * Acceptance criteria:
 * 1. A "new thread" action is accessible from the Conversations view.
 * 2. Action opens a recipient picker with users and agents.
 * 3. Selecting a recipient + sending creates a DM thread via
 *    POST /api/actions/send_message ({recipients, text}) — one call creates
 *    the thread and sends the first message; there is no separate
 *    thread-create door.
 * 4. New thread appears in the Conversations submenu thread list immediately.
 *
 * @lore BC3: repointed at the thread action door — never `POST /api/threads`.
 */

import {
	expect,
	makeThread,
	makeThreadListRow,
	makeUserRow,
	mockSearchSessions,
	mockSearchThreads,
	mockSearchUsers,
	mockThread,
	test,
} from "./fixtures";

const NOW_ISO = new Date().toISOString();

// @lore BC5 T9: `GET /api/recipients` is gone — `useRecipients` reads
// `search_users({status:"active"})`, mapping `kind` ("human"|"ai") onto the
// picker's own vocabulary ("user"|"agent").
// `useRecipients` queries `search_users({status:"active", ...})` — every row
// here is "active" so the real filter doesn't silently drop one.
const MOCK_RECIPIENTS = [
	makeUserRow("agent-builder", { kind: "ai", name: "Builder Bot", role: "builder" }),
	makeUserRow("agent-growth", { kind: "ai", name: "Growth Engine", role: "growth" }),
	makeUserRow("user-founder", { kind: "human", name: "Founder", role: "founder" }),
];

const CREATED_THREAD = makeThread("new-dm-thread-id", {
	hostKind: "agent",
	hostId: "agent-builder",
	initiatorId: "test-founder",
	members: ["test-founder", "agent-builder"],
	lastActiveAt: NOW_ISO,
	createdAt: NOW_ISO,
});

test.describe("Q1 — New DM Thread Creation", () => {
	test.beforeEach(async ({ page }) => {
		// Mock the recipient picker's data source.
		await mockSearchUsers(page, { rows: MOCK_RECIPIENTS });
		await mockSearchSessions(page, { rows: [] });

		// Mock send_message ({recipients, text}) — creates the thread and sends
		// the first message in one call; there is no separate thread-create door.
		await page.route("**/api/actions/send_message", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					ok: true,
					data: {
						message: {
							id: "msg-new-dm-001",
							threadId: CREATED_THREAD.id,
							senderId: "test-founder",
							type: "plain",
							payload: { text: "Hello from test" },
							clientKey: "ck-new-dm-001",
							blockId: null,
							resolvedAt: null,
							deletedAt: null,
							redactedAt: null,
							createdAt: NOW_ISO,
						},
						thread: CREATED_THREAD,
					},
				}),
			});
		});

		// Mock thread list to include the new thread after creation
		await mockSearchThreads(page, {
			rows: [
				makeThreadListRow(CREATED_THREAD.id, { ...CREATED_THREAD, hasUnresolvedReview: false }),
			],
		});

		// Mock thread detail fetch
		await mockThread(page, { thread: CREATED_THREAD, messages: [] });
	});

	// AC1: "new thread" action is accessible from Conversations view
	test("AC1: 'New Thread' button is visible in the Conversations submenu", async ({ page }) => {
		await page.goto("/conversations");
		await page.waitForLoadState("networkidle");

		// A button or affordance labelled "New Thread" (or similar) should be visible
		const newThreadBtn = page.locator("button").filter({ hasText: /new thread/i });
		await expect(newThreadBtn.first()).toBeVisible({ timeout: 10000 });
	});

	// AC2: clicking "New Thread" opens recipient picker with search + agent/user list
	test("AC2: recipient picker opens with search and recipient list", async ({ page }) => {
		await page.goto("/conversations");
		await page.waitForLoadState("networkidle");

		const newThreadBtn = page
			.locator("button")
			.filter({ hasText: /new thread/i })
			.first();
		await newThreadBtn.click();

		// Recipient picker should show search field
		await expect(page.locator("input[type='text'], input[type='search']").first()).toBeVisible({
			timeout: 5000,
		});

		// Recipients should be listed
		await expect(page.getByText("Builder Bot")).toBeVisible({ timeout: 5000 });
		await expect(page.getByText("Growth Engine")).toBeVisible({ timeout: 5000 });
	});

	// AC3: selecting a recipient + sending creates a thread
	test("AC3: selecting recipient and sending creates DM thread via send_message", async ({
		page,
	}) => {
		const threadCreationRequests: unknown[] = [];

		// Override send_message to capture request body
		await page.route("**/api/actions/send_message", async (route) => {
			const body = route.request().postDataJSON();
			threadCreationRequests.push(body);
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					ok: true,
					data: {
						message: {
							id: "msg-new-dm-001",
							threadId: CREATED_THREAD.id,
							senderId: "test-founder",
							type: "plain",
							payload: { text: "Hello from test" },
							clientKey: "ck-new-dm-001",
							blockId: null,
							resolvedAt: null,
							deletedAt: null,
							redactedAt: null,
							createdAt: NOW_ISO,
						},
						thread: CREATED_THREAD,
					},
				}),
			});
		});

		await page.goto("/conversations");
		await page.waitForLoadState("networkidle");

		const newThreadBtn = page
			.locator("button")
			.filter({ hasText: /new thread/i })
			.first();
		await newThreadBtn.click();

		// Wait for picker to load recipients
		await expect(page.getByText("Builder Bot")).toBeVisible({ timeout: 5000 });

		// Click the recipient
		await page.getByText("Builder Bot").click();

		// Type a message
		const messageInput = page.locator("textarea, input[type='text']").last();
		await messageInput.fill("Hello from test");

		// Send it
		await page.locator("button").filter({ hasText: /send/i }).click();

		// The thread creation POST should have been made — wait for navigation to complete
		await page.waitForURL(/\/conversations\//, { timeout: 5000 });
		expect(threadCreationRequests.length).toBeGreaterThan(0);
	});

	// AC4: new thread appears in thread list after creation
	test("AC4: new thread appears in Conversations submenu list after creation", async ({ page }) => {
		await page.goto("/conversations");
		await page.waitForLoadState("networkidle");

		// The mocked thread list includes the new-dm-thread-id row
		// Verify it renders in the thread list
		await expect(page.locator("[data-ds-component='ThreadRow']").first()).toBeVisible({
			timeout: 5000,
		});
	});

	// AC1: keyboard shortcut N opens recipient picker (when not inside a text input)
	test("AC1: keyboard shortcut N opens the recipient picker", async ({ page }) => {
		await page.goto("/conversations");
		await page.waitForLoadState("networkidle");

		// Click on the main content area (not a text input) to ensure focus is there
		await page.locator("[data-testid='main-content']").click({ force: true });

		// Press N to open recipient picker
		await page.keyboard.press("n");

		// Picker should appear — check for the search field or recipient-picker testid
		const picker = page.locator("[data-testid='recipient-picker']");
		await expect(picker).toBeVisible({ timeout: 3000 });
	});
});
