/**
 * L23 — Playwright E2E: Document body rendered as Blocks (not <pre>).
 *
 * E1: Multi-section playbook has h1/h2/h3 semantics and no <pre>.
 * E2: A paragraph renders a Block shell with no card chrome.
 * E3: Edit mode shows the BodyEditor panel (WYSIWYG — no separate preview pane).
 *
 * @lore T2: textarea+preview+Save/Cancel replaced by BodyEditor + Done button.
 * - knowledge-edit-textarea → BodyEditor inside document-edit-panel
 * - document-edit-preview → no longer exists (BodyEditor IS the WYSIWYG view)
 * - Save button → auto-save (no explicit save action needed)
 * - Cancel button → Done button (exits edit mode)
 *
 * @lore BC4: repointed at `POST /api/actions/{open_document,edit_document}` via
 * `mockDocument` — never `GET/PATCH /api/knowledge/:id`, and never a
 * fixture-fallback id (`LEGACY_DETAILS`/`FALLBACK_DETAIL` are deleted —
 * DocumentDetail shows an honest not-found state with nothing mocked).
 */

import { expect, makeDocumentRow, mockDocument, mockSearchThreads, test } from "./fixtures";

const MULTI_SECTION_BODY = [
	"# Authentication Playbook",
	"",
	"## Overview",
	"",
	"We use JWT-based authentication with refresh tokens for all internal services.",
	"",
	"## Rotation",
	"",
	"### Access tokens",
	"",
	"Access tokens expire in 15 minutes.",
	"",
].join("\n");

const MOCK_ITEM = makeDocumentRow("k-l23-1", {
	title: "Authentication Playbook",
	body: MULTI_SECTION_BODY,
	scopeKind: "team",
});

test.beforeEach(async ({ page }) => {
	await mockDocument(page, { row: MOCK_ITEM });
	await mockSearchThreads(page, { rows: [] });
});

// ── E1 — Multi-section playbook has heading semantics and no <pre> ──

test.describe("E1 — Document body: multi-section playbook", () => {
	test("body container exists and is not a <pre>", async ({ page }) => {
		await page.goto(`/documents/${MOCK_ITEM.id}`);
		await page.waitForSelector("[data-testid='document-detail-page']");

		const body = page.getByTestId("document-body");
		await expect(body).toBeVisible();

		// Must NOT be a <pre> element
		const tagName = await body.evaluate((el) => el.tagName.toLowerCase());
		expect(tagName).not.toBe("pre");
	});

	test("body container has data-document-body attribute", async ({ page }) => {
		await page.goto(`/documents/${MOCK_ITEM.id}`);
		await page.waitForSelector("[data-testid='document-body']");

		const body = page.getByTestId("document-body");
		const attr = await body.getAttribute("data-document-body");
		// Attribute should exist (value may be empty string which is truthy for has)
		expect(attr).not.toBeNull();
	});

	test("edit mode shows BodyEditor panel with WYSIWYG editor", async ({ page }) => {
		// @lore T2 L23 E1: The heading-semantics assertions are preserved in the
		// DocumentBody unit tests, which render the component with known content.
		// Here we assert the structural behaviour: Edit opens the panel, Done closes it.
		await page.goto(`/documents/${MOCK_ITEM.id}`);
		await page.waitForSelector("[data-testid='document-detail-page']");

		await page.getByRole("button", { name: /edit/i }).click();

		// T2: BodyEditor panel replaces the old textarea+preview layout
		const editPanel = page.getByTestId("document-edit-panel");
		await expect(editPanel).toBeVisible();

		// The ProseMirror contenteditable should be present in the panel
		const editor = editPanel.locator(".ProseMirror");
		await expect(editor).toBeVisible();

		// Done exits edit mode and shows the read-view body
		await page.getByRole("button", { name: /done/i }).click();
		await expect(editPanel).not.toBeVisible();

		// Read-view body must NOT be a <pre>
		const body = page.getByTestId("document-body");
		await expect(body).toBeVisible();
		const tagName = await body.evaluate((el) => el.tagName.toLowerCase());
		expect(tagName).not.toBe("pre");
	});
});

// ── E2 — a paragraph renders a Block shell, no card chrome ──

test.describe("E2 — Document body: paragraph block, no chrome", () => {
	test("body renders paragraph blocks in read view", async ({ page }) => {
		await page.goto(`/documents/${MOCK_ITEM.id}`);
		await page.waitForSelector("[data-testid='document-detail-page']");

		// The body renders via DocumentBody — should have paragraph block shells
		const paragraphBlocks = page.locator(
			"[data-testid='document-body'] [data-ds-component='block'][data-ds-kind='paragraph']",
		);
		await expect(paragraphBlocks.first()).toBeVisible();
	});

	test("body container has no card/border/shadow chrome", async ({ page }) => {
		await page.goto(`/documents/${MOCK_ITEM.id}`);
		await page.waitForSelector("[data-testid='document-body']");

		const body = page.getByTestId("document-body");
		const cls = (await body.getAttribute("class")) ?? "";
		expect(cls).not.toContain("card");
		expect(cls).not.toContain("shadow");
		// We don't assert on "border" because the wrapper flex container may not have it,
		// but we assert no DaisyUI card class.
	});
});

// ── E3 — Edit-mode shows BodyEditor panel (WYSIWYG — no separate preview pane) ──

test.describe("E3 — Document body: edit-mode panel is not a <pre>", () => {
	test("clicking Edit shows the BodyEditor panel (not a <pre>)", async ({ page }) => {
		await page.goto(`/documents/${MOCK_ITEM.id}`);
		await page.waitForSelector("[data-testid='document-detail-page']");

		await page.getByRole("button", { name: /edit/i }).click();

		// T2: document-edit-panel replaces the old textarea+preview layout.
		// The panel contains the BodyEditor (TipTap .ProseMirror) — no <pre>.
		const editPanel = page.getByTestId("document-edit-panel");
		await expect(editPanel).toBeVisible();

		// The panel must not be a <pre>
		const tagName = await editPanel.evaluate((el) => el.tagName.toLowerCase());
		expect(tagName).not.toBe("pre");
	});

	test("BodyEditor panel contains a contenteditable element", async ({ page }) => {
		await page.goto(`/documents/${MOCK_ITEM.id}`);
		await page.waitForSelector("[data-testid='document-detail-page']");

		await page.getByRole("button", { name: /edit/i }).click();

		const editPanel = page.getByTestId("document-edit-panel");
		// TipTap renders a [contenteditable="true"] div inside .ProseMirror
		const contentEditable = editPanel.locator('[contenteditable="true"]');
		await expect(contentEditable).toBeVisible();
	});

	test("BodyEditor panel shows initial content from saved body", async ({ page }) => {
		await page.goto(`/documents/${MOCK_ITEM.id}`);
		await page.waitForSelector("[data-testid='document-detail-page']");

		await page.getByRole("button", { name: /edit/i }).click();

		const editPanel = page.getByTestId("document-edit-panel");
		await expect(editPanel).toBeVisible();

		// The editor should contain the mocked body content
		await expect(editPanel).toContainText("JWT-based authentication");
	});
});
