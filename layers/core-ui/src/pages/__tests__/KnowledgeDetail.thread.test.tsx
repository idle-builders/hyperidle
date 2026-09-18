/**
 * L18 — KnowledgeDetail thread tests.
 *
 * AC coverage:
 *  - renders HostThreadSection where ObservationLog used to render
 *  - ObservationLog is absent from the DOM
 */

import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KnowledgeDetail } from "../../pages/KnowledgeDetail";

// @lore BC3: HostThreadSection takes `host: {kind, id}`, not `hostKind`/`hostId` —
// the mock's prop shape follows the real component's props.
vi.mock("../../shell/HostThreadSection", () => ({
	HostThreadSection: ({ host }: { host: { kind: string; id: string } }) => (
		<div data-testid="host-thread-section" data-host-kind={host.kind} data-host-id={host.id}>
			Thread Section
		</div>
	),
}));

function renderKnowledge(id: string): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={[`/knowledge/${id}`]}>
			<Routes>
				<Route path="/knowledge/:knowledgeId" element={<KnowledgeDetail />} />
			</Routes>
		</MemoryRouter>,
	);
}

describe("KnowledgeDetail thread (L18)", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("renders HostThreadSection where ObservationLog used to render", () => {
		renderKnowledge("k1");

		const threadSection = screen.getByTestId("host-thread-section");
		expect(threadSection).toBeInTheDocument();
		expect(threadSection).toHaveAttribute("data-host-kind", "knowledge_item");
		expect(threadSection).toHaveAttribute("data-host-id", "k1");
	});

	it("ObservationLog is absent from the DOM", () => {
		renderKnowledge("k1");

		// The old ObservationLog had testid "knowledge-observation-log"
		expect(screen.queryByTestId("knowledge-observation-log")).not.toBeInTheDocument();
	});
});
