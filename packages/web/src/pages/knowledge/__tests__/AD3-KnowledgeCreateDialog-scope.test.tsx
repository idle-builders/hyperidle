/**
 * AD3 — AC-3: KnowledgeCreateDialog simplified scope picker.
 *
 * When there is exactly 1 team (isSingleTeam):
 *   - Scope select shows exactly 2 options: "Shared" (factory) and "Personal" (user)
 *   - Other scope options (product, practice, team, bet, task) are NOT shown
 *
 * When there are 2+ teams:
 *   - All 7 SCOPE_KINDS options are shown
 *
 * When scope is locked:
 *   - Scope select is not shown (existing behavior, unchanged)
 */

import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock BodyEditor (TipTap requires DOM APIs unavailable in JSDOM)
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
			<textarea
				data-testid="body-editor-textarea"
				defaultValue={initialContent}
				onChange={(e) => onChange(e.target.value)}
				aria-label="Body editor"
			/>
		),
	};
});

// Mock apiFetch
vi.mock("../../../services/api-fetch.js", () => ({
	apiFetch: vi.fn(),
}));

// Mock useCurrentUser
vi.mock("../../../hooks/useCurrentUser.js", () => ({
	useCurrentUser: () => ({ user: { id: "user-1" } }),
}));

// Mock useTeams — controlled by each test
vi.mock("../../../hooks/useTeams.js", () => ({
	useTeams: vi.fn(),
}));

import { KnowledgeCreateDialog } from "../KnowledgeCreateDialog";

const BASE_PROPS = {
	open: true,
	onClose: vi.fn(),
	onCreated: vi.fn(),
};

describe("AD3 AC-3: KnowledgeCreateDialog — single-team scope picker", () => {
	beforeEach(async () => {
		const { useTeams } = await import("../../../hooks/useTeams.js");
		vi.mocked(useTeams).mockReset();
	});

	it("shows exactly 2 scope options (Shared, Personal) when there is 1 team", async () => {
		const { useTeams } = await import("../../../hooks/useTeams.js");
		vi.mocked(useTeams).mockReturnValue({
			data: {
				teams: [{ id: "t1", name: "Alpha Team", phase: "build", status: "healthy", leadAgentId: null, activeBets: 0, shipped: 0, shipRate: "0%", progress: { done: 0, total: 0 } }],
			},
			loading: false,
			error: null,
		});

		render(<KnowledgeCreateDialog {...BASE_PROPS} />);

		await waitFor(() => {
			const select = screen.getByRole("combobox", { name: /scope kind/i });
			expect(select).toBeInTheDocument();
		});

		const select = screen.getByRole("combobox", { name: /scope kind/i });
		const options = Array.from(select.querySelectorAll("option"));
		expect(options).toHaveLength(2);

		const optionValues = options.map((o) => o.getAttribute("value"));
		expect(optionValues).toContain("factory");
		expect(optionValues).toContain("user");
	});

	it("option labels are 'Shared' (factory) and 'Personal' (user) for solo", async () => {
		const { useTeams } = await import("../../../hooks/useTeams.js");
		vi.mocked(useTeams).mockReturnValue({
			data: {
				teams: [{ id: "t1", name: "Alpha Team", phase: "build", status: "healthy", leadAgentId: null, activeBets: 0, shipped: 0, shipRate: "0%", progress: { done: 0, total: 0 } }],
			},
			loading: false,
			error: null,
		});

		render(<KnowledgeCreateDialog {...BASE_PROPS} />);

		await waitFor(() => {
			expect(screen.getByRole("combobox", { name: /scope kind/i })).toBeInTheDocument();
		});

		const select = screen.getByRole("combobox", { name: /scope kind/i });
		const options = Array.from(select.querySelectorAll("option")).map((o) => o.textContent);
		expect(options).toContain("Shared");
		expect(options).toContain("Personal");
	});

	it("does NOT show team/product/practice/bet/task scopes for single-team", async () => {
		const { useTeams } = await import("../../../hooks/useTeams.js");
		vi.mocked(useTeams).mockReturnValue({
			data: {
				teams: [{ id: "t1", name: "Alpha Team", phase: "build", status: "healthy", leadAgentId: null, activeBets: 0, shipped: 0, shipRate: "0%", progress: { done: 0, total: 0 } }],
			},
			loading: false,
			error: null,
		});

		render(<KnowledgeCreateDialog {...BASE_PROPS} />);

		await waitFor(() => {
			expect(screen.getByRole("combobox", { name: /scope kind/i })).toBeInTheDocument();
		});

		const select = screen.getByRole("combobox", { name: /scope kind/i });
		const optionValues = Array.from(select.querySelectorAll("option")).map(
			(o) => o.getAttribute("value"),
		);

		for (const excluded of ["product", "practice", "team", "bet", "task"]) {
			expect(optionValues).not.toContain(excluded);
		}
	});

	it("shows all 7 scope options when there are 2+ teams", async () => {
		const { useTeams } = await import("../../../hooks/useTeams.js");
		vi.mocked(useTeams).mockReturnValue({
			data: {
				teams: [
					{ id: "t1", name: "Alpha Team", phase: "build", status: "healthy", leadAgentId: null, activeBets: 0, shipped: 0, shipRate: "0%", progress: { done: 0, total: 0 } },
					{ id: "t2", name: "Beta Team", phase: "build", status: "healthy", leadAgentId: null, activeBets: 0, shipped: 0, shipRate: "0%", progress: { done: 0, total: 0 } },
				],
			},
			loading: false,
			error: null,
		});

		render(<KnowledgeCreateDialog {...BASE_PROPS} />);

		await waitFor(() => {
			expect(screen.getByRole("combobox", { name: /scope kind/i })).toBeInTheDocument();
		});

		const select = screen.getByRole("combobox", { name: /scope kind/i });
		const options = Array.from(select.querySelectorAll("option"));
		expect(options).toHaveLength(7);
	});

	it("does NOT render scope select when scope is locked (existing behavior)", async () => {
		// Lock the scope — locked prop hides the combobox entirely, regardless of team count
		const { useTeams } = await import("../../../hooks/useTeams.js");
		vi.mocked(useTeams).mockReturnValue({
			data: { teams: [{ id: "t1", name: "Alpha Team", phase: "build", status: "healthy", leadAgentId: null, activeBets: 0, shipped: 0, shipRate: "0%", progress: { done: 0, total: 0 } }] },
			loading: false,
			error: null,
		});

		render(<KnowledgeCreateDialog {...BASE_PROPS} lockedScopeKind="factory" />);

		expect(screen.queryByRole("combobox", { name: /scope kind/i })).not.toBeInTheDocument();
		// Locked scope shown as a read-only tag instead
		expect(screen.getByText("factory")).toBeInTheDocument();
	});
});
