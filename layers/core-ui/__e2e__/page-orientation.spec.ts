import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import type { Locator, Page, Route } from "@playwright/test";
import { REVIEW_COMPOSITION_SUBJECT } from "../src/pages/review/__fixtures__/review-composition.fixture.js";
import { expect, test } from "./fixtures";

const EVIDENCE = resolve(process.cwd(), "test-results/page-orientation");
const TASK_TITLE =
	"Prepare the international launch readiness assessment for every supported market";
const ARTIFACT_TITLE = "International launch readiness assessment and unresolved rollout decisions";

async function fulfillJson(route: Route, body: unknown): Promise<void> {
	await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
}

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

async function proveHeader(
	page: Page,
	screenshotName: string,
	currentText?: string,
): Promise<void> {
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
	await page.screenshot({ path: resolve(EVIDENCE, screenshotName), fullPage: false });
}

test.beforeEach(async ({ page }) => {
	await mkdir(EVIDENCE, { recursive: true });
	await page.route("**/api/artifacts/az11-orientation", (route) =>
		fulfillJson(route, {
			id: "az11-orientation",
			producingTaskId: "task-orientation",
			producingTaskTitle: TASK_TITLE,
			kind: "code",
			label: "decision",
			preview: {
				kind: "code",
				path: ARTIFACT_TITLE,
				lang: "md",
				text: "Ready for founder review.",
			},
			threadCount: 0,
			createdAt: "2026-08-13T09:00:00.000Z",
		}),
	);
	await page.route("**/api/threads?**host_kind=artifact**", (route) =>
		fulfillJson(route, { threads: [], nextCursor: null }),
	);
	await page.route("**/api/threads?**host_kind=task**", (route) =>
		fulfillJson(route, { threads: [], nextCursor: null }),
	);
	await page.route("**/api/sessions*", (route) => fulfillJson(route, { sessions: [] }));
});

for (const viewport of [
	{ name: "desktop", width: 1440, height: 900 },
	{ name: "tablet", width: 1024, height: 768 },
	{ name: "mobile", width: 390, height: 844 },
]) {
	test(`artifact orientation paints cleanly at ${viewport.width}px`, async ({ page }) => {
		await page.setViewportSize(viewport);
		await page.goto("/artifacts/az11-orientation");
		await proveHeader(page, `artifact-${viewport.name}.png`, ARTIFACT_TITLE);
		await expect(page.locator("[data-ds-component='ArtifactPreview']")).toContainText(TASK_TITLE);
		await expect(page.locator("[data-ds-component='ArtifactPreviewSurface'] h1")).toHaveCount(0);
		await page.goto("/work/task/bet-orientation/task/task-orientation");
		await proveHeader(page, `task-${viewport.name}.png`, TASK_TITLE);
		await expect(page.getByTestId("nav-history-cluster")).toHaveCount(viewport.width > 768 ? 1 : 0);
	});
}

test("review keeps one page title", async ({ page }) => {
	await page.route("**/api/reviews/review-orientation", (route) =>
		fulfillJson(route, { ...REVIEW_COMPOSITION_SUBJECT, title: ARTIFACT_TITLE }),
	);
	await page.setViewportSize({ width: 1024, height: 768 });
	await page.goto("/reviews/review-orientation");
	await proveHeader(page, "review-tablet.png", ARTIFACT_TITLE);
});

test("standalone setup and not-found pages paint one h1", async ({ page }) => {
	await page.goto("/setup");
	await proveHeader(page, "setup-desktop.png");
	const submit = page.getByRole("button", { name: "Start HyperIdle" });
	await submit.scrollIntoViewIfNeeded();
	await expect(submit).toBeVisible();
	await page.screenshot({ path: resolve(EVIDENCE, "setup-submit-desktop.png") });
	await page.goto("/missing-az11-o");
	await proveHeader(page, "not-found-desktop.png");
});
