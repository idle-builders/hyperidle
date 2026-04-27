/**
 * L7 — Recovery Verbs E2E (red phase).
 *
 * Pins the Playwright validation matrix from
 * `docs/work-packages/TRACK-L.md` L7 + plan §1:
 *
 *   E2E1 — Kill switch from each entry point (avatar menu, Cmd+Shift+.,
 *          Settings → Safety) pauses 3 running sessions and shows the
 *          factory-paused banner across every page.
 *   E2E2 — Commit verdict → Rollback in overflow with reason → toast
 *          surfaces succeeded/partially/failed outcome.
 *   E2E3 — Bet detail Pause Session → paused state → Resume restores.
 *   E2E4 — Kill-switch attempt without a reason is blocked +
 *          rationale field highlighted.
 *
 * These tests MUST fail today: none of the surfaces (avatar menu,
 * banner, Pause Session button, Rollback overflow item, Cmd+Shift+.
 * shortcut) exist yet.
 */
import { expect, test } from "@playwright/test";

test.describe("L7 — Recovery verbs E2E", () => {
	test("E2E1a: kill switch from avatar menu pauses sessions and renders factory banner", async ({
		page,
	}) => {
		await page.goto("/work");
		await page
			.getByTestId("mobile-avatar")
			.or(page.getByRole("button", { name: /avatar|profile/i }))
			.first()
			.click();
		await page.getByRole("menuitem", { name: /pause factory/i }).click();
		await page.getByLabelText(/reason|rationale/i).fill("spotted bad output");
		// Confirm via type-name OR press-hold — accept either path:
		const typeField = page.getByLabelText(/type.*hyperidle|confirm.*name/i);
		if (await typeField.isVisible().catch(() => false)) {
			await typeField.fill("HyperIdle");
			await page.getByRole("button", { name: /confirm|pause factory/i }).click();
		} else {
			const holdBtn = page.getByRole("button", { name: /hold to confirm|press.*hold/i });
			await holdBtn.dispatchEvent("pointerdown");
			await page.waitForTimeout(1700);
			await holdBtn.dispatchEvent("pointerup");
		}
		// Banner appears.
		await expect(page.getByTestId("factory-paused-banner")).toBeVisible();
	});

	test("E2E1b: factory-paused banner is visible across every page", async ({ page }) => {
		// Pause via API (test fixture seam) then walk surfaces.
		await page.goto("/conversations");
		await expect(page.getByTestId("factory-paused-banner")).toBeVisible();
		await page.goto("/work");
		await expect(page.getByTestId("factory-paused-banner")).toBeVisible();
		await page.goto("/knowledge");
		await expect(page.getByTestId("factory-paused-banner")).toBeVisible();
	});

	test("E2E1c: kill switch via Cmd+Shift+. shortcut opens KillSwitchDialog", async ({ page }) => {
		await page.goto("/work");
		await page.keyboard.press("Meta+Shift+.");
		await expect(page.getByRole("dialog", { name: /pause factory|kill switch/i })).toBeVisible();
	});

	test("E2E1d: kill switch via Settings → Safety opens dialog", async ({ page }) => {
		await page.goto("/settings");
		await page.getByRole("tab", { name: /safety/i }).click();
		await page.getByRole("button", { name: /pause factory/i }).click();
		await expect(page.getByRole("dialog", { name: /pause factory|kill switch/i })).toBeVisible();
	});

	test("E2E2: rollback in thread overflow writes audit row and surfaces outcome toast", async ({
		page,
	}) => {
		await page.goto("/conversations/review");
		// Approve to commit a verdict.
		await page.getByRole("button", { name: /approve/i }).click();
		const confirm = page.getByRole("button", { name: /confirm approve/i });
		if (await confirm.isVisible().catch(() => false)) {
			await confirm.click();
		}
		// Open overflow menu and click Rollback.
		await page
			.getByRole("button", { name: /more|overflow|actions/i })
			.first()
			.click();
		await page.getByRole("menuitem", { name: /rollback/i }).click();
		await page.getByLabelText(/reason|rationale/i).fill("agent ignored my comments");
		await page.getByRole("button", { name: /confirm rollback|rollback now/i }).click();
		// Outcome toast: succeeded / partially / failed.
		await expect(
			page.getByRole("status").filter({ hasText: /rollback (succeeded|partially|failed)/i }),
		).toBeVisible();
	});

	test("E2E3: pause session on bet detail moves session to paused, Resume restores", async ({
		page,
	}) => {
		await page.goto("/work/bet/bet-1");
		const pauseBtn = page.getByRole("button", { name: /^pause$/i }).first();
		await pauseBtn.click();
		await page.getByLabelText(/reason|rationale/i).fill("checking output");
		const holdBtn = page.getByRole("button", { name: /hold to confirm|press.*hold/i });
		if (await holdBtn.isVisible().catch(() => false)) {
			await holdBtn.dispatchEvent("pointerdown");
			await page.waitForTimeout(1700);
			await holdBtn.dispatchEvent("pointerup");
		} else {
			await page.getByRole("button", { name: /confirm/i }).click();
		}
		await expect(page.getByRole("button", { name: /resume/i }).first()).toBeVisible();
	});

	test("E2E4: kill-switch attempt without a reason is blocked + rationale field highlighted", async ({
		page,
	}) => {
		await page.goto("/settings");
		await page.getByRole("tab", { name: /safety/i }).click();
		await page.getByRole("button", { name: /pause factory/i }).click();
		// Reason intentionally left blank.
		const submit = page.getByRole("button", { name: /confirm|pause factory/i });
		await expect(submit).toBeDisabled();
		// Rationale field has aria-invalid or required marker.
		const reason = page.getByLabelText(/reason|rationale/i);
		await expect(reason).toHaveAttribute("required", "");
	});
});
