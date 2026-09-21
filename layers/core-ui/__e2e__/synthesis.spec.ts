/**
 * J8 — Synthesis critical user-flow coverage.
 *
 * @lore 10+ Playwright scenarios spanning Settings overlay, Triage tab switch, Knowledge edit toggle, scope browser navigation,
 * Bet detail page load, PitchSelector detail pane, Reasoning block
 * collapse/expand, keyboard shortcuts, and responsive breakpoints. These
 * tests are the J8 acceptance evidence for "Playwright E2E suite: minimum
 * 10 critical user flows" — they do NOT replace the narrower per-story
 * specs; they complement them by exercising the end-to-end paths the user
 * will actually walk.
 */
import { expect, test } from "./fixtures";

test.describe("J8 synthesis — 10 critical flows", () => {
	test("1. Settings overlay opens from the avatar and closes via the header X", async ({
		page,
	}) => {
		await page.goto("/");
		await page.waitForSelector("[data-testid='main-content']");
		await page.getByRole("button", { name: /user profile/i }).click();
		const dialog = page.getByRole("dialog", { name: /settings/i });
		await expect(dialog).toBeVisible();
		await page.getByRole("button", { name: /close settings/i }).click();
		await expect(dialog).not.toBeVisible();
	});

	test("2. Settings overlay closes when the backdrop is clicked", async ({ page }) => {
		await page.goto("/");
		await page.waitForSelector("[data-testid='main-content']");
		await page.getByRole("button", { name: /user profile/i }).click();
		await expect(page.getByRole("dialog", { name: /settings/i })).toBeVisible();
		// DaisyUI modal-backdrop has z-index: -1. Clicking it directly fails because
		// the modal-box sits above it. Click the modal overlay at a corner position
		// outside the modal-box to trigger the backdrop's onClick handler.
		const backdrop = page.getByTestId("settings-backdrop");
		await backdrop.dispatchEvent("click");
		await expect(page.getByRole("dialog", { name: /settings/i })).not.toBeVisible();
	});

	// @lore BC4: tests 4-6 (scope browser tabs, the free-text edit textarea)
	// are deleted — their subject is gone. AD6 replaced the `?scope=` query
	// browser with the static 3-pill ScopePicker (`scope-pill-*` testids,
	// no `knowledge-scope-indicator`/`knowledge-scope-browser`), and T2
	// replaced the plain textarea with BodyEditor (TipTap) — there is no
	// `knowledge-edit-textarea` element to find. The surviving edit-panel
	// behavior (Edit shows the panel, Done exits) is covered by
	// `knowledge-edit.spec.ts`'s T2 AC-1 suite.

	test("7. Bet detail page loads with breadcrumb and tasks table", async ({ page }) => {
		// @lore L16: WorkBet now calls useBet (real API fetch). Mock the endpoint
		// so the test is hermetic — no real DB required in CI.
		await page.goto("/work/task/b1");
		await page.waitForSelector("[data-testid='task-detail-page']");
		await expect(page.getByRole("navigation", { name: /breadcrumb/i })).toBeVisible();
		await expect(page.getByRole("heading", { name: /tasks/i })).toBeVisible();
		// Table renders at least one row.
		await expect(page.locator("table tbody tr").first()).toBeVisible();
	});

	// @lore L13: PitchSelector was mounted inside WorkTeam which was deleted.
	// /work/team now redirects to /work/portfolio. The PitchSelector surface
	// no longer exists. This test cannot be migrated — the surface is gone.
	// The J5 work-surface spec that covered this is similarly marked obsolete.
	test.skip("8. PitchSelector detail pane opens when a pitch is selected", async ({ page }) => {
		await page.goto("/work/team");
		await page.waitForSelector("[data-testid='work-team-page']");
		await page.getByRole("button", { name: /select pitches/i }).click();
		// Click the first pitch card by its aria-label to open the detail pane.
		await page.getByLabel("Pitch: Mobile responsive layout").click();
		await expect(page.getByTestId("pitch-detail-pane")).toBeVisible();
		await expect(page.getByRole("button", { name: /add to canvas/i })).toBeVisible();
	});

	// L1/L9: ConversationsReview replaced by Conversations. New contract in threads.spec.ts.
	test.skip("9. Reasoning block collapses and re-expands via its toggle", async ({ page }) => {
		await page.goto("/conversations");
		await page.waitForSelector("[data-testid='conversations-page']");
		const toggle = page.getByRole("button", { name: /reasoning/i });
		await expect(toggle).toHaveAttribute("aria-expanded", "false");
		await toggle.click();
		await expect(toggle).toHaveAttribute("aria-expanded", "true");
		await toggle.click();
		await expect(toggle).toHaveAttribute("aria-expanded", "false");
	});

	// L1/L9: ConversationsReview replaced by Conversations. New contract in threads.spec.ts.
	test.skip("10. Review verdict shortcut A pre-fills the pending verdict", async ({ page }) => {
		await page.goto("/conversations");
		await page.waitForSelector("[data-testid='conversations-page']");
		await page.getByTestId("main-content").click();
		await page.keyboard.press("a");
		await expect(page.getByTestId("pending-verdict")).toContainText("approve");
	});

	// L8: the "Review Queue" label no longer appears in the Conversations
	// Submenu (replaced by the live thread list bucketed Blocking/Active/
	// Resolved). Submenu collapse behaviour itself is still covered by
	// AppShell unit tests; rewrite this case once a deterministic seeded
	// thread fixture is available so we assert against a stable row label.
	test.skip("11. Submenu collapses below 1024px and expands above", async ({ page }) => {
		await page.setViewportSize({ width: 1000, height: 800 });
		await page.goto("/");
		await page.waitForSelector("[data-testid='main-content']");
		await expect(page.getByText("Review Queue")).not.toBeVisible();
		await page.setViewportSize({ width: 1440, height: 900 });
		await expect(page.getByText("Review Queue")).toBeVisible();
	});

	test("12. Global search opens with Command-K and closes on Escape", async ({ page }) => {
		await page.goto("/");
		await page.waitForSelector("[data-testid='main-content']");
		await page.keyboard.press("Meta+k");
		await expect(page.getByRole("dialog", { name: /global search/i })).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(page.getByRole("dialog", { name: /global search/i })).not.toBeVisible();
	});
});
