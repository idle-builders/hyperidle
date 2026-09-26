/**
 * Journey: every page paints exactly one page title (one <h1>), and a
 * breadcrumb's current segment never collides with its siblings — checks
 * only a real browser's layout engine can make.
 */
import type { Locator, Page } from "@playwright/test";
import { expect, makeIdentity, makeMessage, makeThread, mockThread, test } from "./fixtures";

const REVIEW_TITLE = "International launch readiness assessment and unresolved rollout decisions";

async function expectNoHorizontalCollision(items: Locator): Promise<void> {
	const raw = await Promise.all((await items.all()).map(async (item) => item.boundingBox()));
	expect(raw.every((box) => box !== null)).toBe(true);
	const resolved = raw.filter((box) => box !== null);
	for (let index = 1; index < resolved.length; index++) {
		const previous = resolved[index - 1];
		const current = resolved[index];
		if (!(previous && current)) continue;
		expect(previous.x + previous.width).toBeLessThanOrEqual(current.x + 0.5);
	}
}

async function expectEllipsis(locator: Locator, prefix: string): Promise<void> {
	await expect(locator).toHaveCSS("text-overflow", "ellipsis");
	await expect(locator).toContainText(prefix);
	const overflow = await locator.evaluate((node) => node.scrollWidth > node.clientWidth);
	expect(overflow).toBe(true);
}

async function proveHeader(page: Page, currentText?: string): Promise<void> {
	const header = page.locator("[data-ds-component='PageHeader']").first();
	await expect(header).toBeVisible();
	await expect(page.locator("h1")).toHaveCount(1);
	const crumb = header.locator("[data-ds-component='Breadcrumb']");
	if (await crumb.count()) {
		await expect(crumb).toHaveCSS("flex-wrap", "nowrap");
		await expect(crumb.locator("[aria-current='page']")).toHaveCount(1);
		await expectNoHorizontalCollision(crumb.locator(":scope > *"));
		const current = crumb.locator("[data-breadcrumb-role='current']");
		const box = await current.boundingBox();
		expect(box?.width ?? 0).toBeGreaterThan(0);
		if (currentText) {
			await expect(current).toHaveText(currentText);
			await expectEllipsis(current, currentText.slice(0, 6));
		}
	}
	await expectNoHorizontalCollision(header.locator("h1").locator("xpath=..").locator(":scope > *"));
}

// @lore `GET /api/reviews/:id` is gone — `ReviewPage` loads via
// `open_thread`, named by the `?threadId=` query string (the review
// message's own thread), never resolved by host lookup.
const REVIEW_THREAD_ID = "thread-review-orientation";

test("review keeps one page title", async ({ page }) => {
	await mockThread(page, {
		thread: makeThread(REVIEW_THREAD_ID, {
			hostKind: "team",
			hostId: "task-orientation",
			initiatorId: "agent-1",
			members: ["agent-1", "test-founder"],
		}),
		members: [
			makeIdentity("agent-1", { name: "Agent", isAgent: true }),
			makeIdentity("test-founder", { name: "Test Founder" }),
		],
		messages: [
			makeMessage("review-orientation", REVIEW_THREAD_ID, {
				senderId: "agent-1",
				type: "review",
				payload: { title: REVIEW_TITLE, reasoning: [] },
			}),
		],
	});
	await page.setViewportSize({ width: 1024, height: 768 });
	await page.goto(`/reviews/review-orientation?threadId=${REVIEW_THREAD_ID}`);
	await proveHeader(page, REVIEW_TITLE);
});

test("standalone setup and not-found pages paint one h1", async ({ page }) => {
	await page.goto("/setup");
	await proveHeader(page);
	const submit = page.getByRole("button", { name: "Start HyperIdle" });
	await submit.scrollIntoViewIfNeeded();
	await expect(submit).toBeVisible();
	await page.goto("/missing-az11-o");
	await proveHeader(page);
});
