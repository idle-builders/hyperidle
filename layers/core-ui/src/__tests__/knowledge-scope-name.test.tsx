/**
 * AV3 — KnowledgeDetail component tests (red phase).
 *
 * AC-1: scope row + breadcrumb show resolved name for a team-scoped item.
 * AC-3: breadcrumb segment text == scopeName; legacy scope-only fixture emits NO scope segment.
 * AC-4: Change trigger present + dialog opens for editable item;
 *        factory item shows read-only marker, no Change trigger, no overflow change-scope.
 */

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KnowledgeDetail } from "../pages/KnowledgeDetail.js";

// ── Shared mocks ─────────────────────────────────────────────────────────────

vi.mock("@hyperidle/design-system", async (importOriginal) => {
	const original = await importOriginal<typeof import("@hyperidle/design-system")>();
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

// ── Helpers ──────────────────────────────────────────────────────────────────

function renderDetail(knowledgeId = "test-id"): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={[`/knowledge/${knowledgeId}`]}>
			<Routes>
				<Route path="/knowledge/:knowledgeId" element={<KnowledgeDetail />} />
			</Routes>
		</MemoryRouter>,
	);
}

/** Base knowledge item data with scopeName. */
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
		scopeName: "Team Nimmly",
		topic: "Security",
		createdAt: "2024-01-01T00:00:00Z",
		updatedAt: "2024-01-01T00:00:00Z",
		...overrides,
	};
}

// ── AC-1: scope row + breadcrumb show resolved name ──────────────────────────

describe("scope row + breadcrumb show resolved scope name, not bucket label", () => {
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

	it("scope row value text equals scopeName", () => {
		renderDetail();
		const scopeRow = screen.getByTestId("knowledge-scope-row");
		expect(within(scopeRow).getByText("Team Nimmly")).toBeInTheDocument();
	});

	it("scope row does NOT show bucket word alone", () => {
		renderDetail();
		const scopeRow = screen.getByTestId("knowledge-scope-row");
		// "Team" is the bucket word — but "Team Nimmly" is the resolved name.
		// The value span should contain "Team Nimmly", not just "Team" as standalone text.
		const valueSpan = within(scopeRow).queryByText("Team", { exact: true });
		// If there's text "Team" it should only be as part of "Team Nimmly"
		expect(within(scopeRow).getByText("Team Nimmly")).toBeInTheDocument();
		// The raw bucket label as its own text node should not appear separately
		if (valueSpan) {
			expect(valueSpan.textContent).toContain("Nimmly");
		}
	});

	it("breadcrumb segment text equals scopeName", () => {
		renderDetail();
		const breadcrumb = screen.getByRole("navigation", { name: /breadcrumb/i });
		expect(within(breadcrumb).getByText("Team Nimmly")).toBeInTheDocument();
	});

	it("breadcrumb does NOT show raw scopeId UUID", () => {
		renderDetail();
		const breadcrumb = screen.getByRole("navigation", { name: /breadcrumb/i });
		expect(within(breadcrumb).queryByText("team-1")).not.toBeInTheDocument();
	});
});

// ── AC-3: breadcrumb fed by scopeName, not deprecated scope ──────────────────

describe("breadcrumb scope segment driven by scopeName, not deprecated KnowledgeScope", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it("breadcrumb segment text == scopeName when scopeName is set", async () => {
		const { useCurrentUser } = await import("../hooks/useCurrentUser.js");
		vi.mocked(useCurrentUser).mockReturnValue({
			user: { id: "u1", name: "Alice", email: "a@x.com", avatarUrl: null },
			status: "ready",
			error: null,
			retry: vi.fn(),
		});
		const { useKnowledgeItem } = await import("../hooks/useKnowledgeItem.js");
		vi.mocked(useKnowledgeItem).mockReturnValue({
			data: makeApiItem({ scopeName: "Team Nimmly" }),
			isLoading: false,
			error: null,
		});
		renderDetail();
		const breadcrumb = screen.getByRole("navigation", { name: /breadcrumb/i });
		expect(within(breadcrumb).getByText("Team Nimmly")).toBeInTheDocument();
	});

	it("breadcrumb emits NO scope segment when scopeName absent (legacy fixture path)", async () => {
		const { useCurrentUser } = await import("../hooks/useCurrentUser.js");
		vi.mocked(useCurrentUser).mockReturnValue({
			user: null,
			status: "loading",
			error: null,
			retry: vi.fn(),
		});
		// No API item — falls back to fixture (k1 has scope="practice", no scopeName)
		const { useKnowledgeItem } = await import("../hooks/useKnowledgeItem.js");
		vi.mocked(useKnowledgeItem).mockReturnValue({
			data: null,
			isLoading: false,
			error: null,
		});
		renderDetail("k1"); // k1 has scope="practice" in fixture, no scopeName
		const breadcrumb = screen.getByRole("navigation", { name: /breadcrumb/i });
		// "practice" must NOT appear — deprecated scope is not shown in breadcrumb
		expect(within(breadcrumb).queryByText("practice")).not.toBeInTheDocument();
		// breadcrumb still shows Knowledge root and topic
		expect(within(breadcrumb).getByText("Knowledge")).toBeInTheDocument();
	});
});

// ── AC-4: Change trigger / read-only marker ───────────────────────────────────

describe("editable knowledge item: scope Change trigger visible and opens dialog", () => {
	beforeEach(async () => {
		const { useCurrentUser } = await import("../hooks/useCurrentUser.js");
		vi.mocked(useCurrentUser).mockReturnValue({
			user: { id: "user-42", name: "Founder", email: "f@x.com", avatarUrl: null },
			status: "ready",
			error: null,
			retry: vi.fn(),
		});
		const { useKnowledgeItem } = await import("../hooks/useKnowledgeItem.js");
		// Non-factory editable item
		vi.mocked(useKnowledgeItem).mockReturnValue({
			data: makeApiItem({ scopeKind: "team", scopeName: "Team Nimmly", updatedBy: "user-42" }),
			isLoading: false,
			error: null,
		});
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("shows knowledge-scope-change-trigger for editable (non-factory) item", () => {
		renderDetail();
		expect(screen.getByTestId("knowledge-scope-change-trigger")).toBeInTheDocument();
	});

	it("clicking Change trigger opens ScopeChangeDialog", async () => {
		const user = userEvent.setup();
		renderDetail();
		const trigger = screen.getByTestId("knowledge-scope-change-trigger");
		await user.click(trigger);
		// Dialog title appears
		expect(screen.getByText("Change scope")).toBeInTheDocument();
	});

	it("overflow menu has change-scope item for editable item", async () => {
		const user = userEvent.setup();
		renderDetail();
		// Open overflow menu
		const moreBtn = screen.getByRole("button", { name: /more options/i });
		await user.click(moreBtn);
		expect(screen.getByTestId("knowledge-change-scope")).toBeInTheDocument();
	});

	it("does NOT show knowledge-scope-readonly for editable item", () => {
		renderDetail();
		expect(screen.queryByTestId("knowledge-scope-readonly")).not.toBeInTheDocument();
	});
});

describe("factory read-only item: read-only marker visible, no Change trigger, no overflow change-scope", () => {
	beforeEach(async () => {
		const { useCurrentUser } = await import("../hooks/useCurrentUser.js");
		// Different user — so updatedBy !== user.id → isReadOnly = true
		vi.mocked(useCurrentUser).mockReturnValue({
			user: { id: "different-user", name: "Other", email: "o@x.com", avatarUrl: null },
			status: "ready",
			error: null,
			retry: vi.fn(),
		});
		const { useKnowledgeItem } = await import("../hooks/useKnowledgeItem.js");
		// Factory item authored by a different user → agent-authored → read-only
		vi.mocked(useKnowledgeItem).mockReturnValue({
			data: makeApiItem({
				scopeKind: "factory",
				scopeId: null,
				scopeName: "Factory",
				updatedBy: "agent-123",
			}),
			isLoading: false,
			error: null,
		});
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("shows knowledge-scope-readonly marker for factory/read-only item", () => {
		renderDetail();
		expect(screen.getByTestId("knowledge-scope-readonly")).toBeInTheDocument();
	});

	it("does NOT show Change trigger for read-only item", () => {
		renderDetail();
		expect(screen.queryByTestId("knowledge-scope-change-trigger")).not.toBeInTheDocument();
	});

	it("overflow menu does NOT have change-scope item for read-only item", async () => {
		const user = userEvent.setup();
		renderDetail();
		const moreBtn = screen.getByRole("button", { name: /more options/i });
		await user.click(moreBtn);
		expect(screen.queryByTestId("knowledge-change-scope")).not.toBeInTheDocument();
	});

	it("scope row still shows resolved scopeName for factory item", () => {
		renderDetail();
		const scopeRow = screen.getByTestId("knowledge-scope-row");
		expect(within(scopeRow).getByText("Factory")).toBeInTheDocument();
	});
});
