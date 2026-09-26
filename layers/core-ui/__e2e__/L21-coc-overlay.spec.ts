/**
 * L21 — CoC Overlay E2E (RED phase).
 *
 * Full flow acceptance criteria:
 *   AC-E1: CoC trigger is visible in the sidebar on any page.
 *   AC-E2: Clicking the trigger opens the CoC overlay.
 *   AC-E3: Overlay shows ThreadShell in assistant configuration.
 *   AC-E4: User can add a bet as context — chip appears in overlay.
 *   AC-E5: User can type a question in the composer and send it.
 *   AC-E6: Message persists in the overlay (renders in the thread stream).
 *   AC-E7: Closing the overlay (Escape) hides it.
 *   AC-E8: Assistant thread appears in the Conversations submenu after use.
 *   AC-E9: Overlay state persists across navigation (not destroyed when navigating).
 *
 * Strategy: page.route() mocks for all API calls. No real DB or server needed.
 *
 * @lore L21: The overlay does NOT close on clicking outside (Main content),
 * so the user can interact with Main to select context items while the overlay
 * remains open. Only Escape and clicking the trigger again close it.
 *
 * @lore BC3: repointed at `POST /api/actions/{search_threads,open_thread,
 * send_message}` — never `GET/POST /api/threads*`. `Thread.members` replaced
 * `participants`.
 *
 * @lore BC3 review fix, BC5 T9: the overlay resolves "my agent" via
 * `search_users({ kind: "ai" })` (`ownerUserId === <viewer id>`,
 * AssistantOverlay.tsx) before it ever reaches `search_threads`/
 * `open_thread` — without that mock every CoC test saw the "Couldn't find
 * your assistant agent." empty state. The viewer id is `"test-founder"`, the
 * fixtures.ts auto-use `open_user({})` default — this spec never overrides
 * it. Conversations-submenu titles come straight from `computedTitle`
 * (server-computed, `AppShell.tsx`'s `rowToItem`) — there is no client-side
 * "${hostKind} thread" derivation any more, so the fixture must spell out a
 * title itself rather than rely on a generated one.
 */

import {
	expect,
	makeAgentConfig,
	makeIdentity,
	makeMessage,
	makeThread,
	makeThreadListRow,
	makeUserRow,
	test,
} from "./fixtures";

const NOW_ISO = new Date().toISOString();
const COACH_THREAD_ID = "thr-coach-u-founder";
const COC_AGENT_ID = "agent-coc";
const CURRENT_USER_ID = "test-founder";
const BET_ID = "seed-bet-daily-digest";

const COC_AGENT = makeAgentConfig(COC_AGENT_ID, {
	name: "Assistant",
	role: "assistant",
	ownerUserId: CURRENT_USER_ID,
});

const COACH_THREAD = makeThread(COACH_THREAD_ID, {
	hostKind: "user",
	hostId: "u-founder",
	initiatorId: "u-founder",
	members: ["u-founder", COC_AGENT_ID],
	pinned: true,
	// @lore BC3 review fix: title-ladder text ("Assistant"/DM name/etc.) is
	// server-computed — the mock spells out its own value. AC-E8 asserts a
	// "user thread" row in the Conversations submenu, so this fixture's
	// title carries that text rather than the (unused) generic default.
	computedTitle: "User thread thr-coach-u-founder",
	lastActiveAt: NOW_ISO,
	createdAt: NOW_ISO,
});

const COACH_THREAD_MEMBERS = [
	makeIdentity("u-founder", { name: "You" }),
	makeIdentity(COC_AGENT_ID, { name: "System Agent", role: "assistant", isAgent: true }),
];

const THREADS_LIST_FIXTURE = [
	makeThreadListRow(COACH_THREAD_ID, { ...COACH_THREAD, hasUnresolvedReview: false }),
];

/** Set up mock API routes used by all CoC tests. */
async function setupApiMocks(page: import("@playwright/test").Page): Promise<void> {
	// Sent messages accumulate here so a `send_message` → `refresh()` →
	// `open_thread` round trip (AC-E5/AC-E6) actually shows the new message —
	// a static fixture object would silently drop it on refetch.
	const messages: ReturnType<typeof makeMessage>[] = [];

	// POST /api/actions/search_users — the overlay's `myAgentId` lookup.
	// Registered before the catch-all below so the catch-all's
	// `route.fallback()` for an unrecognized path reaches this handler
	// (Playwright matches LIFO).
	await page.route("**/api/actions/search_users", async (route) => {
		if (route.request().method() !== "POST") {
			await route.continue();
			return;
		}
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({
				ok: true,
				data: [
					makeUserRow(COC_AGENT.id, {
						kind: "ai",
						name: COC_AGENT.name,
						role: COC_AGENT.role,
						ownerUserId: COC_AGENT.ownerUserId,
					}),
				],
			}),
		});
	});

	// Single route handler for all other /api/ calls. Uses URL matching
	// internally to avoid Playwright glob-priority pitfalls (last-registered-wins
	// + glob `?` matching one char rather than a literal query separator).
	await page.route("**/api/**", async (route) => {
		const url = route.request().url();
		const method = route.request().method();

		// POST /api/actions/send_message — message send.
		if (url.endsWith("/api/actions/send_message") && method === "POST") {
			const requestBody = route.request().postDataJSON() as { text?: string } | null;
			const text = requestBody?.text ?? "sent";
			const message = makeMessage(`msg-${messages.length + 1}`, COACH_THREAD_ID, {
				senderId: "u-founder",
				clientKey: `key-${messages.length + 1}`,
				payload: { text },
				createdAt: new Date().toISOString(),
			});
			messages.unshift(message);
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					ok: true,
					data: { message, thread: COACH_THREAD },
				}),
			});
			return;
		}

		// POST /api/actions/search_threads — thread list (Conversations submenu,
		// the overlay's existing-thread lookup).
		if (url.endsWith("/api/actions/search_threads") && method === "POST") {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ ok: true, data: THREADS_LIST_FIXTURE }),
			});
			return;
		}

		// POST /api/actions/open_thread — individual thread detail.
		if (url.endsWith("/api/actions/open_thread") && method === "POST") {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					ok: true,
					data: {
						thread: COACH_THREAD,
						members: COACH_THREAD_MEMBERS,
						messages: [...messages],
						headMessageId: messages[0]?.id ?? null,
						hostTitle: null,
					},
				}),
			});
			return;
		}

		// Unrecognized paths: fall through to auto-use fixture handlers
		// Historical — the shell's bootstrap calls (settings, threads).
		await route.fallback();
	});
}

test.describe("L21 — CoC Overlay E2E", () => {
	test.beforeEach(async ({ page }) => {
		await setupApiMocks(page);
	});

	test("AC-E1: CoC trigger button is visible in the sidebar on the conversations page", async ({
		page,
	}) => {
		await page.goto("/conversations");

		// The CoC trigger button must be visible in the sidebar.
		const trigger = page.getByRole("button", { name: /assistant/i });
		await expect(trigger).toBeVisible();
	});

	test("AC-E1: CoC trigger is visible on the work page too (persistent across views)", async ({
		page,
	}) => {
		await page.goto("/work/portfolio");

		const trigger = page.getByRole("button", { name: /assistant/i });
		await expect(trigger).toBeVisible();
	});

	test("AC-E2: clicking the trigger opens the CoC overlay", async ({ page }) => {
		await page.goto("/conversations");

		// Overlay must not be present initially.
		await expect(page.getByRole("dialog", { name: /assistant conversation/i })).toHaveCount(0);

		// Click the trigger.
		const trigger = page.getByRole("button", { name: /assistant/i });
		await trigger.click();

		// Overlay must now be present.
		await expect(page.getByRole("dialog", { name: /assistant conversation/i })).toBeVisible();
	});

	test("AC-E3: overlay shows ThreadShell in assistant configuration (empty thread empty state)", async ({
		page,
	}) => {
		await page.goto("/conversations");

		const trigger = page.getByRole("button", { name: /assistant/i });
		await trigger.click();

		// ThreadShell is mounted inside the dialog.
		const dialog = page.getByRole("dialog", { name: /assistant conversation/i });
		await expect(dialog).toBeVisible();

		// ThreadShell empty state shows when no messages.
		await expect(dialog.getByText(/no messages yet/i)).toBeVisible();

		// Composer is present.
		await expect(dialog.getByPlaceholder(/reply to thread/i)).toBeVisible();
	});

	test("AC-E4: user can add a task as context — chip appears in overlay", async ({ page }) => {
		// Navigate to a bet page so a BetCard is visible in Main.
		await page.goto(`/work/task/${BET_ID}`);

		// Open the CoC overlay first.
		const trigger = page.getByRole("button", { name: /assistant/i });
		await trigger.click();

		const dialog = page.getByRole("dialog", { name: /assistant conversation/i });
		await expect(dialog).toBeVisible();

		// When the overlay is open, a "+" attach button should appear on the BetCard in Main.
		// The BetCard is rendered in the Main area at /work/task/:id.
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

		const trigger = page.getByRole("button", { name: /assistant/i });
		await trigger.click();

		const dialog = page.getByRole("dialog", { name: /assistant conversation/i });
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

		const trigger = page.getByRole("button", { name: /assistant/i });
		await trigger.click();

		await expect(page.getByRole("dialog", { name: /assistant conversation/i })).toBeVisible();

		// Press Escape.
		await page.keyboard.press("Escape");

		// Overlay must be hidden.
		await expect(page.getByRole("dialog", { name: /assistant conversation/i })).toHaveCount(0);
	});

	test("AC-E7: clicking the trigger again closes the overlay", async ({ page }) => {
		await page.goto("/conversations");

		const trigger = page.getByRole("button", { name: /assistant/i });
		await trigger.click();

		await expect(page.getByRole("dialog", { name: /assistant conversation/i })).toBeVisible();

		// Click trigger again to close.
		await trigger.click();

		await expect(page.getByRole("dialog", { name: /assistant conversation/i })).toHaveCount(0);
	});

	test("AC-E8: assistant thread appears in Conversations submenu after overlay is opened", async ({
		page,
	}) => {
		await page.goto("/conversations");

		// The assistant thread should appear in the Conversations submenu.
		// Title is derived from hostKind + id prefix: "User thread thr-coac"
		await page.waitForSelector("[data-ds-component='ThreadRow']");
		const coachThreadRow = page.locator("[data-ds-component='ThreadRow']").filter({
			hasText: /user thread/i,
		});
		await expect(coachThreadRow).toBeVisible();
	});

	test("AC-E9: overlay state persists across view navigation (not destroyed on navigate)", async ({
		page,
	}) => {
		await page.goto("/conversations");

		// Open the overlay.
		const trigger = page.getByRole("button", { name: /assistant/i });
		await trigger.click();
		await expect(page.getByRole("dialog", { name: /assistant conversation/i })).toBeVisible();

		// Navigate to the Work view.
		const workButton = page.getByRole("button", { name: /work/i });
		await workButton.click();

		// The overlay must still be visible after navigation.
		await expect(page.getByRole("dialog", { name: /assistant conversation/i })).toBeVisible();
	});

	test("trigger aria-expanded reflects overlay state", async ({ page }) => {
		await page.goto("/conversations");

		const trigger = page.getByRole("button", { name: /assistant/i });

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

		const trigger = page.getByRole("button", { name: /assistant/i });
		await trigger.click();

		await expect(page.getByRole("dialog", { name: /assistant conversation/i })).toBeVisible();

		// Click somewhere in the main content area.
		const mainContent = page.getByTestId("main-content");
		await mainContent.click({ position: { x: 10, y: 10 } });

		// Overlay must still be visible.
		await expect(page.getByRole("dialog", { name: /assistant conversation/i })).toBeVisible();
	});
});
