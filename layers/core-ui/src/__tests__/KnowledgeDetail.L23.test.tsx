/**
 * L23 — KnowledgeDetail renderer replacement tests (red phase).
 *
 * T8: data-testid="knowledge-body" resolves to [data-knowledge-body] div, NOT a <pre>.
 * T9: Edit-mode preview pane is a KnowledgeBody instance, not a <pre>.
 * T10: LEGACY_DETAILS and LEGACY_SOURCES constants are gone (R1-gated).
 *
 * The protected legacy source-text assertion continues to live in
 * KnowledgeDetail.test.tsx. The "company"/"belief" Kind-row assertion that
 * used to live here is DELETED — `kind` is
 * retired vocabulary (AC6) and the row itself no longer renders.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { KnowledgeDetail } from "../pages/KnowledgeDetail";

function renderPage(knowledgeId = "k1"): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={[`/knowledge/${knowledgeId}`]}>
			<Routes>
				<Route path="/knowledge/:knowledgeId" element={<KnowledgeDetail />} />
			</Routes>
		</MemoryRouter>,
	);
}

// ── T8 — knowledge-body resolves to [data-knowledge-body] div, NOT <pre> ──

describe("KnowledgeDetail — T8 body is not a <pre>", () => {
	it("knowledge-body testId element is NOT a <pre> tag", () => {
		renderPage("k1");
		const body = screen.getByTestId("knowledge-body");
		expect(body.tagName).not.toBe("PRE");
	});

	it("knowledge-body testId element has [data-knowledge-body] attribute", () => {
		renderPage("k1");
		const body = screen.getByTestId("knowledge-body");
		expect(body).toHaveAttribute("data-knowledge-body");
	});

	it("knowledge-body element contains Block shells (article[data-ds-component=block])", () => {
		renderPage("k1");
		const body = screen.getByTestId("knowledge-body");
		// k1 has content — at least one Block shell should be present
		const blocks = body.querySelectorAll('[data-ds-component="block"]');
		expect(blocks.length).toBeGreaterThanOrEqual(1);
	});

	it("the body content text is still visible (k1 JWT content)", () => {
		renderPage("k1");
		// Content must still be rendered (just via Blocks now, not <pre>)
		expect(screen.getByText(/JWT-based authentication with refresh tokens/)).toBeInTheDocument();
	});

	// @lore nested-knowledge-items AC6: the Kind row assertion here is DELETED,
	// not adapted — `kind` is retired vocabulary and the row itself no longer
	// renders. "company" (layer) staying absent is now trivially true (there
	// is no Kind/layer row at all), so it is not worth a separate assertion.
});

// ── T9 — Edit mode uses BodyEditor (no split preview pane) ──
// @lore T2: The split textarea+preview pattern from L23 is replaced by a
// single BodyEditor component. The `knowledge-edit-preview` pane no longer
// exists in edit mode. Tests updated to reflect T2 behavior.

describe("KnowledgeDetail — T9 edit-mode uses BodyEditor (no split preview)", () => {
	it("edit-mode does NOT have a knowledge-edit-preview pane (split view removed in T2)", async () => {
		const user = userEvent.setup();
		renderPage("k1");
		await user.click(screen.getByRole("button", { name: /edit/i }));

		// The split-view preview pane is gone in T2 — BodyEditor replaced it
		expect(screen.queryByTestId("knowledge-edit-preview")).not.toBeInTheDocument();
	});

	it("edit-mode shows knowledge-edit-panel (BodyEditor container)", async () => {
		const user = userEvent.setup();
		renderPage("k1");
		await user.click(screen.getByRole("button", { name: /edit/i }));

		// BodyEditor is in an edit panel
		expect(screen.getByTestId("knowledge-edit-panel")).toBeInTheDocument();
	});

	it("read mode still shows KnowledgeBody (blocks, not <pre>)", async () => {
		renderPage("k1");

		// In read mode, knowledge-body is visible and has Block shells
		const body = screen.getByTestId("knowledge-body");
		expect(body.tagName).not.toBe("PRE");
		const blocks = body.querySelectorAll('[data-ds-component="block"]');
		expect(blocks.length).toBeGreaterThanOrEqual(1);
	});
});

// ── T10 — LEGACY_DETAILS and LEGACY_SOURCES constants are gone (R1-gated) ──
// @lore L23 T10: This test will initially fail because LEGACY_DETAILS/LEGACY_SOURCES
// exist. The T-GREEN-4 task decides whether to delete them entirely (safe) or keep
// just the data. The test is written as a structural assertion that the <pre>-rendering
// path inside findDetail no longer uses LEGACY_DETAILS as a *rendering* source.
// The data constants may survive if R1 forces a deferred deletion.

describe("KnowledgeDetail — T10 LEGACY_DETAILS rendering path removed", () => {
	it("k1 body renders as Block shells (not sourced from a hardcoded LEGACY_DETAILS string via <pre>)", () => {
		renderPage("k1");
		const body = screen.getByTestId("knowledge-body");
		// If the body is rendered via KnowledgeBody (not <pre>), Block shells must be present.
		const blocks = body.querySelectorAll('[data-ds-component="block"]');
		expect(blocks.length).toBeGreaterThanOrEqual(1);
		// No <pre> anywhere inside the body container
		expect(body.querySelectorAll("pre")).toHaveLength(0);
	});

	it("k2 body also renders as Block shells (another LEGACY item)", () => {
		renderPage("k2");
		const body = screen.getByTestId("knowledge-body");
		const blocks = body.querySelectorAll('[data-ds-component="block"]');
		expect(blocks.length).toBeGreaterThanOrEqual(1);
	});
});
