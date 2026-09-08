/**
 * KnowledgeDetail — the Move affordance. plan.md AC2: "a person can nest and
 * move knowledge items, and the tree keeps up." Mirrors
 * knowledge-scope-name.test.tsx's own mocking pattern for the overflow menu.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KnowledgeDetail } from "../pages/KnowledgeDetail.js";

vi.mock("../ds", async (importOriginal) => {
	const original = await importOriginal<typeof import("../ds")>();
	return {
		...original,
		BodyEditor: ({ initialContent }: { initialContent: string }) => (
			<div data-testid="mock-body-editor">{initialContent}</div>
		),
	};
});

vi.mock("../shell/HostThreadSection.js", () => ({
	HostThreadSection: () => <div data-testid="host-thread-section" />,
}));

vi.mock("../hooks/useHostThread.js", () => ({
	useHostThread: () => ({ data: null, isLoading: false, error: null }),
}));

vi.mock("../hooks/useAutoSave.js", () => ({
	useAutoSave: () => ({ status: "idle", save: vi.fn() }),
}));

vi.mock("../hooks/useCurrentUser.js", () => ({
	useCurrentUser: vi.fn(),
}));

vi.mock("../hooks/useKnowledgeItem.js", () => ({
	useKnowledgeItem: vi.fn(),
}));

vi.mock("../hooks/useTeams.js", () => ({
	useTeams: () => ({ data: { teams: [] }, isLoading: false, error: null }),
}));

vi.mock("../hooks/useFetch.js", () => ({
	useFetch: () => ({
		data: {
			items: [
				{
					id: "item-1",
					title: "Auth Policy",
					scopeKind: "team",
					parentId: "root-a",
					parentKind: "knowledge_item",
				},
				{ id: "root-a", title: "Root A", scopeKind: "factory", parentId: null, parentKind: null },
				{ id: "root-b", title: "Root B", scopeKind: "factory", parentId: null, parentKind: null },
			],
		},
		isLoading: false,
		error: null,
	}),
}));

function renderDetail(knowledgeId = "item-1"): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={[`/knowledge/${knowledgeId}`]}>
			<Routes>
				<Route path="/knowledge/:knowledgeId" element={<KnowledgeDetail />} />
			</Routes>
		</MemoryRouter>,
	);
}

function makeApiItem(overrides?: Record<string, unknown>) {
	return {
		id: "item-1",
		title: "Auth Policy",
		body: "Content.",
		format: "markdown",
		status: "active",
		version: 2,
		updatedBy: "user-42",
		scopeKind: "team",
		scopeId: "team-1",
		parentId: "root-a",
		parentKind: "knowledge_item",
		createdAt: "2024-01-01T00:00:00Z",
		updatedAt: "2024-01-01T00:00:00Z",
		...overrides,
	};
}

describe("editable knowledge item: Move affordance", () => {
	beforeEach(async () => {
		const { useCurrentUser } = await import("../hooks/useCurrentUser.js");
		vi.mocked(useCurrentUser).mockReturnValue({
			user: { id: "user-42", name: "Founder", email: "f@x.com", avatarUrl: null },
			status: "ready",
			error: null,
			retry: vi.fn(),
		});
		const { useKnowledgeItem } = await import("../hooks/useKnowledgeItem.js");
		vi.mocked(useKnowledgeItem).mockReturnValue({
			data: makeApiItem(),
			isLoading: false,
			error: null,
		});
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("overflow menu has a Move item for an editable item", async () => {
		const user = userEvent.setup();
		renderDetail();
		await user.click(screen.getByRole("button", { name: /more options/i }));
		expect(screen.getByTestId("knowledge-move")).toBeInTheDocument();
	});

	it("clicking Move opens MoveDialog preselected to the item's current parent", async () => {
		const user = userEvent.setup();
		renderDetail();
		await user.click(screen.getByRole("button", { name: /more options/i }));
		await user.click(screen.getByTestId("knowledge-move"));
		expect(screen.getByText("Move")).toBeInTheDocument();
		const select = screen.getByTestId("parent-picker") as HTMLSelectElement;
		expect(select.value).toBe("root-a");
	});
});

describe("factory read-only item: no Move affordance", () => {
	beforeEach(async () => {
		const { useCurrentUser } = await import("../hooks/useCurrentUser.js");
		vi.mocked(useCurrentUser).mockReturnValue({
			user: { id: "different-user", name: "Other", email: "o@x.com", avatarUrl: null },
			status: "ready",
			error: null,
			retry: vi.fn(),
		});
		const { useKnowledgeItem } = await import("../hooks/useKnowledgeItem.js");
		vi.mocked(useKnowledgeItem).mockReturnValue({
			data: makeApiItem({ scopeKind: "factory", scopeId: null, updatedBy: "agent-123" }),
			isLoading: false,
			error: null,
		});
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("overflow menu does NOT have a Move item for a read-only item", async () => {
		const user = userEvent.setup();
		renderDetail();
		await user.click(screen.getByRole("button", { name: /more options/i }));
		expect(screen.queryByTestId("knowledge-move")).not.toBeInTheDocument();
	});
});
