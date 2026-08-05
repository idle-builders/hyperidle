// L3 — Playwright: each Artifact layout renders against real data on the
// /_dev/artifacts preview surface (production mounts land in L11/L12).
// AC-10 evidence: gallery card, stack item, single full preview, embed.
//
// The dev preview consumes /api/artifacts via the production hook
// (useArtifacts). The test mocks that endpoint with canonical-shape Artifact
// JSON so the assertions exercise real component-rendered output without
// requiring backend seeding or auth wiring.
import { expect, type Route, test } from "./fixtures";

const ARTIFACT_FIXTURES = [
	{
		id: "art-aggregation-1",
		producingTaskId: "task-aggregation-1",
		producingTaskTitle: "Add diff renderer",
		kind: "code_diff",
		preview: {
			kind: "code_diff",
			file: "layers/web/src/Foo.tsx",
			hunks: [
				{
					header: "@@ -1,2 +1,3 @@",
					lines: [
						{ kind: "ctx", text: "context line" },
						{ kind: "add", text: "+ added line" },
					],
				},
			],
		},
		threadCount: 0,
		createdAt: "2026-04-28T10:00:00.000Z",
	},
	{
		id: "art-aggregation-2",
		producingTaskId: "task-aggregation-2",
		producingTaskTitle: "Pitch deck draft",
		kind: "deck",
		preview: { kind: "deck", slideCount: 12, firstSlideTitle: "Why now" },
		threadCount: 0,
		createdAt: "2026-04-28T09:00:00.000Z",
	},
];

async function mockArtifacts(route: Route): Promise<void> {
	await route.fulfill({
		status: 200,
		contentType: "application/json",
		body: JSON.stringify({ items: ARTIFACT_FIXTURES, nextCursor: null }),
	});
}

async function mockAppShellEndpoints(route: Route): Promise<void> {
	await route.fulfill({
		status: 200,
		contentType: "application/json",
		body: JSON.stringify({ threads: [], nextCursor: null }),
	});
}

test.describe("L3 Artifact aggregation surfaces (dev preview)", () => {
	test.beforeEach(async ({ page }) => {
		await page.route("**/api/threads?**participant_id=**", mockAppShellEndpoints);
		await page.route("**/api/teams**", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ teams: [] }),
			});
		});
		await page.route("**/api/artifacts?**", mockArtifacts);
	});

	test("renders gallery card layout", async ({ page }) => {
		await page.goto("/_dev/artifacts");
		await expect(page.locator("[data-ds-component='ArtifactGalleryCard']").first()).toBeVisible();
	});

	test("renders stack item layout", async ({ page }) => {
		await page.goto("/_dev/artifacts");
		await expect(page.locator("[data-ds-component='ArtifactStackItem']").first()).toBeVisible();
	});

	test("renders single full preview layout", async ({ page }) => {
		await page.goto("/_dev/artifacts");
		await expect(page.locator("[data-ds-component='ArtifactPreview']").first()).toBeVisible();
	});

	test("renders embed layout", async ({ page }) => {
		await page.goto("/_dev/artifacts");
		await expect(page.locator("[data-ds-component='ArtifactEmbed']").first()).toBeVisible();
	});
});
