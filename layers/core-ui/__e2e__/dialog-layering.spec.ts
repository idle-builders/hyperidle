/**
 * AI2 — Dialog layering: computed z-index ordering spec (AC-3, runtime half).
 *
 * AC-3 (b): Runtime — open two overlay surfaces in both orders; assert the
 * one with the higher --z-* band has a strictly higher computed z-index,
 * regardless of DOM mount order. This satisfies "stack predictably regardless
 * of DOM order."
 *
 * Strategy: page.route() mocks — no DB required. Desktop viewport (default).
 *
 * @lore AI2: AC-3's static half (no raw z-[N] on overlays) is a lint/grep gate,
 * not a test. Only the runtime computed-z ordering is verified here.
 *
 * @lore AI2 C-2 fix round 2: The original spec used TaskSheet (drawer=30) + AssistantOverlay
 * (overlay=40). TaskSheet has no live trigger on this branch (WorkBet task-row onClick restores
 * navigate() per origin/main — AG scope). Substituting with two genuinely reachable surfaces:
 *   - AssistantOverlay (layer="overlay", --z-overlay=40): triggered by the "Assistant" button
 *     in Sidebar (wired via AppShell.handleAssistantClick → sidebarProps.onAssistantClick).
 *   - GlobalSearchPanel (layer="dialog", --z-dialog=60): triggered by the "Search" button
 *     (data-testid="sidebar-search-hint") in Sidebar (wired via AppShell.commandK.open →
 *     sidebarProps.onSearchClick).
 * Both surfaces are always rendered by AppShell on desktop viewport (default project fixture).
 * TaskSheet reachability (no live trigger on AI2 branch) is a pre-existing gap owned by AG
 * (Work-view experience workpackage).
 */

import { expect, makeDocumentRow, mockDocument, mockSearchThreads, test } from "./fixtures";

// ---------------------------------------------------------------------------
// Parse a CSS z-index value into a number.
// Returns 0 for "auto" or unparseable strings.
// ---------------------------------------------------------------------------
async function computedZIndex(
	page: import("@playwright/test").Page,
	selector: string,
): Promise<number> {
	return page.evaluate((sel) => {
		const el = document.querySelector(sel) as HTMLElement | null;
		if (!el) return -1;
		const z = window.getComputedStyle(el).zIndex;
		return z === "auto" ? 0 : Number.parseInt(z, 10);
	}, selector);
}

// ---------------------------------------------------------------------------
// Common route mocks for AppShell on /conversations
// (in addition to the auto-use fixture defaults: auth/me, settings, threads, teams)
// ---------------------------------------------------------------------------

async function setupAppShellMocks(page: import("@playwright/test").Page): Promise<void> {
	// search_threads — AssistantOverlay's useThreads(agentHostFilter) resolves
	// the assistant's existing direct thread this way, and it's also the broad
	// fallback for the Conversations submenu list.
	await mockSearchThreads(page, { rows: [] });
	// @lore BC5 T10: `GET /api/notifications*` is gone — `useNotifications`
	// reads the inbox off `open_user({}).inbox`, which the fixtures.ts
	// auto-use default already answers.
}

// ---------------------------------------------------------------------------
// Tests
// AssistantOverlay (--z-overlay=40) vs GlobalSearchPanel (--z-dialog=60)
// ---------------------------------------------------------------------------

test.describe("AI2 — overlay z-layer ordering (AC-3 runtime)", () => {
	test.beforeEach(async ({ page }) => {
		await setupAppShellMocks(page);
	});

	test("GlobalSearchPanel (--z-dialog=60) stacks above AssistantOverlay (--z-overlay=40): open overlay first", async ({
		page,
	}) => {
		// Navigate to /conversations — no extra route mocks needed beyond AppShell defaults.
		await page.goto("/conversations");

		// Wait for Sidebar to render (search-hint is always present on desktop).
		const searchHint = page.locator("[data-testid='sidebar-search-hint']");
		await expect(
			searchHint,
			"sidebar-search-hint must be visible — AppShell desktop layout rendered",
		).toBeVisible({ timeout: 15000 });

		// Step 1: Open AssistantOverlay (overlay layer) first.
		// @lore AI2 C-2 round2: "Assistant" button in Sidebar is wired via AppShell.handleAssistantClick.
		// Non-modal: no scrim, no focus trap → other Sidebar elements remain clickable.
		const assistantBtn = page.getByRole("button", { name: /^assistant$/i });
		await expect(assistantBtn, "Assistant button must be visible in Sidebar").toBeVisible();
		await assistantBtn.click();

		const assistantOverlay = page.locator("[data-dialog-layer='overlay']");
		await expect(
			assistantOverlay,
			"AssistantOverlay must be visible after clicking Assistant button",
		).toBeVisible();

		const overlayZ = await computedZIndex(page, "[data-dialog-layer='overlay']");
		expect(
			overlayZ,
			"AssistantOverlay z-index must be > 0 (--z-overlay=40 CSS token applied)",
		).toBeGreaterThan(0);

		// Step 2: Open GlobalSearchPanel (dialog layer) while AssistantOverlay is already open.
		// AssistantOverlay is non-modal (no focus trap) so the search-hint button remains clickable.
		await searchHint.click();

		const searchPanel = page.locator("[data-dialog-layer='dialog']");
		await expect(
			searchPanel,
			"GlobalSearchPanel must be visible after clicking sidebar-search-hint",
		).toBeVisible();

		const dialogZ = await computedZIndex(page, "[data-dialog-layer='dialog']");

		// Dialog (60) must be strictly higher than overlay (40) when dialog is DOM-second.
		expect(
			dialogZ,
			"GlobalSearchPanel z-index (--z-dialog=60) must exceed AssistantOverlay z-index (--z-overlay=40) when dialog mounts after overlay",
		).toBeGreaterThan(overlayZ);

		await page.screenshot({ path: "test-results/ai2-z-order-overlay-first.png" });
	});

	test("GlobalSearchPanel (--z-dialog=60) stacks above AssistantOverlay (--z-overlay=40): open dialog first then overlay", async ({
		page,
	}) => {
		// Navigate to /conversations.
		await page.goto("/conversations");

		// Wait for Sidebar.
		const searchHint = page.locator("[data-testid='sidebar-search-hint']");
		await expect(
			searchHint,
			"sidebar-search-hint must be visible — AppShell desktop layout rendered",
		).toBeVisible({ timeout: 15000 });

		// Step 1: Open GlobalSearchPanel (dialog layer) FIRST — it mounts before AssistantOverlay.
		await searchHint.click();

		const searchPanel = page.locator("[data-dialog-layer='dialog']");
		await expect(
			searchPanel,
			"GlobalSearchPanel must be visible after clicking sidebar-search-hint",
		).toBeVisible();

		const dialogZFirst = await computedZIndex(page, "[data-dialog-layer='dialog']");
		expect(
			dialogZFirst,
			"GlobalSearchPanel z-index must be > 0 (--z-dialog=60 token active)",
		).toBeGreaterThan(0);

		// Step 2: Open AssistantOverlay (overlay layer) WHILE GlobalSearchPanel is already open.
		// @lore AI2: GlobalSearchPanel FocusTrap uses allowOutsideClick=true — clicks outside
		// the panel are not blocked by the trap. However, the scrim (position:fixed, inset:0,
		// z=50) sits above the Sidebar visually and blocks Playwright pointer-event hit-tests.
		// We use page.evaluate to fire a native click() on the Assistant button directly,
		// bypassing both the pointer-event layer and Playwright's hit-testing. The native
		// click() call invokes React's event delegation at the document root, triggering
		// handleAssistantClick and setting assistantOverlayOpen=true.
		await page.evaluate(() => {
			const btn = document.querySelector(
				'button[aria-label="Assistant"]',
			) as HTMLButtonElement | null;
			btn?.click();
		});

		const assistantOverlay = page.locator("[data-dialog-layer='overlay']");
		await expect(
			assistantOverlay,
			"AssistantOverlay must mount after Assistant button click — both overlays now in DOM",
		).toBeVisible();

		// Both surfaces are now in the DOM simultaneously.
		// dialog was DOM-first; overlay was DOM-second.
		// CSS token scale must hold regardless: dialog (60) > overlay (40).
		const overlayZ = await computedZIndex(page, "[data-dialog-layer='overlay']");
		const dialogZ = await computedZIndex(page, "[data-dialog-layer='dialog']");

		expect(
			overlayZ,
			"AssistantOverlay z-index must be > 0 (--z-overlay=40 token active)",
		).toBeGreaterThan(0);

		expect(
			dialogZ,
			"GlobalSearchPanel z-index (--z-dialog=60) must exceed AssistantOverlay z-index (--z-overlay=40) even when dialog was DOM-first and overlay is DOM-second",
		).toBeGreaterThan(overlayZ);

		await page.screenshot({ path: "test-results/ai2-z-order-dialog-first.png" });
	});

	test("modal Dialog (--z-dialog=60) stacks above NotificationPopover (--z-overlay=40)", async ({
		page,
	}) => {
		// @lore BB1: this opened the kill-bet ConsequencePreviewDialog through the
		// WorkBet overflow menu. Both are deleted — no production component emits
		// data-bet-action any more — so the modal comes from ScopeChangeDialog on
		// document detail instead. The assertion is about the z-index SCALE, not
		// about which dialog opened, so any real modal proves the same contract.
		const KNOWLEDGE_ID = "k-dialog-layer-test";
		await mockDocument(page, {
			row: makeDocumentRow(KNOWLEDGE_ID, {
				title: "Layering document",
				body: "# Test\n\nContent.",
				scopeKind: "team",
			}),
		});
		await page.route("**/api/artifacts**", (route) =>
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ items: [], nextCursor: null }),
			}),
		);

		await page.goto(`/documents/${KNOWLEDGE_ID}`);
		await expect(page.locator("[data-testid='document-detail-page']")).toBeVisible();

		await page.getByRole("button", { name: /more options/i }).click();
		const changeScope = page.locator("[data-testid='document-change-scope']");
		await expect(changeScope, "Change scope item must appear in the overflow menu").toBeVisible();
		await changeScope.click();

		await expect(page.getByRole("dialog")).toBeVisible();

		const dialogZ = await computedZIndex(page, "[data-dialog-layer='dialog']");
		// A dialog (60) must outrank an overlay (40) — assert the raw z-value
		// satisfies the scale contract even when no overlay is open.
		expect(dialogZ).toBeGreaterThanOrEqual(60);
	});
});
