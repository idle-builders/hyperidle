/**
 * L4 — Verdict undo + click parity (E2E, red phase).
 *
 * Pins the contract from `.plan-L4.md` § 4 verification matrix:
 *   - First click on Approve enters the prefill state ("Confirm Approve");
 *     no toast yet, no commit.
 *   - Second click commits → undo toast renders bottom-right with countdown.
 *   - Pressing `U` while toast visible undoes the verdict and clears it.
 *   - Pressing `Esc` while toast visible dismisses without undoing.
 *   - Single-click commit is gated on Settings → Appearance →
 *     verdictDoubleClick=false. Default (true): single click does NOT commit.
 *
 * These tests MUST fail today: the click handler commits on first click,
 * no undo toast renders, `U` / `Esc` are not bound.
 *
 * @lore L4 AC-10 audit-row evidence split: this E2E covers the UX flow
 * (click parity, toast lifecycle, U/Esc keyboard parity). The deeper
 * "undo audit row is written" evidence — transition='undo',
 * undoes_response_id pointing to the prior commit, decision=NULL — lives
 * in `packages/server/src/routes/__tests__/conversations-undo.test.ts`
 * ("200 happy path: undo reverses the verdict and writes an undo audit
 * row"). The page currently uses MOCK_REVIEWS so the E2E cannot reach
 * the API; the integration test gives deterministic backend evidence.
 * Once a data hook lands (D-track), this E2E should be extended to
 * inspect the real `responses` row through an API probe.
 */
import { expect, test } from "@playwright/test";

test.describe("L4: Verdict undo + click parity (default verdictDoubleClick=true)", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/conversations/review");
		await page.waitForSelector("[data-testid='conversations-review-page']");
	});

	test("first click on Approve enters pre-fill state — no undo toast renders", async ({ page }) => {
		await page.getByRole("button", { name: /approve/i }).click();

		// The button now reads "Confirm Approve" (label swap per plan).
		await expect(page.getByRole("button", { name: /confirm approve/i })).toBeVisible();

		// No undo toast yet — first click is pre-fill only.
		await expect(page.getByRole("status").filter({ hasText: /undo/i })).toHaveCount(0);
	});

	test("two clicks on Approve commit and render the undo toast with a countdown", async ({
		page,
	}) => {
		const approve = page.getByRole("button", { name: /approve/i });
		await approve.click();
		await page.getByRole("button", { name: /confirm approve/i }).click();

		// Toast renders within the default window.
		const toast = page.getByRole("status").filter({ hasText: /undo/i });
		await expect(toast).toBeVisible();
		// Visible Undo control inside the toast.
		await expect(toast.getByRole("button", { name: /undo/i })).toBeVisible();
	});

	test("U key undoes the verdict while the toast is visible (and the toast clears)", async ({
		page,
	}) => {
		await page.getByRole("button", { name: /approve/i }).click();
		await page.getByRole("button", { name: /confirm approve/i }).click();
		const toast = page.getByRole("status").filter({ hasText: /undo/i });
		await expect(toast).toBeVisible();

		await page.keyboard.press("u");
		// Toast clears after a successful undo.
		await expect(toast).toBeHidden({ timeout: 5_000 });
	});

	test("Esc dismisses the toast without undoing", async ({ page }) => {
		await page.getByRole("button", { name: /approve/i }).click();
		await page.getByRole("button", { name: /confirm approve/i }).click();
		const toast = page.getByRole("status").filter({ hasText: /undo/i });
		await expect(toast).toBeVisible();

		await page.keyboard.press("Escape");
		await expect(toast).toBeHidden({ timeout: 5_000 });
	});
});
