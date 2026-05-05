/**
 * L23 — Playwright E2E: Knowledge body rendered as Blocks (not <pre>).
 *
 * E1: Multi-section playbook has h1/h2/h3 semantics and no <pre>.
 * E2: 3-sentence belief renders 3 paragraph Block shells with no card chrome.
 * E3: Edit mode preview re-renders as Blocks with data-testid="knowledge-edit-preview".
 *
 * All three rely on the KnowledgeBody component from L23 being wired into
 * KnowledgeDetail. They will fail until Phase B lands.
 */

import { expect, test } from "@playwright/test";

// ── E1 — Multi-section playbook has heading semantics and no <pre> ──

test.describe("E1 — Knowledge body: multi-section playbook", () => {
	test("body container exists and is not a <pre>", async ({ page }) => {
		// k-playbook does not exist in the fixture; use k1 which has content.
		// For E1 we need a multi-section body. The fixture k1 is a single-paragraph
		// body. We navigate to k1 and use the Edit flow to set a multi-section body
		// during the test — OR we rely on the existing fixture bodies.
		// @lore L23 E1: The fixture doesn't include a multi-section playbook by default.
		// We use the Edit flow to inject one before asserting.
		await page.goto("/knowledge/k1");
		await page.waitForSelector("[data-testid='knowledge-detail-page']");

		const body = page.getByTestId("knowledge-body");
		await expect(body).toBeVisible();

		// Must NOT be a <pre> element
		const tagName = await body.evaluate((el) => el.tagName.toLowerCase());
		expect(tagName).not.toBe("pre");
	});

	test("body container has data-knowledge-body attribute", async ({ page }) => {
		await page.goto("/knowledge/k1");
		await page.waitForSelector("[data-testid='knowledge-body']");

		const body = page.getByTestId("knowledge-body");
		const attr = await body.getAttribute("data-knowledge-body");
		// Attribute should exist (value may be empty string which is truthy for has)
		expect(attr).not.toBeNull();
	});

	test("multi-section body has h1 and h2 semantic headings", async ({ page }) => {
		// Inject a multi-section playbook via the edit flow.
		await page.goto("/knowledge/k1");
		await page.waitForSelector("[data-testid='knowledge-detail-page']");

		await page.getByRole("button", { name: /edit/i }).click();
		const textarea = page.getByTestId("knowledge-edit-textarea");
		await textarea.fill(
			[
				"# Onboarding playbook",
				"",
				"Quick reference for new agent provisioning.",
				"",
				"## Provisioning",
				"",
				"Follow the runbook.",
				"",
				"## Permissions",
				"",
				"Grant via the role-template.",
				"",
				"## Verification",
				"",
				"Confirm with bun run check.",
				"",
				"## Rollback",
				"",
				"git revert then re-run provisioning.",
			].join("\n"),
		);
		await page.getByRole("button", { name: /save/i }).click();
		await page.waitForSelector("[data-testid='knowledge-body']");

		// Assert h1 present
		const h1 = page.locator("[data-testid='knowledge-body'] h1").first();
		await expect(h1).toBeVisible();
		await expect(h1).toContainText("Onboarding playbook");

		// Assert at least 4 h2 elements
		const h2s = page.locator("[data-testid='knowledge-body'] h2");
		await expect(h2s).toHaveCount(4);

		// No <pre> inside the body
		const preCount = await page.locator("[data-testid='knowledge-body'] pre").count();
		expect(preCount).toBe(0);
	});
});

// ── E2 — 3-sentence belief: 3 paragraph Blocks, no card chrome ──

test.describe("E2 — Knowledge body: 3-sentence belief, no chrome", () => {
	test("renders 3 paragraph Block shells for k1 content", async ({ page }) => {
		// First set a known 3-paragraph body via the edit flow.
		await page.goto("/knowledge/k1");
		await page.waitForSelector("[data-testid='knowledge-detail-page']");

		await page.getByRole("button", { name: /edit/i }).click();
		const textarea = page.getByTestId("knowledge-edit-textarea");
		await textarea.fill(
			[
				"JWT-based authentication with refresh tokens. Access tokens expire in 15 minutes.",
				"",
				"Refresh tokens last 7 days; rotation is automatic.",
				"",
				"All tokens are stored in httpOnly cookies, never localStorage.",
			].join("\n"),
		);
		await page.getByRole("button", { name: /save/i }).click();
		await page.waitForSelector("[data-testid='knowledge-body']");

		const paragraphBlocks = page.locator(
			"[data-testid='knowledge-body'] [data-ds-component='block'][data-ds-kind='paragraph']",
		);
		await expect(paragraphBlocks).toHaveCount(3);
	});

	test("body container has no card/border/shadow chrome", async ({ page }) => {
		await page.goto("/knowledge/k1");
		await page.waitForSelector("[data-testid='knowledge-body']");

		const body = page.getByTestId("knowledge-body");
		const cls = (await body.getAttribute("class")) ?? "";
		expect(cls).not.toContain("card");
		expect(cls).not.toContain("shadow");
		// We don't assert on "border" because the wrapper flex container may not have it,
		// but we assert no DaisyUI card class.
	});
});

// ── E3 — Edit-mode preview re-renders as Blocks ──

test.describe("E3 — Knowledge body: edit-mode preview is not a <pre>", () => {
	test("clicking Edit shows a preview pane that is not a <pre>", async ({ page }) => {
		await page.goto("/knowledge/k1");
		await page.waitForSelector("[data-testid='knowledge-detail-page']");

		await page.getByRole("button", { name: /edit/i }).click();

		const preview = page.getByTestId("knowledge-edit-preview");
		await expect(preview).toBeVisible();

		const tagName = await preview.evaluate((el) => el.tagName.toLowerCase());
		expect(tagName).not.toBe("pre");
	});

	test("edit-mode preview has data-knowledge-body attribute", async ({ page }) => {
		await page.goto("/knowledge/k1");
		await page.waitForSelector("[data-testid='knowledge-detail-page']");

		await page.getByRole("button", { name: /edit/i }).click();

		const preview = page.getByTestId("knowledge-edit-preview");
		const attr = await preview.getAttribute("data-knowledge-body");
		expect(attr).not.toBeNull();
	});

	test("typing in the edit textarea updates the preview Blocks", async ({ page }) => {
		await page.goto("/knowledge/k1");
		await page.waitForSelector("[data-testid='knowledge-detail-page']");

		await page.getByRole("button", { name: /edit/i }).click();

		const textarea = page.getByTestId("knowledge-edit-textarea");
		await textarea.fill("Preview update paragraph.");

		const preview = page.getByTestId("knowledge-edit-preview");
		// Preview should contain a Block shell after typing
		const blocks = preview.locator('[data-ds-component="block"]');
		await expect(blocks.first()).toBeVisible();
		await expect(preview).toContainText("Preview update paragraph.");
	});
});
