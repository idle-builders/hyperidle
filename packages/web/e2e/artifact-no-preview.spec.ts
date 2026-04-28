// L3 RED — Playwright: protected — preview=null renders the placeholder, never a fake thumbnail.
// AC-9 + concept §4.5 hard rule #4.
import { expect, test } from "@playwright/test";

test("artifact with preview=null shows the PREVIEW PENDING placeholder, not a fake thumbnail", async ({
	page,
}) => {
	// The seeded fixture artifact `art-no-preview-fixture` is created at
	// permalink mount time with preview:null.
	await page.goto("/artifacts/art-no-preview-fixture");
	const placeholder = page.getByText(/PREVIEW (PENDING|NOT YET RENDERED)/);
	await expect(placeholder).toBeVisible();

	// Hard rule: no <img> may render in the placeholder area.
	const previewSurface = page.locator("[data-component='ArtifactPreviewSurface']").first();
	await expect(previewSurface.locator("img")).toHaveCount(0);
});
