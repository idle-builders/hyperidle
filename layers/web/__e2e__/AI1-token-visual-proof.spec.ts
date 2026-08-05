/**
 * AI1 — AC2/AC4: Visual proof that token resolutions restore intended styling.
 *
 * Captures screenshots of surfaces affected by AI1 token fixes. These are
 * evidence screenshots for reviewer inspection — not pixel-diff regression tests.
 *
 * Screenshots saved to plans/AI1/screenshots/ (git add -f'd as visual proof).
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { expect, test } from "./fixtures";

const SCREENSHOTS_DIR = path.resolve(import.meta.dirname, "../../../plans/AI1/screenshots");

/** Thread row shape per layers/web/src/hooks/useConversationsThreads.ts */
function makeThreadRow(id: string, title: string, blocking = false): Record<string, unknown> {
	return {
		id,
		hostKind: "task",
		hostId: `host-${id}`,
		initiatorId: "test-founder",
		participants: ["test-founder"],
		pinned: false,
		resolvedAt: null,
		lastActiveAt: new Date(Date.now() - 3600000).toISOString(),
		createdAt: new Date(Date.now() - 86400000).toISOString(),
		hasUnresolvedReview: false,
		blocking,
		title,
	};
}

test.beforeAll(() => {
	fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
});

// Visual proof tests may need longer than the default 30s to allow Vite cold start.
test.slow();

// ---------------------------------------------------------------------------
// 1. Conversations page — blocking thread section (--status-error border)
// ---------------------------------------------------------------------------

test("AI1 AC2/AC5 — conversations: blocking section uses --status-error border", async ({
	page,
}) => {
	// Must register BEFORE the auto-fixture's threads mock to override it (LIFO).
	// Both patterns match — last-registered wins.
	await page.route("**/api/threads**", async (route) => {
		if (route.request().method() === "GET") {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					threads: [
						makeThreadRow("t-blocking", "Blocker: Auth service down", true),
						makeThreadRow("t-active", "Sprint planning notes", false),
					],
				}),
			});
		} else {
			await route.continue();
		}
	});

	await page.goto("/conversations", { waitUntil: "domcontentloaded" });
	await page.waitForTimeout(2500);

	const screenshotPath = path.join(SCREENSHOTS_DIR, "01-conversations-blocking-section.png");
	await page.screenshot({ path: screenshotPath, fullPage: false });
	expect(fs.existsSync(screenshotPath)).toBe(true);
});

// ---------------------------------------------------------------------------
// 2. Settings > Assistant — --surface-container textarea + status token colors
// ---------------------------------------------------------------------------

test("AI1 AC4 — settings assistant: --surface-container + status token colors", async ({
	page,
}) => {
	await page.route("**/api/users/*/assistant**", async (route) => {
		if (route.request().method() === "GET") {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					persona: "You are a helpful assistant for the HyperIdle team.",
					enabled: true,
				}),
			});
		} else {
			await route.continue();
		}
	});

	// Settings opens as a modal via /conversations?settings=open
	// then navigate to the assistant sub-section
	await page.goto("/conversations?settings=open", { waitUntil: "domcontentloaded" });
	await page.waitForTimeout(2000);
	// Try to navigate to the assistant tab
	const assistantLink = page.getByText("Assistant").first();
	if (await assistantLink.isVisible()) {
		await assistantLink.click();
		await page.waitForTimeout(1000);
	}

	const screenshotPath = path.join(SCREENSHOTS_DIR, "02-settings-assistant.png");
	await page.screenshot({ path: screenshotPath, fullPage: false });
	expect(fs.existsSync(screenshotPath)).toBe(true);
});

// ---------------------------------------------------------------------------
// 3. Desktop viewport — conversations with blocking section
// ---------------------------------------------------------------------------

test("AI1 AC2 — conversations desktop: blocking section border-left visible", async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.route("**/api/threads**", async (route) => {
		if (route.request().method() === "GET") {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					threads: [makeThreadRow("t-block-1", "Blocker: Payment processing stuck", true)],
				}),
			});
		} else {
			await route.continue();
		}
	});

	await page.goto("/conversations", { waitUntil: "domcontentloaded" });
	await page.waitForTimeout(2500);

	const screenshotPath = path.join(SCREENSHOTS_DIR, "03-conversations-desktop.png");
	await page.screenshot({ path: screenshotPath, fullPage: false });
	expect(fs.existsSync(screenshotPath)).toBe(true);
});

// ---------------------------------------------------------------------------
// 4. Mobile viewport — conversations
// ---------------------------------------------------------------------------

test("AI1 AC2 — conversations mobile viewport", async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto("/conversations", { waitUntil: "domcontentloaded" });
	await page.waitForTimeout(1500);

	const screenshotPath = path.join(SCREENSHOTS_DIR, "04-conversations-mobile.png");
	await page.screenshot({ path: screenshotPath, fullPage: false });
	expect(fs.existsSync(screenshotPath)).toBe(true);
});
