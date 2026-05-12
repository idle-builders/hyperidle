// L3 — Playwright: cost chip renders the pending em-dash when cost is null.
// Protected: AC-7 / approved-design §3 cost-pending row.
import { expect, type Route, test } from "./fixtures";

const COST_PENDING_FIXTURE = {
	id: "art-cost-pending-fixture",
	producingTaskId: "task-cost-pending",
	producingTaskTitle: "Pending cost settle",
	kind: "decision",
	preview: { kind: "decision", claim: "Defer", rationale: "Need more data" },
	cost: { money: null, tokens: null },
	threadCount: 0,
	createdAt: "2026-04-28T14:00:00.000Z",
};

test("cost chip renders em-dash for an artifact with unsettled cost", async ({ page }) => {
	await page.route("**/api/artifacts/art-cost-pending-fixture", async (route: Route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify(COST_PENDING_FIXTURE),
		});
	});
	await page.goto("/artifacts/art-cost-pending-fixture");
	const chip = page.locator("[data-ds-component='ArtifactCostChip']").first();
	await expect(chip).toBeVisible();
	const text = (await chip.textContent()) ?? "";
	expect(text).toContain("—");
	expect(text).not.toContain("$0.00");
	expect(text.trim()).not.toBe("");
});
