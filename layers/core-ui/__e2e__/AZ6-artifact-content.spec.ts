/**
 * AZ6 — the panel around an artifact contributes surface, never typography.
 *
 * This half of the claim is about CSS inheritance, which only exists in a browser:
 * the defect was a class on the panel cascading into everything it wrapped. A jsdom
 * test can only check that the class is gone; this checks what the user sees.
 */
import { expect, type Route, test } from "./fixtures";

const BODY = `# Q3 pricing decision

We recommend moving the Pro tier from **$29** to **$39**/month.

- Churn at $29 is 4.1%.
- Two competitors sit above $35.

| Tier | Now | Proposed |
| --- | --- | --- |
| Pro | $29 | $39 |
`;

test.beforeEach(async ({ page }) => {
	await page.route("**/api/artifacts/az6-prose", async (route: Route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({
				id: "az6-prose",
				producingTaskId: "task-prose",
				producingTaskTitle: "Price the Pro tier",
				kind: "text",
				label: "decision",
				preview: { kind: "text", body: BODY, format: "markdown" },
				threadCount: 0,
				createdAt: "2026-08-11T09:00:00.000Z",
			}),
		});
	});
});

test("the artifact's own letter case survives to the screen", async ({ page }) => {
	await page.goto("/artifacts/az6-prose");
	const heading = page.locator("[data-ds-component='ArtifactPreviewSurface'] h2").first();

	// What the user reads, not what the DOM holds: innerText reflects text-transform.
	await expect(heading).toBeVisible();
	expect(await heading.innerText()).toBe("Q3 pricing decision");
});

test("the panel imposes neither uppercase nor a monospace face on the content", async ({
	page,
}) => {
	await page.goto("/artifacts/az6-prose");
	const heading = page.locator("[data-ds-component='ArtifactPreviewSurface'] h2").first();

	await expect(heading).toHaveCSS("text-transform", "none");
	const fontFamily = await heading.evaluate((el) => getComputedStyle(el).fontFamily);
	expect(fontFamily.toLowerCase()).not.toContain("mono");
});

test("the panel does not tint the content it wraps", async ({ page }) => {
	// The panel used to declare --text-tertiary for its caption, which every artifact
	// then inherited. AC #2 names colour alongside case, face and alignment, so it is
	// measured the same way: computed, in a browser, on the real permalink.
	await page.goto("/artifacts/az6-prose");
	const surface = page.locator("[data-ds-component='ArtifactPreviewSurface']");
	const tertiary = await page.evaluate(() =>
		getComputedStyle(document.documentElement).getPropertyValue("--text-tertiary").trim(),
	);
	const primary = await page.evaluate(() =>
		getComputedStyle(document.documentElement).getPropertyValue("--text-primary").trim(),
	);
	expect(tertiary).not.toBe(primary);

	const asRgb = async (token: string) =>
		page.evaluate((value) => {
			const probe = document.createElement("span");
			probe.style.color = value;
			document.body.appendChild(probe);
			const resolved = getComputedStyle(probe).color;
			probe.remove();
			return resolved;
		}, token);

	const headingColour = await surface
		.locator("h2")
		.first()
		.evaluate((el) => getComputedStyle(el).color);
	const bodyColour = await surface
		.locator("p")
		.first()
		.evaluate((el) => getComputedStyle(el).color);
	expect(headingColour).toBe(await asRgb(primary));
	expect(bodyColour).toBe(await asRgb(primary));
	expect(headingColour).not.toBe(await asRgb(tertiary));
});

test("content starts at the left edge of the panel, not in a centred column", async ({ page }) => {
	await page.goto("/artifacts/az6-prose");
	const surface = page.locator("[data-ds-component='ArtifactPreviewSurface']");
	const heading = surface.locator("h2").first();

	const panel = await surface.boundingBox();
	const text = await heading.boundingBox();
	if (!(panel && text)) throw new Error("no layout");

	// Left-aligned: the heading begins within the panel's own padding, not floated
	// into the middle. 24px allows the 12px padding plus rounding.
	expect(text.x - panel.x).toBeLessThan(24);
});

test("a list in an artifact has visible markers", async ({ page }) => {
	await page.goto("/artifacts/az6-prose");
	const list = page.locator("[data-ds-component='ArtifactPreviewSurface'] ul").first();
	await expect(list).toHaveCSS("list-style-type", "disc");
});
