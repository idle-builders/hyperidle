/**
 * Real-browser geometry proof for the conversation composer's Send button.
 *
 * A jsdom unit test asserting `className` contains `"w-[44px]"` passes
 * whether or not the built stylesheet actually emits that rule — jsdom has
 * no layout engine. This measures `getBoundingClientRect()` on the real
 * composer's Send button in a real browser, the only way to catch a build
 * config gap that strips the rule (previously caught this way: a `@source`
 * glob pointing at a directory that didn't exist rendered Send as a 17px
 * sliver).
 */

import { expect, makeIdentity, makeThread, mockThread, test } from "./fixtures";

const THREAD_ID = "send-geometry-thread";

const GEOMETRY_THREAD = makeThread(THREAD_ID, {
	hostKind: "team",
	hostId: "task-send-geometry",
	initiatorId: "test-founder",
	members: ["test-founder"],
	lastActiveAt: new Date().toISOString(),
	createdAt: new Date().toISOString(),
});

test.describe('Button size="icon" renders its real closed-set geometry', () => {
	test("conversation composer Send button measures 32x32 on desktop (44x44 below lg, per the touch-target rule)", async ({
		page,
	}) => {
		await mockThread(page, {
			thread: GEOMETRY_THREAD,
			members: [makeIdentity("test-founder", { name: "Test Founder" })],
			hostTitle: "Send button geometry proof",
		});

		await page.setViewportSize({ width: 1440, height: 900 });
		await page.goto(`/conversations/${THREAD_ID}`, { waitUntil: "domcontentloaded" });

		const sendButton = page.locator('button[aria-label="Send message"]');
		await expect(sendButton).toBeVisible();

		// Real computed style — not a className substring.
		const computed = await sendButton.evaluate((el) => {
			const cs = getComputedStyle(el);
			return { width: cs.width, height: cs.height, borderRadius: cs.borderRadius };
		});
		expect(computed.width).toBe("32px");
		expect(computed.height).toBe("32px");
		expect(computed.borderRadius).toBe("9999px");

		// Real layout box too — belt and suspenders against a future
		// computed-style-only regression (e.g. box-sizing changes).
		const box = await sendButton.boundingBox();
		expect(box?.width).toBe(32);
		expect(box?.height).toBe(32);
	});

	test("conversation composer Send button widens to the 44px touch floor below the lg breakpoint", async ({
		page,
	}) => {
		await mockThread(page, {
			thread: GEOMETRY_THREAD,
			members: [makeIdentity("test-founder", { name: "Test Founder" })],
			hostTitle: "Send button geometry proof",
		});

		// Below Tailwind's lg breakpoint (1024px) — the mobile-first base
		// min-h-[44px]/w-[44px] must win.
		await page.setViewportSize({ width: 768, height: 1024 });
		await page.goto(`/conversations/${THREAD_ID}`, { waitUntil: "domcontentloaded" });

		const sendButton = page.locator('button[aria-label="Send message"]');
		await expect(sendButton).toBeVisible();

		const computed = await sendButton.evaluate((el) => getComputedStyle(el).width);
		expect(computed).toBe("44px");
	});
});
