/**
 * E2E for Settings → Skills & Rules delete (the one-click Delete button on
 * a KnowledgeRoleList row).
 *
 * @lore knowledge-attachment-slot: jsdom/RTL cannot catch this class of bug.
 * `SettingsSkillsAndRules.test.tsx` drives the same click with
 * `userEvent.click()`, which dispatches synthetic events straight at the
 * element it holds a reference to — it never reproduces what a REAL mouse
 * click does along the way (real native mousedown/mouseup, real anchor
 * navigation). That gap is exactly what let the previous kebab/confirm
 * design ship completely broken: a real anchor swallowed the "Delete" click
 * as navigation before the confirm step ever ran, four separate fix
 * attempts stayed green in jsdom, and the founder's call afterward was to
 * drop the confirm step entirely — one real button, one real click, no menu
 * to intercept it. This spec — real Chromium, a real mouse click — is what
 * actually proves that first click both fires the archive request and
 * leaves the row's own click-to-navigate path alone.
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

	test("one real mouse click on Delete: archives immediately, never navigates", async ({
		page,
	}) => {
		await page.goto("/settings");
		await page.waitForSelector("[data-testid='settings-page']");

		const row = page.getByTestId("knowledge-role-row").filter({ hasText: "write-tests" });
		await expect(row).toBeVisible();

		const archiveRequest = page.waitForRequest(
			(req) => req.url().includes("/api/knowledge/ki-skill-1/archive") && req.method() === "POST",
			{ timeout: 5_000 },
		);

		// Real click — Playwright scrolls the button into view first, exactly
		// like a user reaching a section partway down the stacked Settings
		// page, then dispatches real mousedown/mouseup/click. No menu, no
		// confirm step: this single click is the whole delete flow.
		await row.getByRole("button", { name: /delete write-tests/i }).click();

		await expect(archiveRequest).resolves.toBeTruthy();
		await expect(page).toHaveURL(/\/settings$/);
		await expect(page.getByText("write-tests")).not.toBeVisible();
	});
});
