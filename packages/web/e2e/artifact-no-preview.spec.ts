// L3 — Playwright: protected — preview=null renders the no-preview affordance, never a fake thumbnail.
// AC-9 + concept §4.5 hard rule #4.
import { expect, type Route, test } from "./fixtures";

const NO_PREVIEW_FIXTURE = {
	id: "art-no-preview-fixture",
	producingTaskId: "task-no-preview",
	producingTaskTitle: "Pending render",
	kind: "screenshot",
	preview: null,
	cost: { money: null, tokens: null },
	threadCount: 0,
	createdAt: "2026-04-28T13:00:00.000Z",
};

test("artifact with preview=null shows the no-preview affordance, not a fake thumbnail", async ({
	page,
}) => {
	await page.route("**/api/threads?**participant_id=**", async (route: Route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ threads: [], nextCursor: null }),
		});
	});
	await page.route("**/api/teams**", async (route: Route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ teams: [] }),
		});
	});
	await page.route("**/api/threads?**host_kind=artifact**", async (route: Route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ threads: [], nextCursor: null }),
		});
	});
	await page.route("**/api/artifacts/art-no-preview-fixture", async (route: Route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify(NO_PREVIEW_FIXTURE),
		});
	});
	await page.goto("/artifacts/art-no-preview-fixture");
	const placeholder = page.getByText(/No preview available/i);
	await expect(placeholder).toBeVisible();

	// Hard rule: no <img> may render in the placeholder area.
	const previewSurface = page.locator("[data-ds-component='ArtifactPreviewSurface']").first();
	await expect(previewSurface.locator("img")).toHaveCount(0);
});
