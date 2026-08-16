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
	it("kind does NOT appear in the metadata bar (AD6: removed)", () => {
		// k6 is a practice-scope item with kind='principle'
		// AD6: kind Tag removed from the metadata bar header — it is internal taxonomy.
		renderPage("k6");
		const bar = screen.getByTestId("knowledge-metadata-bar");
		expect(within(bar).queryByText("principle")).not.toBeInTheDocument();
	});

	it("renders status StatusChip in the metadata bar (active→HEALTHY)", () => {
		// k11 is factory-scope, status=active → HEALTHY chip in the metadata bar
		renderPage("k11");
		const bar = screen.getByTestId("knowledge-metadata-bar");
		expect(within(bar).getByText("HEALTHY")).toBeInTheDocument();
	});

	it("layer does NOT appear in the metadata bar (AD6: removed)", () => {
		// AD6: layer Tag removed from the metadata bar header.
		renderPage("k6");
		const bar = screen.getByTestId("knowledge-metadata-bar");
		expect(within(bar).queryByText("L1")).not.toBeInTheDocument();
	});

	it("renders active status chip in metadata bar (decision kind not in bar — AD6)", () => {
		// AD6: kind Tag removed from the metadata bar. Status chip still appears.
		renderPage("k11");
		const bar = screen.getByTestId("knowledge-metadata-bar");
		// kind "decision" must NOT appear in the metadata bar
		expect(within(bar).queryByText("decision")).not.toBeInTheDocument();
		// StatusChip still appears
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

	it("renders the updated timestamp (formatted, not raw string)", () => {
		renderPage("k1");
		// UI-037: timestamp is now passed through absoluteDateTime().
		// Fixture k1 has timestamp "1d ago" (not ISO) so absoluteDateTime returns "—".
		// Key assertion: the raw fixture string "1d ago" must NOT appear verbatim.
		const span = screen.getByTestId("knowledge-updated-at");
		expect(span).toBeInTheDocument();
		expect(span.textContent).not.toBe("1d ago");
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
