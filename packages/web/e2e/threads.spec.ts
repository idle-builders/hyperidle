/**
 * L1a — Playwright e2e for the four shipping cases (plan §9 + T16):
 *   1. plain coach thread     — Composer round-trip via Conversations.
 *   2. review thread          — head + sticky verdict bar; Approve flips
 *                                to verdict CommentRow + StatusChip.
 *   3. back-compat (legacy)   — pre-migration thread fixture loads via
 *                                the new endpoint.
 *   4. re-open semantics      — verdict, then a new review re-opens the
 *                                thread; old verdict-message stays in stream.
 *
 * Red phase: every test fails because the new ThreadShell render path
 * does not exist; navigation lands on the legacy MOCK page.
 */

import { expect, test } from "@playwright/test";

test.describe("L1a — plain coach thread", () => {
	test("composer round-trips a plain message via the new ThreadShell", async ({ page }) => {
		await page.goto("/conversations/review");
		// The post-L1a page mounts <ThreadShell> with the new fetch path.
		// Until then this assertion fails because [data-testid='thread-shell']
		// does not exist on the page.
		const shell = page.locator("[data-testid='thread-shell']");
		await expect(shell).toBeVisible({ timeout: 5000 });

		const composer = page.getByPlaceholder(/reply to thread/i);
		await composer.fill("hello via L1");
		await page.getByRole("button", { name: /send/i }).click();

		// The new message round-trips and renders in the stream.
		await expect(page.getByText("hello via L1")).toBeVisible();
	});
});

test.describe("L1a — review thread renders ThreadHead + ReviewVerdictBar", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/conversations/review");
	});

	test("ThreadHead mounts with title, reasoning bullets, and artifact slot", async ({ page }) => {
		await expect(page.locator("[data-testid='thread-head']")).toBeVisible();
		await expect(page.getByText(/reasoning/i)).toBeVisible();
		// L1a stub artifactSlot renders a text_diff inline preview
		await expect(page.locator("[data-testid='artifact-slot']")).toBeVisible();
	});

	test("the sticky ReviewVerdictBar shows 5 binding verdict buttons", async ({ page }) => {
		await expect(page.getByRole("button", { name: /^approve$/i })).toBeVisible();
		await expect(page.getByRole("button", { name: /approve with comments/i })).toBeVisible();
		await expect(page.getByRole("button", { name: /request changes/i })).toBeVisible();
		await expect(page.getByRole("button", { name: /^edit$/i })).toBeVisible();
		await expect(page.getByRole("button", { name: /reject/i })).toBeVisible();
	});

	test("clicking Approve emits a verdict CommentRow with StatusChip='approved' and head collapses", async ({
		page,
	}) => {
		await page.getByRole("button", { name: /^approve$/i }).click();
		// Verdict CommentRow appears in stream
		await expect(page.getByText("APPROVED")).toBeVisible();
		// Head unmounts (predicate flips to head=null after resolve)
		await expect(page.locator("[data-testid='thread-head']")).toHaveCount(0);
	});
});

test.describe("L1a — back-compat (legacy data)", () => {
	test("a legacy review/chat thread loads via the new endpoint with subject+body collapsed into payload.text", async ({
		page,
	}) => {
		// The fixture is seeded by the test harness; the page reads via
		// /api/threads/:id and renders through ThreadShell.
		await page.goto("/conversations/review");
		await expect(page.locator("[data-testid='thread-shell']")).toBeVisible();

		// The legacy `subject` and `body` are concatenated into payload.text.
		// We cannot assert the exact fixture string here — the seed lives
		// in the harness — so we assert the structural contract: the
		// stream has at least one CommentRow with type='plain' rendering.
		const rows = page.locator("[data-testid='comment-row']");
		await expect(rows.first()).toBeVisible();
	});
});

test.describe("L1a — re-open semantics", () => {
	test("verdict resolves the thread, then a new review re-opens it; old verdict message remains", async ({
		page,
	}) => {
		await page.goto("/conversations/review");
		await page.getByRole("button", { name: /^approve$/i }).click();
		await expect(page.getByText("APPROVED")).toBeVisible();
		// Banner shows "RESOLVED" tag when thread.resolvedAt is set.
		await expect(page.getByText(/resolved/i)).toBeVisible();

		// Trigger a new review on the same thread (test harness exposes
		// a button or seeds the fixture). For the red phase the affordance
		// does not exist.
		const reopenAffordance = page.getByRole("button", { name: /post follow-up review/i });
		await reopenAffordance.click();
		// Banner's "RESOLVED" tag disappears when thread.resolvedAt is null.
		await expect(page.getByText(/^resolved$/i)).toHaveCount(0);
		// The old verdict message is still visible (audit trail).
		await expect(page.getByText("APPROVED")).toBeVisible();
	});
});
