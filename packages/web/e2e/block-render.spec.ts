/**
 * L2 AC-36 — Playwright e2e: a markdown body containing all 10 BlockKinds
 * renders with no literal markdown syntax visible in the DOM.
 *
 * Targets the design-system viewer's Block story (auto-discovered from
 * Block.stories.tsx). The story includes a "all kinds" variant.
 */

import { expect, test } from "./fixtures";

// TODO(L2-FU-8): Re-enable these assertions once a markdown-body fixture renders
// all 10 BlockKinds (including `html`) inside the design-system viewer. The
// L2 stories enumerate 9 kinds (no `html` variant) and the design-system
// viewer route is DEV-only, so this proof-of-execution for AC-33 / AC-36 is
// deferred to follow-up L2-FU-8. See PR #34 discussion.
test.describe("AC-36 — Block primitive renders all 10 kinds without literal markdown", () => {
	test.fixme("no leftover '#' heading prefix or '**' inline markers in rendered text", async ({
		page,
	}) => {
		await page.goto("/designsystem#Block");
		await page.waitForSelector("[data-ds-component='block']");

		// The page must contain a sample block of every BlockKind.
		for (const kind of [
			"heading",
			"paragraph",
			"list",
			"quote",
			"code",
			"table",
			"divider",
			"image",
			"html",
			"unknown",
		]) {
			const el = page.locator(`[data-ds-kind='${kind}']`).first();
			await expect(el, `expected at least one block of kind ${kind}`).toBeVisible();
		}

		// Headings are real h-tags (not literal "## ..." text).
		const h2 = page.locator("[data-ds-kind='heading'] h2").first();
		await expect(h2).toBeVisible();
		const h2Text = await h2.textContent();
		expect(h2Text ?? "").not.toMatch(/^##\s/);

		// No code-fence backticks render outside <pre><code>.
		const visibleText = await page.locator("body").innerText();
		// '```' must not appear as visible text outside a code block; assert that
		// any occurrence is inside a <pre><code>.
		expect(visibleText).not.toMatch(/^```/m);

		// '**' must not appear as visible text in paragraphs.
		const paragraph = page.locator("[data-ds-kind='paragraph']").first();
		const pText = await paragraph.textContent();
		expect(pText ?? "").not.toContain("**");
	});

	test.fixme("Block component DOM markers are lowercase", async ({ page }) => {
		await page.goto("/designsystem#Block");
		await page.waitForSelector("[data-ds-component='block']");
		const html = await page.content();
		expect(html).not.toContain('data-ds-component="Block"');
		expect(html).not.toContain('data-ds-component="BlockHandle"');
		expect(html).not.toContain('data-ds-component="BlockActionsPopover"');
	});
});
