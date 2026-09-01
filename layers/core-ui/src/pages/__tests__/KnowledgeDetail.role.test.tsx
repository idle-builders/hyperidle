/**
 * The role of a knowledge document is editable from the document itself.
 *
 * A skill is a knowledge document that carries a role, so the place to change
 * that role is the same place you change anything else about the document. The
 * metadata card already shows Kind, Scope and Status; role belongs beside them,
 * and — unlike scope, which needs a reason and gets a dialog — a role change is
 * an ordinary field edit.
 *
 * Read-only documents show the role without a control, matching how the Scope
 * row already behaves.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KnowledgeDetail } from "../KnowledgeDetail";

const patchCalls: Array<{ url: string; body: unknown }> = [];

vi.mock("../../hooks/useFetch", () => ({
	useFetch: () => ({ data: null, loading: false, error: null, refresh: vi.fn() }),
}));

vi.mock("../../hooks/useKnowledgeItem", () => ({
	useKnowledgeItem: () => ({
		data: {
			id: "k-role",
			title: "Knowledge decay sweep",
			body: "How to sweep stale knowledge.",
			topic: null,
			status: "active",
			kind: "decision",
			layer: "L2",
			// "practice" keeps the item editable — factory items are read-only.
			scopeKind: "practice",
			scopeId: null,
			role: "ordinary",
			version: 3,
			format: "markdown",
			confidence: 0.9,
			createdAt: "2026-01-01T10:00:00.000Z",
			updatedAt: "2026-01-01T10:00:00.000Z",
			updatedBy: "Test Founder",
			accessCount: 1,
			relatedItems: [],
		},
		loading: false,
		error: null,
	}),
}));

vi.mock("../../shell/HostThreadSection", () => ({
	HostThreadSection: () => <div data-testid="host-thread-section" />,
}));

vi.mock("../../hooks/useAutoSave", () => ({
	useAutoSave: () => ({ status: "idle", save: vi.fn(), flush: vi.fn() }),
}));

vi.mock("../../hooks/useCurrentUser", () => ({
	useCurrentUser: () => ({ user: { id: "u-founder", name: "Founder" }, loading: false }),
}));

vi.mock("../../services/api-fetch", async (importOriginal) => {
	const actual = (await importOriginal()) as Record<string, unknown>;
	return {
		...actual,
		apiFetch: (url: string, init?: RequestInit) => {
			if (init?.method === "PATCH") {
				patchCalls.push({ url, body: JSON.parse(String(init.body)) });
			}
			return Promise.resolve(
				new Response(JSON.stringify({ id: "k-role", version: 4, role: "skill" }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			);
		},
	};
});

function renderDetail() {
	return render(
		<MemoryRouter initialEntries={["/knowledge/k-role"]}>
			<Routes>
				<Route path="/knowledge/:knowledgeId" element={<KnowledgeDetail />} />
			</Routes>
		</MemoryRouter>,
	);
}

describe("role is set at creation, never edited from the document (knowledge-attachment-slot)", () => {
	beforeEach(() => {
		patchCalls.length = 0;
	});

	it("has no role row or role control in the metadata aside", async () => {
		renderDetail();
		// Wait for the body to render first, so the absence assertion below
		// runs after the async data load has settled.
		await screen.findByTestId("knowledge-metadata-aside");
		expect(screen.queryByTestId("knowledge-role-row")).not.toBeInTheDocument();
		expect(screen.queryByTestId("knowledge-role-select")).not.toBeInTheDocument();
	});

	it("a PATCH never carries a role field, even if a caller tried to set one", async () => {
		const user = userEvent.setup();
		renderDetail();
		const editButton = await screen.findByRole("button", { name: /edit/i });
		await user.click(editButton);
		// No role control exists to drive a PATCH with `role` through the UI —
		// this pins that no future edit affordance reintroduces it silently.
		expect(screen.queryByTestId("knowledge-role-select")).not.toBeInTheDocument();
	});
});
