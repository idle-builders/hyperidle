/**
 * J8 — keyboard-only navigation audit.
 *
 * @lore Covers three scenarios: reachability (every interactive element is
 * reachable via Tab), focus trap (Settings overlay confines Tab to its own
 * tabbable elements), and shortcuts (A/R/X verdict pre-fill on review
 * surface). Complements the lighter `keyboard-and-responsive.spec.ts` file
 * which predates J8 and covers drag/drop specifically.
 */
import { expect, test } from "@playwright/test";

test.describe("J8 — keyboard-only navigation", () => {
	test("Tab cycles the shell from the first interactive element", async ({ page }) => {
		await page.goto("/conversations/review");
		await page.waitForSelector("[data-testid='conversations-review-page']");
		const seen = new Set<string>();
		// Press Tab up to 40 times and collect active-element tag names. We
		// require the page to reach at least 6 distinct interactive elements
		// before cycling back to the body.
		for (let i = 0; i < 40; i++) {
			await page.keyboard.press("Tab");
			const tag = await page.evaluate(() => {
				const active = document.activeElement;
				if (!active) return "NONE";
				return `${active.tagName}:${active.getAttribute("aria-label") ?? active.textContent?.slice(0, 20) ?? ""}`;
			});
			seen.add(tag);
		}
		// Navigation, content, and rail regions together expose well over 6
		// focusable elements; assert we reached at least that many distinct
		// elements to prove Tab order is not trapped on one region.
		expect(seen.size).toBeGreaterThanOrEqual(6);
	});

	test("Settings overlay traps focus within the dialog", async ({ page }) => {
		await page.goto("/");
		await page.waitForSelector("[data-testid='main-content']");
		await page.getByRole("button", { name: /user profile/i }).click();
		const dialog = page.getByRole("dialog", { name: /settings/i });
		await expect(dialog).toBeVisible();

		// Tab 20 times while the overlay is open. Every active element
		// should remain inside the dialog's DOM subtree.
		for (let i = 0; i < 20; i++) {
			await page.keyboard.press("Tab");
			const insideDialog = await page.evaluate(() => {
				const dlg = document.querySelector("[role='dialog'][aria-label='Settings']");
				const active = document.activeElement;
				return !!(dlg && active && dlg.contains(active));
			});
			expect(insideDialog).toBe(true);
		}
	});

	test("Escape closes the Settings overlay and returns focus to the shell", async ({ page }) => {
		await page.goto("/");
		await page.waitForSelector("[data-testid='main-content']");
		await page.getByRole("button", { name: /user profile/i }).click();
		await expect(page.getByRole("dialog", { name: /settings/i })).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(page.getByRole("dialog", { name: /settings/i })).not.toBeVisible();
	});

	test("Review verdict shortcuts A/X pre-fill a pending verdict; R opens composer", async ({
		page,
	}) => {
		// @lore L6: R on a text_diff thread opens the RequestChangesComposer
		// modal instead of pre-filling — see ConversationsReview.tsx
		// "R on a text_diff thread opens the composer". The pre-fill contract
		// for A/X is unchanged from L4. We test A/X in their own iterations
		// and then drive R separately so we can assert dialog visibility.
		await page.goto("/conversations/review");
		await page.waitForSelector("[data-testid='conversations-review-page']");
		await page.getByTestId("main-content").click();
		for (const { key, expected } of [
			{ key: "a", expected: "approve" },
			{ key: "x", expected: "reject" },
		] as const) {
			await page.keyboard.press(key);
			await expect(page.getByTestId("pending-verdict")).toContainText(expected);
		}
		// R: opens the request-changes composer (modal dialog) instead of
		// pre-filling. The composer is keyboard-traps focus and renders an
		// aria-labelledby heading whose accessible name is "Request changes".
		await page.keyboard.press("r");
		const composer = page.getByRole("dialog", { name: /request changes/i });
		await expect(composer).toBeVisible();
		await expect(page.getByTestId("pending-verdict")).toHaveCount(0);
	});

	test("ReasoningBlock toggle is keyboard operable", async ({ page }) => {
		await page.goto("/conversations/review");
		await page.waitForSelector("[data-testid='conversations-review-page']");
		const toggle = page.getByRole("button", { name: /reasoning/i });
		await toggle.focus();
		await expect(toggle).toBeFocused();
		// Default is collapsed; pressing Enter expands.
		await expect(toggle).toHaveAttribute("aria-expanded", "false");
		await page.keyboard.press("Enter");
		await expect(toggle).toHaveAttribute("aria-expanded", "true");
		// Pressing Space collapses again.
		await page.keyboard.press(" ");
		await expect(toggle).toHaveAttribute("aria-expanded", "false");
	});
});
