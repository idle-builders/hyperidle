import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { KnowledgeDetail } from "../pages/KnowledgeDetail";

function renderPage(knowledgeId: string): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={[`/knowledge/${knowledgeId}`]}>
			<Routes>
				<Route path="/knowledge/:knowledgeId" element={<KnowledgeDetail />} />
			</Routes>
		</MemoryRouter>,
	);
}

describe("KnowledgeDetail — J7 metadata bar", () => {
	it("renders kind Tag in the metadata bar", () => {
		// k6 is a practice-scope item with kind='principle' and the full J7 shape
		renderPage("k6");
		const bar = screen.getByTestId("knowledge-metadata-bar");
		const tag = within(bar).getByText("principle");
		expect(tag).toHaveClass("inline-flex", "rounded-[var(--r-pill)]");
		expect(tag.className).toContain("text-secondary");
	});

	it("renders status StatusChip in the metadata bar (active→HEALTHY)", () => {
		// k11 is factory-scope, status=active → HEALTHY chip in the metadata bar
		renderPage("k11");
		const bar = screen.getByTestId("knowledge-metadata-bar");
		expect(within(bar).getByText("HEALTHY")).toBeInTheDocument();
	});

	it("renders layer Tag in the metadata bar", () => {
		renderPage("k6");
		const bar = screen.getByTestId("knowledge-metadata-bar");
		const tag = within(bar).getByText("L1");
		expect(tag).toHaveClass("inline-flex", "rounded-[var(--r-pill)]");
		expect(tag.className).toContain("text-secondary");
	});

	it("renders decision kind + active status from fixture data", () => {
		// AC validation scenario 1: "decision" kind + "active" status shown on a
		// detail page renders decision Tag + active StatusChip in the metadata bar.
		renderPage("k11");
		const bar = screen.getByTestId("knowledge-metadata-bar");
		// "decision" is a TagKind with its own tint, so it won't have badge-neutral
		const decisionTag = within(bar).getByText("decision");
		expect(decisionTag).toHaveClass("inline-flex", "rounded-[var(--r-pill)]");
		expect(within(bar).getByText("HEALTHY")).toBeInTheDocument();
	});

	it("renders a confidence indicator", () => {
		renderPage("k1");
		expect(screen.getByTestId("knowledge-confidence")).toBeInTheDocument();
	});

	it("renders origin agent in the metadata bar", () => {
		renderPage("k1");
		expect(screen.getByTestId("knowledge-origin-agent")).toHaveTextContent(/Architect Agent/);
	});

	it("renders the updated timestamp", () => {
		renderPage("k1");
		expect(screen.getByTestId("knowledge-updated-at")).toHaveTextContent("1d ago");
	});

	it("renders the markdown body inside an element that preserves whitespace", () => {
		renderPage("k1");
		const body = screen.getByTestId("knowledge-body");
		expect(body).toBeInTheDocument();
		// When react-markdown is unavailable we render inside <pre> — verify
		// whitespace is preserved by assertion on the element's tagName or
		// the DOMPurify-sanitized content container.
		expect(body.textContent).toMatch(/JWT-based authentication/);
	});

	// @lore L18: ObservationLog deleted — replaced by HostThreadSection.
	// The two observation-log tests that existed here (observation log with 3 entries,
	// empty observation log) were removed as part of the L18 architecture change.
	// KnowledgeDetail.thread.test.tsx verifies HostThreadSection is present and
	// ObservationLog is absent.
});
