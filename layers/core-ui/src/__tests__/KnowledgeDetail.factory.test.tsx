import { render, screen } from "@testing-library/react";
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

// @lore nested-knowledge-items: the "Amendable under review" banner keyed off
// `status === "needs_human"` is removed along with that status value — the
// 4-value status ladder (proposed | active | stale | archived) has no
// equivalent, and the migration folds needs_human into archived (the
// escalation signal now lives on `knowledge_conflicts`, not the coarse
// status column). The banner feature and its tests go with it; the
// remaining factory-treatment assertion (no Edit button) survives.
describe("KnowledgeDetail — J7 factory scope treatment", () => {
	it("does NOT render an Edit button for a factory-scope item", () => {
		// k11 is a factory-scope item (Agent Autonomy Policy)
		renderPage("k11");
		expect(screen.queryByRole("button", { name: /edit/i })).not.toBeInTheDocument();
	});

	it("does NOT render the amendable banner for an active factory item", () => {
		renderPage("k11");
		expect(screen.queryByTestId("factory-amendable-banner")).not.toBeInTheDocument();
	});
});
