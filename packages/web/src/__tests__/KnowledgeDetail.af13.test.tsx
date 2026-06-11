/**
 * AF13 — KnowledgeDetail component tests (red phase).
 *
 * Covers:
 * - AC §2: editability predicate — self-authored factory item → Edit visible
 *          agent-authored factory item → Edit absent (protected test stays green)
 * - §5: kind aside renders "—" for null/undefined kind
 * - §4A: ScopeChangeDialog select renders 3 labeled options (Shared/Team/Private),
 *         no raw enum values
 * - §4A SUGGESTION: default-option maps factory AND practice → "Shared" (no phantom)
 */

import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KnowledgeDetail } from "../pages/KnowledgeDetail.js";
import { ScopeChangeDialog } from "../pages/knowledge/ScopeChangeDialog.js";

// Mock heavy dependencies at module level
vi.mock("@hyperidle/design-system", async (importOriginal) => {
	const original = await importOriginal<typeof import("@hyperidle/design-system")>();
	return {
		...original,
		BodyEditor: ({
			initialContent,
			onChange,
		}: {
			initialContent: string;
			onChange: (md: string) => void;
		}) => (
			<div data-testid="mock-body-editor">
				<textarea
					data-testid="body-editor-textarea"
					defaultValue={initialContent}
					onChange={(e) => onChange(e.target.value)}
					aria-label="Body editor"
				/>
			</div>
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

// ---------------------------------------------------------------------------
// §2 — Editability predicate
// ---------------------------------------------------------------------------

describe("AF13 §2 — Editability: self-authored factory item shows Edit button", () => {
	beforeEach(() => {
		vi.mock("../hooks/useCurrentUser.js", () => ({
			useCurrentUser: () => ({
				user: { id: "u1", name: "Founder", email: "f@example.com", avatarUrl: null },
				status: "ready",
				error: null,
			}),
		}));

		// Factory item authored by "u1" (same as current user)
		vi.mock("../hooks/useKnowledgeItem.js", () => ({
			useKnowledgeItem: () => ({
				data: {
					id: "self-factory",
					title: "My Factory Item",
					body: "content",
					format: "markdown",
					status: "active",
					version: 1,
					updatedBy: "u1",
					scopeKind: "factory",
					scopeId: null,
					topic: null,
					createdAt: "2024-01-01T00:00:00Z",
					updatedAt: "2024-01-01T00:00:00Z",
				},
				isLoading: false,
				error: null,
			}),
		}));
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("renders Edit button for factory item authored by the current user", () => {
		render(
			<MemoryRouter initialEntries={["/knowledge/self-factory"]}>
				<Routes>
					<Route
						path="/knowledge/:knowledgeId"
						element={<KnowledgeDetail overrideKnowledgeId="self-factory" />}
					/>
				</Routes>
			</MemoryRouter>,
		);
		// After §2 fix: self-authored factory items are editable
		// Currently fails because isFactory gates Edit unconditionally (no author check).
		expect(screen.getByRole("button", { name: /edit/i })).toBeInTheDocument();
	});
});

describe("AF13 §2 — Editability: agent-authored factory item stays read-only", () => {
	beforeEach(() => {
		vi.mock("../hooks/useCurrentUser.js", () => ({
			useCurrentUser: () => ({
				user: { id: "u1", name: "Founder", email: "f@example.com", avatarUrl: null },
				status: "ready",
				error: null,
			}),
		}));

		// Factory item authored by a different agent
		vi.mock("../hooks/useKnowledgeItem.js", () => ({
			useKnowledgeItem: () => ({
				data: {
					id: "agent-factory",
					title: "Agent-curated Item",
					body: "content",
					format: "markdown",
					status: "active",
					version: 1,
					updatedBy: "agent-x",
					scopeKind: "factory",
					scopeId: null,
					topic: null,
					createdAt: "2024-01-01T00:00:00Z",
					updatedAt: "2024-01-01T00:00:00Z",
				},
				isLoading: false,
				error: null,
			}),
		}));
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("does NOT render Edit button for factory item authored by a different user/agent", () => {
		render(
			<MemoryRouter initialEntries={["/knowledge/agent-factory"]}>
				<Routes>
					<Route
						path="/knowledge/:knowledgeId"
						element={<KnowledgeDetail overrideKnowledgeId="agent-factory" />}
					/>
				</Routes>
			</MemoryRouter>,
		);
		// Must remain read-only — preserves "agent-curated org knowledge is read-only" invariant
		expect(screen.queryByRole("button", { name: /edit/i })).not.toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// §5 — kind renders "—" for null/undefined kind in the metadata aside
// ---------------------------------------------------------------------------

describe("AF13 §5 — Kind aside renders '—' for unknown/null kind", () => {
	beforeEach(() => {
		vi.mock("../hooks/useCurrentUser.js", () => ({
			useCurrentUser: () => ({
				user: { id: "u1", name: "Founder", email: "f@example.com", avatarUrl: null },
				status: "ready",
				error: null,
			}),
		}));

		// API item with no kind
		vi.mock("../hooks/useKnowledgeItem.js", () => ({
			useKnowledgeItem: () => ({
				data: {
					id: "item-no-kind",
					title: "Unclassified Item",
					body: "content",
					format: "markdown",
					status: "active",
					version: 1,
					updatedBy: "u1",
					scopeKind: "factory",
					scopeId: null,
					topic: null,
					createdAt: "2024-01-01T00:00:00Z",
					updatedAt: "2024-01-01T00:00:00Z",
					kind: undefined, // no kind from API
				},
				isLoading: false,
				error: null,
			}),
		}));
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("renders '—' in the Kind metadata row when kind is undefined", () => {
		render(
			<MemoryRouter initialEntries={["/knowledge/item-no-kind"]}>
				<Routes>
					<Route
						path="/knowledge/:knowledgeId"
						element={<KnowledgeDetail overrideKnowledgeId="item-no-kind" />}
					/>
				</Routes>
			</MemoryRouter>,
		);
		// The Kind row in the metadata aside must show "—" not raw "undefined" or be blank
		// This test fails until `{item.kind}` is changed to `{item.kind ?? "—"}`
		const aside = screen.getByTestId("knowledge-metadata-aside");

		// The aside must contain "—" somewhere (for the Kind row)
		expect(aside).toHaveTextContent("—");
	});
});

// ---------------------------------------------------------------------------
// §4A — ScopeChangeDialog vocabulary: 3 labeled options, no raw enums
// ---------------------------------------------------------------------------

describe("AF13 §4A — ScopeChangeDialog renders 3 labeled options (not raw enums)", () => {
	beforeEach(() => {
		vi.mock("../hooks/useCurrentUser.js", () => ({
			useCurrentUser: () => ({
				user: { id: "u1", name: "Founder", email: "f@example.com", avatarUrl: null },
			}),
		}));
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("select contains Shared, Team, Private — not factory/practice/bet/task", () => {
		render(
			<MemoryRouter>
				<ScopeChangeDialog
					open={true}
					onClose={() => {}}
					onSaved={() => {}}
					knowledgeId="k1"
					currentVersion={1}
					currentScopeKind="factory"
				/>
			</MemoryRouter>,
		);

		// After §4A fix: select replaced with 3 labeled SCOPE_CREATE_OPTIONS
		// Currently fails because SCOPE_KINDS.map renders 7 raw enum option values
		const selectEl = screen.getByLabelText("Scope kind");
		const optionTexts = Array.from(selectEl.querySelectorAll("option")).map(
			(o) => o.textContent ?? "",
		);

		expect(optionTexts).toContain("Shared");
		expect(optionTexts).toContain("Team");
		expect(optionTexts).toContain("Private");

		expect(optionTexts).not.toContain("factory");
		expect(optionTexts).not.toContain("practice");
		expect(optionTexts).not.toContain("bet");
		expect(optionTexts).not.toContain("task");
		expect(optionTexts).not.toContain("product");

		// Exactly 3 options (no phantom extras)
		expect(optionTexts.filter((t) => t.length > 0)).toHaveLength(3);
	});
});

// ---------------------------------------------------------------------------
// §4A SUGGESTION: default-option maps BOTH factory AND practice → "Shared"
// ---------------------------------------------------------------------------

describe("AF13 §4A SUGGESTION — default-option resolution: factory and practice both map to Shared", () => {
	beforeEach(() => {
		vi.mock("../hooks/useCurrentUser.js", () => ({
			useCurrentUser: () => ({
				user: { id: "u1", name: "Founder", email: "f@example.com", avatarUrl: null },
			}),
		}));
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("when currentScopeKind is factory, the Shared option is selected by default", () => {
		render(
			<MemoryRouter>
				<ScopeChangeDialog
					open={true}
					onClose={() => {}}
					onSaved={() => {}}
					knowledgeId="k1"
					currentVersion={1}
					currentScopeKind="factory"
				/>
			</MemoryRouter>,
		);

		const selectEl = screen.getByLabelText("Scope kind") as HTMLSelectElement;
		// After fix: "Shared" selected when currentScopeKind is "factory"
		// Currently fails: value is "factory" (raw enum, select not yet replaced)
		expect(selectEl.value).toBe("Shared");
	});

	it("when currentScopeKind is practice, the Shared option is selected (no phantom practice)", () => {
		render(
			<MemoryRouter>
				<ScopeChangeDialog
					open={true}
					onClose={() => {}}
					onSaved={() => {}}
					knowledgeId="k1"
					currentVersion={1}
					currentScopeKind="practice"
				/>
			</MemoryRouter>,
		);

		const selectEl = screen.getByLabelText("Scope kind") as HTMLSelectElement;
		// After fix: "Shared" selected (practice maps to Shared via scopeKindToLabel)
		// Currently fails: value is "practice"
		expect(selectEl.value).toBe("Shared");

		// No phantom "practice" option in the select
		const optionTexts = Array.from(selectEl.querySelectorAll("option")).map(
			(o) => o.textContent ?? "",
		);
		expect(optionTexts).not.toContain("practice");
	});
});
