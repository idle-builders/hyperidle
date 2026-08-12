/**
 * AZ7 N12 (review round 1) — real rendered-geometry proof for `Button
 * size="icon"`.
 *
 * `W2-primitives.test.tsx`'s jsdom unit test asserted `className` CONTAINS the
 * string `"w-[44px]"` — that passes whether or not Tailwind actually emitted
 * a `.w-\[44px\]` rule into the served stylesheet, which is exactly how B1
 * (the conversation Send button rendering as a 17px sliver, because
 * `layers/core-ui/src/index.css`'s `@source` glob for
 * `framework/design-system/src` resolved to a directory that does not exist)
 * went undetected. jsdom has no layout engine, so a real geometry assertion
 * has to run in a real browser against the real built CSS — this is that
 * test. It measures `getBoundingClientRect()` on the actual conversation
 * composer's Send button, the exact control B1 was measured on.
 */

import { expect, test } from "./fixtures";

const THREAD_ID = "az7-icon-geometry-thread";

function makeThreadDetailResponse(): Record<string, unknown> {
	return {
		thread: {
			id: THREAD_ID,
			hostKind: "task",
			hostId: "task-az7-icon-geometry",
			initiatorId: "test-founder",
			participants: ["test-founder"],
			pinned: false,
			resolvedAt: null,
			lastActiveAt: new Date().toISOString(),
			createdAt: new Date().toISOString(),
		},
		messages: [],
		headMessageId: null,
		identities: {
			"test-founder": { name: "Test Founder" },
		},
		hostTitle: "AZ7 icon geometry proof",
	};
}

test.describe('AZ7 N12 — Button size="icon" renders its real closed-set geometry', () => {
	test("conversation composer Send button measures 32x32 on desktop (44x44 below lg, per AQ-015)", async ({
		page,
	}) => {
		await page.route(`**/api/threads/${THREAD_ID}`, async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify(makeThreadDetailResponse()),
				});
			} else {
				await route.continue();
			}
		});

		await page.setViewportSize({ width: 1440, height: 900 });
		await page.goto(`/conversations/${THREAD_ID}`, { waitUntil: "domcontentloaded" });

		const sendButton = page.locator('button[aria-label="Send message"]');
		await expect(sendButton).toBeVisible();

		// Real computed style — the artifact B1 was actually missing, not a
		// className substring.
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

	test("conversation composer Send button widens to the 44px touch floor below the lg breakpoint (AQ-015)", async ({
		page,
	}) => {
		await page.route(`**/api/threads/${THREAD_ID}`, async (route) => {
			if (route.request().method() === "GET") {
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify(makeThreadDetailResponse()),
				});
			} else {
				await route.continue();
			}
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
