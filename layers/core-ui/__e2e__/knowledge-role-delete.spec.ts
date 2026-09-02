/**
 * E2E for Settings → Skills & Rules delete (RowDeleteAction on a
 * KnowledgeRoleList row).
 *
 * @lore knowledge-attachment-slot: jsdom/RTL cannot catch this class of bug.
 * `SettingsSkillsAndRules.test.tsx` drives the same flow with
 * `userEvent.click()`, which dispatches synthetic events straight at the
 * element it holds a reference to — it never reproduces what a REAL mouse
 * click does along the way (`scrollIntoViewIfNeeded`, real native
 * mousedown/mouseup, real `scroll`/`resize` events firing on the document).
 * That gap is exactly what let a real regression through review: an earlier
 * version of the anchored Menu closed itself on ANY `document` `scroll`
 * event (to avoid a stale position) — but on a real, tall, stacked Settings
 * page, simply scrolling the kebab trigger into view to click it fired that
 * listener and closed the menu before the click that opened it had even
 * finished landing. `SettingsSkillsAndRules.test.tsx` stayed green throughout
 * because jsdom's `userEvent.click()` never scrolls anything and never fires
 * a real `scroll` event. This spec — real Chromium, real mouse clicks — is
 * what actually watched that regression fail (the "Delete" menuitem never
 * appeared; the click on the kebab timed out) and now watches it pass.
 */
import { expect, test } from "./fixtures";

const ITEM = { id: "ki-skill-1", title: "write-tests", role: "skill", status: "active" };

test.describe("Settings → Skills & rules: delete", () => {
	test.beforeEach(async ({ page }) => {
		let archived = false;
		await page.route("**/api/knowledge/ki-skill-1/archive", async (route) => {
			if (route.request().method() === "POST") {
				archived = true;
				await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
			} else {
				await route.continue();
			}
		});
		await page.route("**/api/knowledge", async (route) => {
			if (route.request().method() !== "GET") {
				await route.continue();
				return;
			}
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ items: archived ? [] : [ITEM] }),
			});
		});
	});

	test("kebab → Delete → Confirm delete?, all real mouse clicks: archives, never navigates", async ({
		page,
	}) => {
		await page.goto("/settings");
		await page.waitForSelector("[data-testid='settings-page']");

		const row = page.getByTestId("knowledge-role-row").filter({ hasText: "write-tests" });
		await expect(row).toBeVisible();

		// Real click — Playwright scrolls the trigger into view first, exactly
		// like a user reaching a section partway down the stacked Settings
		// page, then dispatches real mousedown/mouseup/click.
		await row.getByRole("button", { name: /actions for write-tests/i }).click();
		await page.getByRole("menuitem", { name: /^delete$/i }).click();

		const confirmButton = row.getByRole("button", { name: /confirm delete\?/i });
		await expect(confirmButton).toBeVisible();

		const archiveRequest = page.waitForRequest(
			(req) => req.url().includes("/api/knowledge/ki-skill-1/archive") && req.method() === "POST",
			{ timeout: 5_000 },
		);
		await confirmButton.click();

		await expect(archiveRequest).resolves.toBeTruthy();
		await expect(page).toHaveURL(/\/settings$/);
		await expect(page.getByText("write-tests")).not.toBeVisible();
	});
});
