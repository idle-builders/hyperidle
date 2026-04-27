/**
 * J8 — Synthesis critical user-flow coverage.
 *
 * @lore 10+ Playwright scenarios spanning Settings overlay, collapsed Rail
 * pills, Triage tab switch, Knowledge edit toggle, scope browser navigation,
 * Bet detail page load, PitchSelector detail pane, Reasoning block
 * collapse/expand, keyboard shortcuts, and responsive breakpoints. These
 * tests are the J8 acceptance evidence for "Playwright E2E suite: minimum
 * 10 critical user flows" — they do NOT replace the narrower per-story
 * specs; they complement them by exercising the end-to-end paths the user
 * will actually walk.
 */
import { expect, test } from "@playwright/test";

test.describe("J8 synthesis — 10 critical flows", () => {
	test("1. Settings overlay opens from the avatar and closes via the header X", async ({
		page,
	}) => {
		await page.goto("/");
		await page.waitForSelector("[data-testid='main-content']");
		// L7: avatar opens AvatarMenu; Settings is reached via the menuitem.
		await page.getByRole("button", { name: /user profile/i }).click();
		await page.getByRole("menuitem", { name: /^settings$/i }).click();
		const dialog = page.getByRole("dialog", { name: /settings/i });
		await expect(dialog).toBeVisible();
		await page.getByRole("button", { name: /close settings/i }).click();
		await expect(dialog).not.toBeVisible();
	});

	test("2. Settings overlay closes when the backdrop is clicked", async ({ page }) => {
		await page.goto("/");
		await page.waitForSelector("[data-testid='main-content']");
		// L7: avatar opens AvatarMenu; Settings is reached via the menuitem.
		await page.getByRole("button", { name: /user profile/i }).click();
		await page.getByRole("menuitem", { name: /^settings$/i }).click();
		await expect(page.getByRole("dialog", { name: /settings/i })).toBeVisible();
		// DaisyUI modal-backdrop has z-index: -1. Clicking it directly fails because
		// the modal-box sits above it. Click the modal overlay at a corner position
		// outside the modal-box to trigger the backdrop's onClick handler.
		const backdrop = page.getByTestId("settings-backdrop");
		await backdrop.dispatchEvent("click");
		await expect(page.getByRole("dialog", { name: /settings/i })).not.toBeVisible();
	});

	test("3. Collapsed Rail pills appear below 1280px and expand restores the sections", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1024, height: 800 });
		await page.goto("/");
		await page.waitForSelector("[data-testid='main-content']");
		// Collapsed: semantic BLK pill visible via aria-label.
		await expect(page.getByLabel(/1 blockers?/i)).toBeVisible();
		await expect(page.getByText("Active Bets")).not.toBeVisible();
		// Expand.
		await page.getByRole("button", { name: /expand rail/i }).click();
		await expect(page.getByText("Active Bets")).toBeVisible();
	});

	test("4. Triage ↔ Curated tab switch preserves scope and updates the tab state", async ({
		page,
	}) => {
		await page.goto("/knowledge?scope=practice");
		await page.waitForSelector("[data-testid='knowledge-list-page']");
		const triage = page.getByRole("tab", { name: /triage/i });
		const curated = page.getByRole("tab", { name: /curated/i });
		await triage.click();
		await expect(triage).toHaveAttribute("aria-selected", "true");
		await curated.click();
		await expect(curated).toHaveAttribute("aria-selected", "true");
		await expect(page.getByTestId("knowledge-scope-indicator")).toHaveText("practice");
	});

	test("5. Knowledge edit toggle swaps the body into an editable textarea", async ({ page }) => {
		await page.goto("/knowledge/k1");
		await page.waitForSelector("[data-testid='knowledge-detail-page']");
		await page.getByRole("button", { name: /^edit$/i }).click();
		await expect(page.getByTestId("knowledge-edit-panel")).toBeVisible();
		await expect(page.getByTestId("knowledge-edit-textarea")).toBeVisible();
	});

	test("6. Scope browser navigates between Practice / Product / Factory", async ({ page }) => {
		await page.goto("/knowledge?scope=practice");
		await page.waitForSelector("[data-testid='knowledge-list-page']");
		await page.getByTestId("knowledge-scope-browser").getByRole("tab", { name: "Product" }).click();
		await expect(page).toHaveURL(/scope=product/);
		await expect(page.getByTestId("knowledge-scope-indicator")).toHaveText("product");
		await page.getByTestId("knowledge-scope-browser").getByRole("tab", { name: "Factory" }).click();
		await expect(page).toHaveURL(/scope=factory/);
		await expect(page.getByTestId("knowledge-scope-indicator")).toHaveText("factory");
	});

	test("7. Bet detail page loads with breadcrumb and tasks table", async ({ page }) => {
		await page.goto("/work/bet/b1");
		await page.waitForSelector("[data-testid='work-bet-page']");
		await expect(page.getByRole("navigation", { name: /breadcrumb/i })).toBeVisible();
		await expect(page.getByRole("heading", { name: /tasks/i })).toBeVisible();
		// Table renders at least one row.
		await expect(page.locator("table tbody tr").first()).toBeVisible();
	});

	test("8. PitchSelector detail pane opens when a pitch is selected", async ({ page }) => {
		await page.goto("/work/team");
		await page.waitForSelector("[data-testid='work-team-page']");
		await page.getByRole("button", { name: /select pitches/i }).click();
		// Click the first pitch card by its aria-label to open the detail pane.
		await page.getByLabel("Pitch: Mobile responsive layout").click();
		await expect(page.getByTestId("pitch-detail-pane")).toBeVisible();
		await expect(page.getByRole("button", { name: /add to canvas/i })).toBeVisible();
	});

	test("9. Reasoning block collapses and re-expands via its toggle", async ({ page }) => {
		await page.goto("/conversations/review");
		await page.waitForSelector("[data-testid='conversations-review-page']");
		const toggle = page.getByRole("button", { name: /reasoning/i });
		await expect(toggle).toHaveAttribute("aria-expanded", "false");
		await toggle.click();
		await expect(toggle).toHaveAttribute("aria-expanded", "true");
		await toggle.click();
		await expect(toggle).toHaveAttribute("aria-expanded", "false");
	});

	test("10. Review verdict shortcut A pre-fills the pending verdict", async ({ page }) => {
		await page.goto("/conversations/review");
		await page.waitForSelector("[data-testid='conversations-review-page']");
		await page.getByTestId("main-content").click();
		await page.keyboard.press("a");
		await expect(page.getByTestId("pending-verdict")).toContainText("approve");
	});

	test("11. Submenu collapses below 1024px and expands above", async ({ page }) => {
		// L3: the Conversations submenu replaced the static "Review Queue" /
		// "Chat" NavItems with a section-grouped thread queue. Probe the
		// collapse/expand behavior via the submenu's data-testid instead of
		// removed copy. Below 1024 px the Submenu shell is width-0 and its
		// children are hidden; above 1024 px the ConversationsSubmenu (with
		// its `[data-testid='conversations-submenu']`) is visible.
		await page.setViewportSize({ width: 1000, height: 800 });
		await page.goto("/");
		await page.waitForSelector("[data-testid='main-content']");
		await expect(page.getByTestId("conversations-submenu")).not.toBeVisible();
		await page.setViewportSize({ width: 1440, height: 900 });
		await expect(page.getByTestId("conversations-submenu")).toBeVisible();
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
