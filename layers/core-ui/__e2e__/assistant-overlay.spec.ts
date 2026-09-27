/**
 * Journey: the assistant overlay opens from the sidebar trigger, stays open
 * across a view change, and closes on Escape or the trigger again.
 *
 * @lore component tests cover the overlay's rendering — this proves what needs a real router: trigger wiring and overlay persistence across navigation.
 *
 * @lore the overlay resolves "my agent" via search_users before reaching search_threads — without that mock every test sees the empty state.
 */

import { expect, makeUserRow, mockSearchThreads, mockSearchUsers, test } from "./fixtures";

const COC_AGENT_ID = "agent-coc";
const CURRENT_USER_ID = "test-founder";

test.describe("Assistant overlay", () => {
	test.beforeEach(async ({ page }) => {
		await mockSearchUsers(page, {
			rows: [
				makeUserRow(COC_AGENT_ID, {
					kind: "ai",
					name: "Assistant",
					role: "assistant",
					ownerUserId: CURRENT_USER_ID,
				}),
			],
		});
		await mockSearchThreads(page, { rows: [] });
	});

	test("clicking the trigger opens the overlay; Escape closes it", async ({ page }) => {
		await page.goto("/conversations");

		const trigger = page.getByTestId("sidebar-assistant-btn");
		await expect(page.getByRole("dialog", { name: /assistant conversation/i })).toHaveCount(0);

		await trigger.click();
		await expect(page.getByRole("dialog", { name: /assistant conversation/i })).toBeVisible();

		await page.keyboard.press("Escape");
		await expect(page.getByRole("dialog", { name: /assistant conversation/i })).toHaveCount(0);
	});

	test("clicking the trigger again closes the overlay", async ({ page }) => {
		await page.goto("/conversations");
		const trigger = page.getByTestId("sidebar-assistant-btn");

		await trigger.click();
		await expect(page.getByRole("dialog", { name: /assistant conversation/i })).toBeVisible();

		await trigger.click();
		await expect(page.getByRole("dialog", { name: /assistant conversation/i })).toHaveCount(0);
	});

	test("overlay state persists across view navigation (not destroyed on navigate)", async ({
		page,
	}) => {
		await page.goto("/conversations");

		const trigger = page.getByTestId("sidebar-assistant-btn");
		await trigger.click();
		await expect(page.getByRole("dialog", { name: /assistant conversation/i })).toBeVisible();

		await page.getByRole("link", { name: /work/i }).click();

		await expect(page.getByRole("dialog", { name: /assistant conversation/i })).toBeVisible();
	});
});
