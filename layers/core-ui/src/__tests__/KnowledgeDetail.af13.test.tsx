/**
 * AF13 — KnowledgeDetail component tests (red phase).
 *
 * Covers:
 * - AC §2: editability predicate — self-authored factory item → Edit visible
 *          agent-authored factory item → Edit absent (protected test stays green)
 * - §4A: ScopeChangeDialog select renders 3 labeled options (Shared/Team/Private),
 *         no raw enum values
 * - §4A SUGGESTION: default-option maps factory AND practice → "Shared" (no phantom)
 *
 * @lore nested-knowledge-items: §5 ("kind aside renders '—' for null/undefined
 * kind") is DELETED, not adapted — `kind` is retired vocabulary (AC6) and the
 * Kind row itself is gone from KnowledgeDetail.tsx, not just its fallback text.
 */

import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KnowledgeDetail } from "../pages/KnowledgeDetail.js";
import { ScopeChangeDialog } from "../pages/knowledge/ScopeChangeDialog.js";

// Mock heavy dependencies at module level
vi.mock("../ds", async (importOriginal) => {
	const original = await importOriginal<typeof import("../ds")>();
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

// @lore AF13: vi.mock() calls are hoisted to top regardless of scope (describe/it/beforeEach).
// Multiple vi.mock() calls for the same module path in one file → LAST factory wins for ALL tests.
// Fix: single file-level vi.mock with vi.fn() stubs; configure per-describe via mockReturnValue.
vi.mock("../hooks/useCurrentUser.js", () => ({
	useCurrentUser: vi.fn(),
}));

vi.mock("../hooks/useKnowledgeItem.js", () => ({
	useKnowledgeItem: vi.fn(),
}));

// ---------------------------------------------------------------------------
// §2 — Editability predicate
// ---------------------------------------------------------------------------

describe("AF13 §2 — Editability: self-authored factory item shows Edit button", () => {
	beforeEach(async () => {
		const { useCurrentUser } = await import("../hooks/useCurrentUser.js");
		vi.mocked(useCurrentUser).mockReturnValue({
			user: { id: "u1", name: "Founder", email: "f@example.com", avatarUrl: null },
			status: "ready",
			error: null,
			retry: vi.fn(),
		});

		// Factory item authored by "u1" (same as current user)
		const { useKnowledgeItem } = await import("../hooks/useKnowledgeItem.js");
		vi.mocked(useKnowledgeItem).mockReturnValue({
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
				createdAt: "2024-01-01T00:00:00Z",
				updatedAt: "2024-01-01T00:00:00Z",
			},
			isLoading: false,
			error: null,
		});
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
	beforeEach(async () => {
		const { useCurrentUser } = await import("../hooks/useCurrentUser.js");
		vi.mocked(useCurrentUser).mockReturnValue({
			user: { id: "u1", name: "Founder", email: "f@example.com", avatarUrl: null },
			status: "ready",
			error: null,
			retry: vi.fn(),
		});

		// Factory item authored by a different agent
		const { useKnowledgeItem } = await import("../hooks/useKnowledgeItem.js");
		vi.mocked(useKnowledgeItem).mockReturnValue({
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
				createdAt: "2024-01-01T00:00:00Z",
				updatedAt: "2024-01-01T00:00:00Z",
			},
			isLoading: false,
			error: null,
		});
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
// §4A — ScopeChangeDialog vocabulary: labeled options, no raw enums
// ---------------------------------------------------------------------------

describe("AF13 §4A — ScopeChangeDialog renders labeled options (not raw enums)", () => {
	beforeEach(async () => {
		const { useCurrentUser } = await import("../hooks/useCurrentUser.js");
		vi.mocked(useCurrentUser).mockReturnValue({
			user: { id: "u1", name: "Founder", email: "f@example.com", avatarUrl: null },
			status: "ready",
			error: null,
			retry: vi.fn(),
		});
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("renders labeled scope pills — not raw enums", () => {
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

		// AI5: the Select was replaced by the canonical ScopePicker pill group.
		// Behaviour preserved: 3 labeled options, no raw enum vocabulary.
		const group = screen.getByRole("radiogroup", { name: "Scope kind" });
		const optionTexts = Array.from(group.querySelectorAll('[role="radio"]')).map(
			(o) => o.textContent ?? "",
		);

		expect(optionTexts).toContain("Shared");
		expect(optionTexts).toContain("Team");
		expect(optionTexts).toContain("Private");
		// AU26 F2 (founder ruling): the Filesystem scope is gone.
		expect(optionTexts).not.toContain("Filesystem");
		// @lore nested-knowledge-items: the Role option (scopeKind: "practice")
		// is gone with the practice scope value — role-scoped patterns are now
		// tree children under the Practices root, not a scope pick.
		expect(optionTexts).not.toContain("Role");

		expect(optionTexts).not.toContain("factory");
		expect(optionTexts).not.toContain("practice");
		expect(optionTexts).not.toContain("bet");
		expect(optionTexts).not.toContain("task");
		expect(optionTexts).not.toContain("product");

		expect(optionTexts.filter((t) => t.length > 0)).toHaveLength(3);
	});
});

// ---------------------------------------------------------------------------
// §4A SUGGESTION: default-option preserves exact first-class scopes
// ---------------------------------------------------------------------------

describe("AF13 §4A SUGGESTION — default-option resolution", () => {
	beforeEach(async () => {
		const { useCurrentUser } = await import("../hooks/useCurrentUser.js");
		vi.mocked(useCurrentUser).mockReturnValue({
			user: { id: "u1", name: "Founder", email: "f@example.com", avatarUrl: null },
			status: "ready",
			error: null,
			retry: vi.fn(),
		});
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

		// AI5: factory → "Shared" pill active (data-active="true").
		expect(screen.getByTestId("scope-pill-change-shared")).toHaveAttribute("data-active", "true");
	});

	// @lore nested-knowledge-items: "practice" is no longer a valid ScopeKind
	// (retired with the Role option) — this test now exercises "team", the
	// direct 1:1 exact-match case resolveDefaultOption always takes today.
	it("when currentScopeKind is team, the Team option is selected", () => {
		render(
			<MemoryRouter>
				<ScopeChangeDialog
					open={true}
					onClose={() => {}}
					onSaved={() => {}}
					knowledgeId="k1"
					currentVersion={1}
					currentScopeKind="team"
				/>
			</MemoryRouter>,
		);

		expect(screen.getByTestId("scope-pill-change-team")).toHaveAttribute("data-active", "true");

		const group = screen.getByRole("radiogroup", { name: "Scope kind" });
		const optionTexts = Array.from(group.querySelectorAll('[role="radio"]')).map(
			(o) => o.textContent ?? "",
		);
		expect(optionTexts).not.toContain("practice");
	});
});

// ---------------------------------------------------------------------------
// AF13 plan §6 — ScopeChangeDialog Team option gated by hasTeam
// ---------------------------------------------------------------------------

describe("AF13 §6 — ScopeChangeDialog Team option gated by hasTeam (parity with KnowledgeCreate)", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it("Team option is disabled when user has no teamId", async () => {
		const { useCurrentUser } = await import("../hooks/useCurrentUser.js");
		vi.mocked(useCurrentUser).mockReturnValue({
			user: { id: "u1", name: "Founder", email: "f@example.com", avatarUrl: null },
			status: "ready",
			error: null,
			retry: vi.fn(),
		});

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

		// AI5: Team pill disabled when the user has no teamId.
		expect(screen.getByTestId("scope-pill-change-team")).toBeDisabled();
	});

	it("Team option is enabled when user has a teamId", async () => {
		const { useCurrentUser } = await import("../hooks/useCurrentUser.js");
		vi.mocked(useCurrentUser).mockReturnValue({
			user: { id: "u1", name: "Founder", email: "f@example.com", avatarUrl: null, teamId: "t1" },
			status: "ready",
			error: null,
			retry: vi.fn(),
		});

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

		// AI5: Team pill enabled when the user has a teamId.
		expect(screen.getByTestId("scope-pill-change-team")).not.toBeDisabled();
	});
});
