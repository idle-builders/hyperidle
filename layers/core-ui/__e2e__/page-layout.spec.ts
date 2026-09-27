import type { Locator, Page, Route } from "@playwright/test";
import { REVIEW_COMPOSITION_SUBJECT } from "../src/pages/review/__fixtures__/review-composition.fixture.js";
import {
	expect,
	makeDocumentRow,
	makeIdentity,
	makeMessage,
	makeThread,
	makeUserRow,
	mockDocument,
	mockSearchSessions,
	mockSearchThreads,
	mockSearchUsers,
	mockThread,
	test,
} from "./fixtures";

const NOW = "2026-08-14T08:00:00.000Z";

async function json(route: Route, body: unknown): Promise<void> {
	await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
}

async function box(locator: Locator) {
	const value = await locator.boundingBox();
	if (!value) throw new Error("Visible layout target has no painted box");
	return value;
}

async function expectSameX(a: Locator, b: Locator): Promise<void> {
	const [left, right] = await Promise.all([box(a), box(b)]);
	expect(Math.abs(left.x - right.x)).toBeLessThanOrEqual(1);
}

async function mockPrimarySurfaces(page: Page): Promise<void> {
	// @lore kind:"human" here — kind:"ai" would also answer SettingsAgents' own search and trigger unmocked network calls this test doesn't want.
	await mockSearchUsers(page, {
		rows: [
			makeUserRow("member-team-a", { team: { id: "team-a", name: "Core" } }),
			makeUserRow("member-team-b", { team: { id: "team-b", name: "Growth" } }),
		],
	});
	await page.route("**/api/actions/search_tasks", (route) => json(route, { ok: true, data: [] }));
	// The thread door is `POST /api/actions/{search_threads, open_thread}`
	// — never `GET /api/threads*`. There is no `task` host kind (a
	// task's own thread is `team`-hosted).
	const layoutThread = makeThread("layout-thread", {
		hostKind: "team",
		hostId: "team-layout",
		initiatorId: "agent-layout",
		members: ["agent-layout", "test-founder"],
		lastActiveAt: NOW,
		createdAt: NOW,
	});
	await mockThread(page, {
		thread: layoutThread,
		members: [
			makeIdentity("agent-layout", { name: "Atlas", role: "agent", isAgent: true }),
			makeIdentity("test-founder", { name: "Test Founder", role: "founder" }),
		],
		messages: [
			makeMessage("layout-message", "layout-thread", {
				senderId: "agent-layout",
				payload: { text: "A real populated message for the readable lane.", refs: [] },
				clientKey: "layout-message-key",
				createdAt: NOW,
			}),
		],
		hostTitle: "Layout task",
	});
	await mockSearchSessions(page, { rows: [] });
	await mockSearchThreads(page, { rows: [] });
	await mockDocument(page, {
		row: makeDocumentRow("k1", { scopeKind: "team", scopeId: "team-a" }),
	});
}

for (const viewport of [
	{ width: 1440, height: 900 },
	{ width: 1024, height: 768 },
]) {
	test(`stable frame and content lanes paint at ${viewport.width}px`, async ({ page }) => {
		await page.setViewportSize(viewport);
		await mockPrimarySurfaces(page);

		await page.goto("/work");
		await expect(page.getByTestId("team-row").first()).toBeVisible();
		await expectSameX(
			page.getByRole("heading", { level: 1 }),
			page.getByTestId("team-row").first(),
		);

		await page.goto("/conversations/layout-thread");
		const readLane = page.locator("[data-ds-component='PartList']").locator("xpath=..");
		const frame = page.locator("[data-ds-component='PageHeader'] [data-page-frame]");
		const [readBox, frameBox] = await Promise.all([box(readLane), box(frame)]);
		expect(readBox.width).toBeLessThanOrEqual(761);
		expect(
			Math.abs(readBox.x + readBox.width / 2 - (frameBox.x + frameBox.width / 2)),
		).toBeLessThanOrEqual(1);

		await page.goto("/documents/k1");
		await expect(page.getByTestId("document-body")).toBeVisible();
		const workbench = page.getByTestId("document-metadata-aside").locator("xpath=..");
		await expectSameX(page.getByRole("heading", { level: 1 }), workbench);

		await page.goto("/settings");
		const focus = page.getByTestId("settings-section-profile");
		const focusFrame = page.locator("[data-page-scroll] [data-page-frame]");
		await focus.scrollIntoViewIfNeeded();
		const [focusBox, focusFrameBox] = await Promise.all([box(focus), box(focusFrame)]);
		expect(focusBox.width).toBeLessThanOrEqual(720);
		// @lore FR-9: Settings content left-aligns with the page frame, not centered — this tolerance only rules out a centered layout.
		expect(Math.abs(focusBox.x - focusFrameBox.x)).toBeLessThanOrEqual(30);
	});
}

// @lore WorkTeam's split view is agent-selection only — a routine's split pane is gone with WorkRoutine.

test("review with an artifact open uses two local panes", async ({ page }) => {
	// ReviewPage's default loader reads
	// the review message straight off `open_thread`. `artifacts` passes
	// through the loader unchanged, so reusing the composed fixture's
	// artifacts here (summary/badge included) reproduces the same render.
	const reviewThreadId = "thread-review-layout";
	const reviewThread = makeThread(reviewThreadId, {
		hostKind: "team",
		hostId: "team-layout",
		initiatorId: "test-founder",
		members: ["test-founder", "agent-layout"],
		lastActiveAt: NOW,
		createdAt: NOW,
	});
	await mockThread(page, {
		thread: reviewThread,
		members: [
			makeIdentity("test-founder", { name: "Test Founder", role: "founder" }),
			makeIdentity("agent-layout", { name: "Atlas", role: "agent", isAgent: true }),
		],
		messages: [
			makeMessage("review-layout", reviewThreadId, {
				senderId: "agent-layout",
				type: "review",
				payload: {
					title: REVIEW_COMPOSITION_SUBJECT.title,
					reasoning: [REVIEW_COMPOSITION_SUBJECT.prompt],
					artifacts: REVIEW_COMPOSITION_SUBJECT.artifacts,
				},
				createdAt: NOW,
			}),
		],
	});
	await page.setViewportSize({ width: 1024, height: 768 });
	await page.goto(`/reviews/review-layout?threadId=${reviewThreadId}`);
	await page
		.getByText(REVIEW_COMPOSITION_SUBJECT.artifacts[0]?.title ?? "", { exact: true })
		.click();
	const split = page.locator("[data-ds-component='split-view']");
	await expect(split).toBeVisible();
	const main = page.getByTestId("main-content");
	const originPane = split.locator(":scope > div").first();
	const destinationPane = split.locator(":scope > div").last();
	const [mainStyle, splitStyle, originStyle, destinationStyle] = await Promise.all(
		[main, split, originPane, destinationPane].map((locator) =>
			locator.evaluate((element) => {
				const style = getComputedStyle(element);
				return { backgroundColor: style.backgroundColor, boxShadow: style.boxShadow };
			}),
		),
	);
	expect(mainStyle).toEqual({ backgroundColor: "rgba(0, 0, 0, 0)", boxShadow: "none" });
	expect(splitStyle.backgroundColor).toBe("rgba(0, 0, 0, 0)");
	expect(originStyle.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
	expect(destinationStyle.backgroundColor).toBe(originStyle.backgroundColor);
	const [mainBox, splitBox, originBox, destinationBox] = await Promise.all([
		box(main),
		box(split),
		box(originPane),
		box(destinationPane),
	]);
	expect(splitBox).toEqual(mainBox);
	expect(destinationBox.x - (originBox.x + originBox.width)).toBeGreaterThan(0);
	await expect(split.getByRole("separator").locator("span")).toHaveCount(0);
	await expect(split.locator("[data-page-frame]")).toHaveCount(0);
	await expect(split.locator("[data-ds-component='PageHeader'] h2")).toHaveCount(2);
	const destinationTitle = split
		.locator(":scope > div")
		.last()
		.locator("h2")
		.getByText(REVIEW_COMPOSITION_SUBJECT.artifacts[0]?.title ?? "", { exact: true });
	await expect(destinationTitle).toBeVisible();
	expect((await box(destinationTitle)).width).toBeGreaterThan(96);
	await page.evaluate(() => document.documentElement.setAttribute("data-theme", "hearth-dark"));
});
