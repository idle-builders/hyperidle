/**
 * Journey: the assistant overlay opens from the sidebar trigger, stays open
 * across a view change, and closes on Escape or the trigger again.
 *
 * @lore AssistantOverlay.test.tsx and AssistantAttachButton.test.tsx cover
 * the overlay's own rendering (empty state, context chips, notice cards,
 * send/receive) at the component tier — this file proves only what needs a
 * real router: the trigger wiring and that navigating away doesn't unmount
 * the overlay.
 *
 * @lore The overlay resolves "my agent" via
 * `search_users({ kind: "ai" })` (`ownerUserId === <viewer id>`,
 * AssistantOverlay.tsx) before it ever reaches `search_threads`/
 * `open_thread` — without that mock every test sees the "Couldn't find your
 * assistant agent." empty state.
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
