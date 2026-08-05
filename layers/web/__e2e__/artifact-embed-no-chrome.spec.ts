// L3 — Playwright: ArtifactEmbed root has NO chrome.
// Protected: AC-3 / approved-design §1. Targets the dev preview surface
// (/_dev/artifacts) until the production review-thread embed mount lands
// in L11. The embed is rendered identically by both surfaces — same DS
// component, same lack of bg-/border-/rounded-/shadow- classes.
import { expect, type Route, test } from "./fixtures";

const FIXTURES = [
	{
		id: "art-embed-1",
		producingTaskId: "task-embed-1",
		producingTaskTitle: "Decision: ship the diff renderer",
		kind: "decision",
		preview: { kind: "decision", claim: "Ship", rationale: "Risk acceptable" },
		threadCount: 0,
		createdAt: "2026-04-28T11:00:00.000Z",
	},
];

async function mockArtifacts(route: Route): Promise<void> {
	await route.fulfill({
		status: 200,
		contentType: "application/json",
		body: JSON.stringify({ items: FIXTURES, nextCursor: null }),
	});
}

test("ArtifactEmbed root has no bg-/border-/rounded-/shadow- chrome", async ({ page }) => {
	await page.route("**/api/threads?**participant_id=**", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ threads: [], nextCursor: null }),
		});
	});
	await page.route("**/api/teams**", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ teams: [] }),
		});
	});
	await page.route("**/api/artifacts?**", mockArtifacts);
	await page.goto("/_dev/artifacts");
	const embed = page.locator("[data-ds-component='ArtifactEmbed']").first();
	await expect(embed).toBeVisible();

	const cls = (await embed.getAttribute("class")) ?? "";
	expect(cls).not.toMatch(/\bbg-/);
	expect(cls).not.toMatch(/\bborder(-|$)/);
	expect(cls).not.toMatch(/\brounded(-|$)/);
	expect(cls).not.toMatch(/\bshadow(-|$)/);
});
