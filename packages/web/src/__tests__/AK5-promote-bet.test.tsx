/**
 * AK5 — Promote a knowledge item into a bet: web component tests (red phase).
 *
 * AC coverage (AC3 — web side):
 * 1. KnowledgeDetail overflow menu has a "Promote to bet" menu item.
 * 2. "Promote to bet" is disabled when the knowledge item status is "archived".
 * 3. Clicking "Promote to bet" on a single-team setup calls POST /api/bets with
 *    sourceKnowledgeItemId in the payload and navigates to /work/bet/:id on 201.
 * 4. WorkBet renders a provenance backlink when sourceKnowledge is present.
 * 5. WorkBet renders no provenance backlink when sourceKnowledge is null.
 * 6. WorkBetCreate honours ?fromKnowledge= search param: seeds body from item and
 *    includes sourceKnowledgeItemId in the POST payload.
 * 7. Promote error banner renders when POST /api/bets fails.
 *
 * Carry-forward: multi-team routes through WorkBetCreate?fromKnowledge= (task 7).
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BetDetail } from "../types/bet";
import { MOCK_BETS } from "../pages/__fixtures__/work-bet-fixtures";
import { KnowledgeDetail } from "../pages/KnowledgeDetail";
import { WorkBet } from "../pages/WorkBet";
import { WorkBetCreate } from "../pages/WorkBetCreate";

// ─── Module-level mocks ─────────────────────────────────────────────────────

// Mock BodyEditor — TipTap cannot run in JSDOM
vi.mock("@hyperidle/design-system", async (importOriginal) => {
	const original = await importOriginal<typeof import("@hyperidle/design-system")>();
	return {
		...original,
		BodyEditor: ({
			initialContent,
			onChange,
			placeholder,
			editable,
		}: {
			initialContent?: string;
			onChange?: (md: string) => void;
			placeholder?: string;
			editable?: boolean;
		}) => (
			<div data-testid="mock-body-editor" data-editable={editable !== false ? "true" : "false"}>
				<textarea
					data-testid="body-editor-textarea"
					defaultValue={initialContent ?? ""}
					placeholder={placeholder}
					disabled={editable === false}
					onChange={(e) => onChange?.(e.target.value)}
					aria-label="Body editor"
				/>
			</div>
		),
	};
});

// Mock apiFetch
vi.mock("../services/api-fetch.js", () => ({
	apiFetch: vi.fn(),
}));

// Mock useKnowledgeItem — KnowledgeDetail live fetch hook
vi.mock("../hooks/useKnowledgeItem.js", () => ({
	useKnowledgeItem: () => ({ data: null, isLoading: false, error: null }),
}));

// Mock useAutoSave — KnowledgeDetail auto-save
vi.mock("../hooks/useAutoSave.js", () => ({
	useAutoSave: () => ({ status: "idle", save: vi.fn() }),
}));

// Mock useHostThread — used in KnowledgeDetail
vi.mock("../hooks/useHostThread.js", () => ({
	useHostThread: () => ({ data: null, isLoading: false, error: null }),
}));

// Mock HostThreadSection — renders inside KnowledgeDetail without fetch complexity
vi.mock("../shell/HostThreadSection", () => ({
	HostThreadSection: () => <div data-testid="host-thread-section" />,
}));

// Mock useCurrentUser
vi.mock("../hooks/useCurrentUser.js", () => ({
	useCurrentUser: () => ({ user: { id: "user-1", name: "Test User" } }),
}));

// Mock useTeams — WorkBetCreate calls it unconditionally
vi.mock("../hooks/useTeams", () => ({
	useTeams: vi.fn(),
}));

// Mock navigate to assert navigation without real router history
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
	const original = await importOriginal<typeof import("react-router-dom")>();
	return {
		...original,
		useNavigate: () => mockNavigate,
	};
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TEAM_BASE = {
	phase: "build",
	status: "healthy" as const,
	leadAgentId: null,
	activeBets: 0,
	shipped: 0,
	shipRate: "—",
	progress: { done: 0, total: 0 },
	routineCount: 0,
	agentCount: 0,
	activeAgentCount: 0,
	agentHealthWarning: false,
};

async function setupSingleTeam(): Promise<void> {
	const { useTeams } = await import("../hooks/useTeams");
	vi.mocked(useTeams).mockReturnValue({
		data: { teams: [{ id: "team-1", name: "Alpha Team", ...TEAM_BASE }] },
		loading: false,
		error: null,
	});
}

function renderKnowledgeDetail(knowledgeId: string): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={[`/knowledge/${knowledgeId}`]}>
			<Routes>
				<Route path="/knowledge/:knowledgeId" element={<KnowledgeDetail />} />
			</Routes>
		</MemoryRouter>,
	);
}

function renderWorkBet(bet: BetDetail): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={[`/work/bet/${bet.id}`]}>
			<Routes>
				<Route path="/work/bet/:betId" element={<WorkBet overrideBet={bet} />} />
			</Routes>
		</MemoryRouter>,
	);
}

function renderWorkBetCreate(searchParams = ""): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={[`/work/bet/new${searchParams}`]}>
			<Routes>
				<Route path="/work/bet/new" element={<WorkBetCreate />} />
			</Routes>
		</MemoryRouter>,
	);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("AK5 — KnowledgeDetail: Promote to bet menu item", () => {
	let apiFetchSpy: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		vi.clearAllMocks();
		const { apiFetch } = await import("../services/api-fetch.js");
		apiFetchSpy = vi.mocked(apiFetch);
		// Default: 404 (falls back to fixture)
		apiFetchSpy.mockResolvedValue(new Response("Not Found", { status: 404 }));
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("overflow menu includes a 'Promote to bet' menu item", async () => {
		const user = userEvent.setup();
		// k1 is an active knowledge item in fixtures
		renderKnowledgeDetail("k1");

		await user.click(screen.getByRole("button", { name: /more options/i }));

		expect(
			screen.getByRole("menuitem", { name: /promote to bet/i }),
		).toBeInTheDocument();
	});

	it("'Promote to bet' item has data-testid='knowledge-promote-bet'", async () => {
		const user = userEvent.setup();
		renderKnowledgeDetail("k1");

		await user.click(screen.getByRole("button", { name: /more options/i }));

		expect(screen.getByTestId("knowledge-promote-bet")).toBeInTheDocument();
	});

	it("'Promote to bet' is disabled when item status is 'archived'", async () => {
		const user = userEvent.setup();
		// k10 = archived item (fixtures carry status=archived). If not available,
		// use an item known to be archived in the fixture set.
		// Use k-archived if it exists; this test will fail red until both the
		// fixture and the disabled guard are implemented.
		renderKnowledgeDetail("k-archived");

		// Item renders (fallback is fine) — open menu
		await user.click(screen.getByRole("button", { name: /more options/i }));

		const promoteItem = screen.getByTestId("knowledge-promote-bet");
		// The menu item must be disabled (aria-disabled or a disabled attribute)
		expect(promoteItem).toHaveAttribute("aria-disabled", "true");
	});

	it("clicking 'Promote to bet' (single-team) POSTs to /api/bets with sourceKnowledgeItemId", async () => {
		await setupSingleTeam();
		apiFetchSpy.mockImplementation((url: string, opts?: RequestInit) => {
			if (url === "/api/bets" && opts?.method === "POST") {
				return Promise.resolve(
					new Response(JSON.stringify({ id: "new-bet-1" }), { status: 201 }),
				);
			}
			return Promise.resolve(new Response("Not Found", { status: 404 }));
		});

		const user = userEvent.setup();
		renderKnowledgeDetail("k1");

		await user.click(screen.getByRole("button", { name: /more options/i }));
		await user.click(screen.getByRole("menuitem", { name: /promote to bet/i }));

		await waitFor(() => {
			expect(apiFetchSpy).toHaveBeenCalledWith(
				"/api/bets",
				expect.objectContaining({
					method: "POST",
					body: expect.stringContaining('"sourceKnowledgeItemId"'),
				}),
			);
		});

		// Payload must contain sourceKnowledgeItemId = "k1"
		const callArgs = apiFetchSpy.mock.calls.find(
			([url, opts]) => url === "/api/bets" && opts?.method === "POST",
		);
		expect(callArgs).toBeDefined();
		const payload = JSON.parse(callArgs![1]!.body as string);
		expect(payload.sourceKnowledgeItemId).toBe("k1");
	});

	it("navigates to /work/bet/:id after successful promotion (single-team)", async () => {
		await setupSingleTeam();
		apiFetchSpy.mockImplementation((url: string, opts?: RequestInit) => {
			if (url === "/api/bets" && opts?.method === "POST") {
				return Promise.resolve(
					new Response(JSON.stringify({ id: "new-bet-42" }), { status: 201 }),
				);
			}
			return Promise.resolve(new Response("Not Found", { status: 404 }));
		});

		const user = userEvent.setup();
		renderKnowledgeDetail("k1");

		await user.click(screen.getByRole("button", { name: /more options/i }));
		await user.click(screen.getByRole("menuitem", { name: /promote to bet/i }));

		await waitFor(() => {
			expect(mockNavigate).toHaveBeenCalledWith("/work/bet/new-bet-42");
		});
	});

	it("shows an error banner when promote POST fails", async () => {
		await setupSingleTeam();
		apiFetchSpy.mockImplementation((url: string, opts?: RequestInit) => {
			if (url === "/api/bets" && opts?.method === "POST") {
				return Promise.resolve(new Response("Server error", { status: 500 }));
			}
			return Promise.resolve(new Response("Not Found", { status: 404 }));
		});

		const user = userEvent.setup();
		renderKnowledgeDetail("k1");

		await user.click(screen.getByRole("button", { name: /more options/i }));
		await user.click(screen.getByRole("menuitem", { name: /promote to bet/i }));

		await waitFor(() => {
			expect(screen.getByTestId("promote-error")).toBeInTheDocument();
		});
	});
});

describe("AK5 — WorkBet: provenance backlink display", () => {
	it("renders a provenance backlink when sourceKnowledge is present", () => {
		const betWithProvenance: BetDetail = {
			...MOCK_BETS.b1!,
			// AK5: sourceKnowledge enriched field — not yet on BetDetail type (red)
			sourceKnowledge: { id: "ki-ak5", title: "Architecture Decision: Auth Strategy" },
		} as BetDetail & { sourceKnowledge: { id: string; title: string } | null };

		renderWorkBet(betWithProvenance);

		expect(screen.getByTestId("bet-provenance-link")).toBeInTheDocument();
		expect(screen.getByTestId("bet-provenance-link")).toHaveTextContent(
			/From knowledge: Architecture Decision: Auth Strategy/i,
		);
	});

	it("provenance link points to /knowledge/:id", () => {
		const betWithProvenance: BetDetail = {
			...MOCK_BETS.b1!,
			sourceKnowledge: { id: "ki-ak5", title: "Architecture Decision: Auth Strategy" },
		} as BetDetail & { sourceKnowledge: { id: string; title: string } | null };

		renderWorkBet(betWithProvenance);

		const link = screen.getByTestId("bet-provenance-link");
		expect(link.getAttribute("href")).toBe("/knowledge/ki-ak5");
	});

	it("does NOT render provenance backlink when sourceKnowledge is null", () => {
		const betNoProvenance: BetDetail = {
			...MOCK_BETS.b1!,
			sourceKnowledge: null,
		} as BetDetail & { sourceKnowledge: { id: string; title: string } | null };

		renderWorkBet(betNoProvenance);

		expect(screen.queryByTestId("bet-provenance-link")).not.toBeInTheDocument();
	});

	it("does NOT render provenance backlink when sourceKnowledge field is absent (legacy bet)", () => {
		// MOCK_BETS.b1 has no sourceKnowledge — legacy shape
		renderWorkBet(MOCK_BETS.b1!);

		expect(screen.queryByTestId("bet-provenance-link")).not.toBeInTheDocument();
	});
});

describe("AK5 — WorkBetCreate: ?fromKnowledge= pre-fill (multi-team path)", () => {
	let apiFetchSpy: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		vi.clearAllMocks();
		const { apiFetch } = await import("../services/api-fetch.js");
		apiFetchSpy = vi.mocked(apiFetch);
		// Setup multi-team so the team select is visible
		const { useTeams } = await import("../hooks/useTeams");
		vi.mocked(useTeams).mockReturnValue({
			data: {
				teams: [
					{ id: "team-1", name: "Alpha Team", ...TEAM_BASE },
					{ id: "team-2", name: "Beta Team", ...TEAM_BASE },
				],
			},
			loading: false,
			error: null,
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("WorkBetCreate with ?fromKnowledge=ki-ak5 pre-seeds body from the knowledge item", async () => {
		// The mock for useKnowledgeItem must return the item body when fromKnowledge is set.
		// AK5 task 7: WorkBetCreate reads ?fromKnowledge= and calls useKnowledgeItem.
		// This test will fail (red) until task 7 is implemented.
		// We need the component to pre-fill the BodyEditor with the item body.

		// For this test we use a known fixture item "k1" whose body is accessible from fixture data.
		renderWorkBetCreate("?fromKnowledge=k1");

		// When fromKnowledge is set, the BodyEditor should have an initialContent matching
		// the knowledge item body. The mock body-editor exposes it via defaultValue.
		// This test will be red until the pre-fill is implemented.
		await waitFor(() => {
			const editor = screen.getByTestId("body-editor-textarea");
			// The textarea's value should contain some content from the knowledge item
			// (the exact text depends on fixture k1's body). It must NOT be empty.
			// When not implemented, it will be "" → test fails (red).
			expect(editor).toHaveValue(expect.not.stringMatching(/^$/));
		});
	});

	it("WorkBetCreate with ?fromKnowledge= carries sourceKnowledgeItemId in the POST payload", async () => {
		// Simulate a user typing in the editor (pre-filled) and clicking Create with
		// team already selected.

		apiFetchSpy.mockResolvedValue(
			new Response(JSON.stringify({ id: "new-bet-99" }), { status: 201 }),
		);

		const { useTeams } = await import("../hooks/useTeams");
		// Switch to single-team so team resolution is automatic, focusing test on payload
		vi.mocked(useTeams).mockReturnValue({
			data: { teams: [{ id: "team-1", name: "Alpha Team", ...TEAM_BASE }] },
			loading: false,
			error: null,
		});

		renderWorkBetCreate("?fromKnowledge=ki-ak5");

		// Type into the body editor (simulates pre-filled content that user can edit)
		const editor = screen.getByTestId("body-editor-textarea");
		fireEvent.change(editor, {
			target: { value: "# Some bet content from knowledge item" },
		});

		// Click Create
		const createBtn = screen.getByRole("button", { name: /^create$/i });
		await userEvent.setup().click(createBtn);

		await waitFor(() => {
			expect(apiFetchSpy).toHaveBeenCalledWith(
				"/api/bets",
				expect.objectContaining({
					method: "POST",
					body: expect.stringContaining('"sourceKnowledgeItemId":"ki-ak5"'),
				}),
			);
		});
	});
});
