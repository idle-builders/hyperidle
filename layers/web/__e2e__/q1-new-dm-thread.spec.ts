/**
 * Q1 E2E — AC1 / AC2 / AC3 / AC4: New DM thread creation via recipient picker.
 *
 * Acceptance criteria:
 * 1. A "new thread" action is accessible from the Conversations view.
 * 2. Action opens a recipient picker with users and agents.
 * 3. Selecting a recipient + sending creates a DM thread via POST /api/threads.
 * 4. New thread appears in the Conversations submenu thread list immediately.
 */

import { expect, test } from "./fixtures";

const NOW_ISO = new Date().toISOString();

const MOCK_RECIPIENTS = [
	{
		id: "agent-builder",
		kind: "agent",
		name: "Builder Bot",
		role: "builder",
		status: "active",
		hasActiveSession: false,
		avatarUrl: null,
	},
	{
		id: "agent-growth",
		kind: "agent",
		name: "Growth Engine",
		role: "growth",
		status: "idle",
		hasActiveSession: false,
		avatarUrl: null,
	},
	{
		id: "user-founder",
		kind: "user",
		name: "Founder",
		role: "founder",
		status: "active",
		hasActiveSession: false,
		avatarUrl: null,
	},
];

const CREATED_THREAD = {
	id: "new-dm-thread-id",
	hostKind: "agent",
	hostId: "agent-builder",
	initiatorId: "test-founder",
	participants: ["test-founder", "agent-builder"],
	pinned: false,
	resolvedAt: null,
	lastActiveAt: NOW_ISO,
	createdAt: NOW_ISO,
	hasUnresolvedReview: false,
};

test.describe("Q1 — New DM Thread Creation", () => {
	test.beforeEach(async ({ page }) => {
		// Mock recipients endpoint
		await page.route("**/api/recipients**", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ recipients: MOCK_RECIPIENTS }),
			});
		});

		// Mock POST /api/threads
		await page.route("**/api/threads", async (route) => {
			if (route.request().method() === "POST") {
				await route.fulfill({
					status: 201,
					contentType: "application/json",
					body: JSON.stringify({
						thread: CREATED_THREAD,
						messages: [],
					}),
				});
			} else {
				await route.continue();
			}
		});

		// Mock thread list to include the new thread after creation
		await page.route("**/api/threads?**", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					threads: [
						{
							...CREATED_THREAD,
							id: "new-dm-thread-id",
						},
					],
					nextCursor: null,
				}),
			});
		});

		// Mock thread detail fetch
		await page.route("**/api/threads/new-dm-thread-id", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					thread: CREATED_THREAD,
					messages: [],
					headMessageId: null,
					nextMessagesCursor: null,
					identities: {},
				}),
			});
		});
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
	test("AC3: selecting recipient and sending creates DM thread via POST /api/threads", async ({
		page,
	}) => {
		const threadCreationRequests: unknown[] = [];

		// Override thread POST to capture request body
		await page.route("**/api/threads", async (route) => {
			if (route.request().method() === "POST") {
				const body = route.request().postDataJSON();
				threadCreationRequests.push(body);
				await route.fulfill({
					status: 201,
					contentType: "application/json",
					body: JSON.stringify({
						thread: CREATED_THREAD,
						messages: [],
					}),
				});
			} else {
				await route.continue();
			}
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
