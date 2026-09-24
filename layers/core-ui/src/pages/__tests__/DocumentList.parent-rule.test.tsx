/**
 * DocumentList's parent-rule filter: a role-carrying binding (agent
 * identity, subscription prompt, skill, rule) is any row whose parent is set but
 * is not `document` — it is excluded from the browsable tree structurally,
 * not by a `role`/`slot` check (architecture.md §5.1's `inTree` shape).
 *
 * Reproduces the scenario architecture.md names: an agent identity
 * (`slot='agent_file'`, `parentKind='agent'`) and a subscription prompt
 * (`slot='prompt'`, `parentKind='subscription'`) must never render under "General".
 */
import type { DocumentRow } from "@hyperidle/domain-model";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentList } from "../../pages/DocumentList";

function makeDoc(overrides: Partial<DocumentRow> = {}): DocumentRow {
	return {
		id: "k1",
		title: "Untitled",
		body: "",
		format: "markdown",
		status: "active",
		slot: "ordinary",
		scopeKind: "factory",
		scopeId: null,
		parentKind: null,
		parentId: null,
		position: 0,
		version: 1,
		updatedBy: "u-founder",
		createdAt: "2026-01-01T10:00:00.000Z",
		updatedAt: "2026-01-01T10:00:00.000Z",
		readCount: 0,
		lastReadAt: null,
		sessionUseCount: 0,
		lastUsedAt: null,
		as: "document",
		...overrides,
	};
}

const mockUseDocuments = vi.fn();
vi.mock("../../hooks/useDocuments.js", () => ({
	useDocuments: (...args: unknown[]) => mockUseDocuments(...args),
}));

function renderDocumentList(): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={["/documents"]}>
			<Routes>
				<Route path="/documents" element={<DocumentList />} />
			</Routes>
		</MemoryRouter>,
	);
}

describe("DocumentList: the parent rule excludes role-carrying bindings", () => {
	beforeEach(() => {
		mockUseDocuments.mockReturnValue({
			documents: [
				makeDoc({
					id: "k-ordinary",
					title: "Auth Strategy Decision",
					body: "We decided to use JWT.",
				}),
				makeDoc({
					id: "ki_af_agent-1",
					title: "Agent One — identity",
					body: "I am Agent One.",
					scopeKind: "user",
					scopeId: "u-founder",
					slot: "agent_file",
					parentKind: "agent",
					parentId: "agent-1",
				}),
				makeDoc({
					id: "ki_rp_subscription-1",
					title: "Subscription One — prompt",
					body: "Do the thing.",
					slot: "prompt",
					parentKind: "subscription",
					parentId: "subscription-1",
				}),
			],
			status: "ready",
			error: null,
			retry: vi.fn(),
		});
	});

	it("shows an ordinary root item but never an agent identity or a subscription prompt", async () => {
		renderDocumentList();
		expect(await screen.findByText("Auth Strategy Decision")).toBeInTheDocument();
		expect(screen.queryByText("Agent One — identity")).not.toBeInTheDocument();
		expect(screen.queryByText("Subscription One — prompt")).not.toBeInTheDocument();
	});
});
