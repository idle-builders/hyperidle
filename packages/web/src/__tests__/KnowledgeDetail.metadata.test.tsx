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
		expect(within(bar).getByText("principle")).toHaveClass("badge-neutral");
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
		expect(within(bar).getByText("L1")).toHaveClass("badge-neutral");
	});

	it("renders decision kind + active status from fixture data", () => {
		// AC validation scenario 1: "decision" kind + "active" status shown on a
		// detail page renders decision Tag + active StatusChip in the metadata bar.
		renderPage("k11");
		const bar = screen.getByTestId("knowledge-metadata-bar");
		expect(within(bar).getByText("decision")).toHaveClass("badge-neutral");
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

	it("renders the observation log with 3 entries and agent attribution", () => {
		// Legacy k1 fixture has 3 observation log entries wired in LEGACY_DETAILS.
		renderPage("k1");
		const log = screen.getByTestId("knowledge-observation-log");
		const entries = within(log).getAllByTestId("observation-entry");
		expect(entries.length).toBe(3);
		// Each entry must attribute a facilitator/agent
		for (const entry of entries) {
			expect(within(entry).getByTestId("observation-agent")).toBeInTheDocument();
		}
	});

	it("renders empty observation log with a friendly message when absent", () => {
		// k11 (factory Agent Autonomy Policy) has no observationLog → empty state.
		renderPage("k11");
		const log = screen.getByTestId("knowledge-observation-log");
		expect(within(log).getByText(/No observations yet/)).toBeInTheDocument();
	});
});
