// L3 RED — Playwright: ArtifactEmbed inside a review thread has NO chrome.
// Protected: AC-3 / approved-design §1.
import { expect, test } from "@playwright/test";

test("ArtifactEmbed root has no bg-/border-/rounded-/shadow- chrome inside a review message", async ({
	page,
}) => {
	await page.goto("/conversations/review");
	const embed = page.locator("[data-component='ArtifactEmbed']").first();
	await expect(embed).toBeVisible();

	const cls = (await embed.getAttribute("class")) ?? "";
	expect(cls).not.toMatch(/\bbg-/);
	expect(cls).not.toMatch(/\bborder(-|$)/);
	expect(cls).not.toMatch(/\brounded(-|$)/);
	expect(cls).not.toMatch(/\bshadow(-|$)/);
});
