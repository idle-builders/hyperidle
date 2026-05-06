/**
 * L21 — CoC Overlay E2E (RED phase).
 *
 * Full flow acceptance criteria:
 *   AC-E1: CoC trigger is visible in the Rail on any page.
 *   AC-E2: Clicking the trigger opens the CoC overlay.
 *   AC-E3: Overlay shows ThreadShell in coach configuration.
 *   AC-E4: User can add a bet as context — chip appears in overlay.
 *   AC-E5: User can type a question in the composer and send it.
 *   AC-E6: Message persists in the overlay (renders in the thread stream).
 *   AC-E7: Closing the overlay (Escape) hides it.
 *   AC-E8: Coach thread appears in the Conversations submenu after use.
 *   AC-E9: Overlay state persists across navigation (not destroyed when navigating).
 *
 * Strategy: page.route() mocks for all API calls. No real DB or server needed.
 *
 * @lore L21: The overlay does NOT close on clicking outside (Main content),
 * so the user can interact with Main to select context items while the overlay
 * remains open. Only Escape and clicking the trigger again close it.
 */

import { expect, test } from "@playwright/test";

const NOW_ISO = new Date().toISOString();
const COACH_THREAD_ID = "thr-coach-u-founder";
const COC_AGENT_ID = "agent-coc";
const BET_ID = "seed-bet-daily-digest";

const COACH_THREAD_FIXTURE = {
	thread: {
		id: COACH_THREAD_ID,
		hostKind: "user",
		hostId: "u-founder",
		initiatorId: "u-founder",
		participants: ["u-founder", COC_AGENT_ID],
		pinned: true,
		resolvedAt: null,
		lastActiveAt: NOW_ISO,
		createdAt: NOW_ISO,
	},
	messages: [],
	headMessageId: null,
	identities: {
		"u-founder": { name: "You" },
		[COC_AGENT_ID]: { name: "Chief of Staff", role: "chief_of_staff" },
	},
};

const BET_FIXTURE = {
	id: BET_ID,
	title: "Daily Digest",
	product: "Nimmly",
	team: "Alpha Core",
	status: "shaped",
	appetite: "small",
	progress: { done: 0, total: 1 },
	pitch: "A bet about daily digest.",
	tasks: [],
	comments: [],
};

const THREADS_LIST_FIXTURE = {
	threads: [
		{
			id: COACH_THREAD_ID,
			hostKind: "user",
			hostId: "u-founder",
			initiatorId: "u-founder",
			participants: ["u-founder", COC_AGENT_ID],
			pinned: true,
			resolvedAt: null,
			lastActiveAt: NOW_ISO,
			createdAt: NOW_ISO,
			hasUnresolvedReview: false,
		},
	],
	nextCursor: null,
};

/** Set up mock API routes used by all CoC tests. */
async function setupApiMocks(page: import("@playwright/test").Page): Promise<void> {
	// Mock GET /api/threads/coach — resolves the coach thread.
	await page.route("**/api/threads/coach", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify(COACH_THREAD_FIXTURE),
		});
	});

	// Mock GET /api/threads list (Conversations submenu).
	await page.route("**/api/threads?**", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify(THREADS_LIST_FIXTURE),
		});
	});

	// Mock GET /api/threads/:id (individual thread detail).
	await page.route("**/api/threads/*", async (route) => {
		const url = route.request().url();
		// Don't intercept the /coach sub-route (already handled above).
		if (url.includes("/coach")) {
			await route.continue();
			return;
		}
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify(COACH_THREAD_FIXTURE),
		});
	});

	// Mock POST /api/threads/:id/messages — message send.
	await page.route("**/api/threads/*/messages", async (route) => {
		if (route.request().method() !== "POST") {
			await route.continue();
			return;
		}
		const requestBody = route.request().postDataJSON() as { payload?: { text?: string } } | null;
		const text = requestBody?.payload?.text ?? "sent";
		await route.fulfill({
			status: 201,
			contentType: "application/json",
			body: JSON.stringify({
				message: {
					id: `msg-${Date.now()}`,
					threadId: COACH_THREAD_ID,
					senderId: "u-founder",
					clientKey: `key-${Date.now()}`,
					type: "plain",
					payload: { text },
					createdAt: NOW_ISO,
					deletedAt: null,
					redactedAt: null,
					resolvedAt: null,
				},
			}),
		});
	});

	// Mock GET /api/bets/:id (for context attachment test).
	await page.route(`**/api/bets/${BET_ID}`, async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify(BET_FIXTURE),
		});
	});

	// Mock other API endpoints to prevent noise.
	await page.route("**/api/**", async (route) => {
		if (
			!(
				route.request().url().includes("api/threads") ||
				route.request().url().includes(`api/bets/${BET_ID}`)
			)
		) {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({}),
			});
		} else {
			await route.continue();
		}
	});
}

test.describe("L21 — CoC Overlay E2E", () => {
	test.beforeEach(async ({ page }) => {
		await setupApiMocks(page);
	});

	test("AC-E1: CoC trigger button is visible in the Rail on the conversations page", async ({
		page,
	}) => {
		await page.goto("/conversations");

		// The CoC trigger button must be visible in the Rail.
		const trigger = page.getByRole("button", { name: /chief of staff/i });
		await expect(trigger).toBeVisible();
	});

	test("AC-E1: CoC trigger is visible on the work page too (persistent across views)", async ({
		page,
	}) => {
		await page.goto("/work/portfolio");

		const trigger = page.getByRole("button", { name: /chief of staff/i });
		await expect(trigger).toBeVisible();
	});

	test("AC-E2: clicking the trigger opens the CoC overlay", async ({ page }) => {
		await page.goto("/conversations");

		// Overlay must not be present initially.
		await expect(page.getByRole("dialog", { name: /chief of staff conversation/i })).toHaveCount(0);

		// Click the trigger.
		const trigger = page.getByRole("button", { name: /chief of staff/i });
		await trigger.click();

		// Overlay must now be present.
		await expect(page.getByRole("dialog", { name: /chief of staff conversation/i })).toBeVisible();
	});

	test("AC-E3: overlay shows ThreadShell in coach configuration (empty thread empty state)", async ({
		page,
	}) => {
		await page.goto("/conversations");

		const trigger = page.getByRole("button", { name: /chief of staff/i });
		await trigger.click();

		// ThreadShell is mounted inside the dialog.
		const dialog = page.getByRole("dialog", { name: /chief of staff conversation/i });
		await expect(dialog).toBeVisible();

		// ThreadShell empty state shows when no messages.
		await expect(dialog.getByText(/no messages yet/i)).toBeVisible();

		// Composer is present.
		await expect(dialog.getByPlaceholder(/reply to thread/i)).toBeVisible();
	});

	test("AC-E4: user can add a bet as context — chip appears in overlay", async ({ page }) => {
		// Navigate to a bet page so a BetCard is visible in Main.
		await page.goto(`/work/bet/${BET_ID}`);

		// Open the CoC overlay first.
		const trigger = page.getByRole("button", { name: /chief of staff/i });
		await trigger.click();

		const dialog = page.getByRole("dialog", { name: /chief of staff conversation/i });
		await expect(dialog).toBeVisible();

		// When the overlay is open, a "+" attach button should appear on the BetCard in Main.
		// The BetCard is rendered in the Main area at /work/bet/:id.
		const attachButton = page.getByRole("button", { name: /add.*context|attach/i });
		await expect(attachButton).toBeVisible();

		// Click the attach button.
		await attachButton.click();

		// A context chip for the bet should now appear in the overlay.
		await expect(dialog.getByText("Daily Digest")).toBeVisible();
		await expect(dialog.getByTestId("coc-context-chips")).toBeVisible();
	});

	test("AC-E5 + AC-E6: user types a question and it appears in the thread stream", async ({
		page,
	}) => {
		await page.goto("/conversations");

		const trigger = page.getByRole("button", { name: /chief of staff/i });
		await trigger.click();

		const dialog = page.getByRole("dialog", { name: /chief of staff conversation/i });
		await expect(dialog).toBeVisible();

		// Type a question in the composer.
		const composer = dialog.getByPlaceholder(/reply to thread/i);
		await composer.fill("What is the status of the bet?");

		// Submit the message.
		await composer.press("Enter");

		// The message should appear in the thread stream after send.
		await expect(dialog.getByText("What is the status of the bet?")).toBeVisible();
	});

	test("AC-E7: pressing Escape closes the overlay", async ({ page }) => {
		await page.goto("/conversations");

		const trigger = page.getByRole("button", { name: /chief of staff/i });
		await trigger.click();

		await expect(page.getByRole("dialog", { name: /chief of staff conversation/i })).toBeVisible();

		// Press Escape.
		await page.keyboard.press("Escape");

		// Overlay must be hidden.
		await expect(page.getByRole("dialog", { name: /chief of staff conversation/i })).toHaveCount(0);
	});

	test("AC-E7: clicking the trigger again closes the overlay", async ({ page }) => {
		await page.goto("/conversations");

		const trigger = page.getByRole("button", { name: /chief of staff/i });
		await trigger.click();

		await expect(page.getByRole("dialog", { name: /chief of staff conversation/i })).toBeVisible();

		// Click trigger again to close.
		await trigger.click();

		await expect(page.getByRole("dialog", { name: /chief of staff conversation/i })).toHaveCount(0);
	});

	test("AC-E8: coach thread appears in Conversations submenu after overlay is opened", async ({
		page,
	}) => {
		await page.goto("/conversations");

		// The coach thread should appear in the Conversations submenu.
		// It is pinned so it appears at the top of the active section.
		await page.waitForSelector("[data-ds-component='ThreadRow']");
		const coachThreadRow = page.locator("[data-ds-component='ThreadRow']").filter({
			hasText: /chief of staff/i,
		});
		await expect(coachThreadRow).toBeVisible();
	});

	test("AC-E9: overlay state persists across view navigation (not destroyed on navigate)", async ({
		page,
	}) => {
		await page.goto("/conversations");

		// Open the overlay.
		const trigger = page.getByRole("button", { name: /chief of staff/i });
		await trigger.click();
		await expect(page.getByRole("dialog", { name: /chief of staff conversation/i })).toBeVisible();

		// Navigate to the Work view.
		const workButton = page.getByRole("button", { name: /work/i });
		await workButton.click();

		// The overlay must still be visible after navigation.
		await expect(page.getByRole("dialog", { name: /chief of staff conversation/i })).toBeVisible();
	});

	test("trigger aria-expanded reflects overlay state", async ({ page }) => {
		await page.goto("/conversations");

		const trigger = page.getByRole("button", { name: /chief of staff/i });

		// Before opening: aria-expanded=false.
		await expect(trigger).toHaveAttribute("aria-expanded", "false");

		// Open the overlay.
		await trigger.click();

		// After opening: aria-expanded=true.
		await expect(trigger).toHaveAttribute("aria-expanded", "true");
	});

	test("clicking outside the overlay (Main content) does NOT close the overlay", async ({
		page,
	}) => {
		await page.goto("/conversations");

		const trigger = page.getByRole("button", { name: /chief of staff/i });
		await trigger.click();

		await expect(page.getByRole("dialog", { name: /chief of staff conversation/i })).toBeVisible();

		// Click somewhere in the main content area.
		const mainContent = page.getByTestId("main-content");
		await mainContent.click({ position: { x: 10, y: 10 } });

		// Overlay must still be visible.
		await expect(page.getByRole("dialog", { name: /chief of staff conversation/i })).toBeVisible();
	});
});
