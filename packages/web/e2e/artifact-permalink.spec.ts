// L3 — Playwright: permalink renders single full preview; unknown id 404s gracefully.
// AC-10 evidence for the single-full-preview layout.
import { expect, type Route, test } from "@playwright/test";

const FIXTURE = {
	id: "art-fixture-1",
	producingTaskId: "task-fixture-1",
	producingTaskTitle: "Initial diff",
	kind: "code_diff",
	preview: {
		kind: "code_diff",
		file: "packages/web/src/Foo.tsx",
		hunks: [
			{
				header: "@@ -1,1 +1,1 @@",
				lines: [{ kind: "add", text: "+ added" }],
			},
		],
	},
	cost: { money: "$0.01", tokens: "100" },
	threadCount: 0,
	createdAt: "2026-04-28T12:00:00.000Z",
};

test("permalink URL renders the single ArtifactPreview surface", async ({ page }) => {
	await page.route("**/api/artifacts/art-fixture-1", async (route: Route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify(FIXTURE),
		});
	});
	await page.goto("/artifacts/art-fixture-1");
	await expect(page.locator("[data-ds-component='ArtifactPreview']")).toBeVisible();
});

test("unknown artifact id renders a 'Not found' state and not a stack trace", async ({ page }) => {
	await page.route("**/api/artifacts/nonexistent-id-xyz", async (route: Route) => {
		await route.fulfill({
			status: 404,
			contentType: "application/json",
			body: JSON.stringify({ error: "Not found", code: "NOT_FOUND" }),
		});
	});
	const res = await page.goto("/artifacts/nonexistent-id-xyz");
	if (res) {
		expect([200, 404]).toContain(res.status());
	}
	await expect(page.getByText(/not found/i)).toBeVisible();
});
