/**
 * AG3 — WorkBetCreate component tests (red phase).
 *
 * AC coverage:
 * AC1: Full-page surface with BodyEditor, no Dialog role, data-testid="bet-create-page"
 * AC2: (entry-point redirect covered in WorkPortfolio.AG3.test.tsx)
 * AC4: Commitments aside renders team; Create gated on body+team.
 *
 * @lore AU21 Increment 14a: the "Appetite" create-time input is HARD-DELETED
 * along with the rest of the cost-cap feature — no replacement.
 * AC6: Cancel-when-dirty confirm; no POST on abandon; POST only on Create
 * AC7: POST payload shape; navigate to /work/bet/:id on 201
 *
 * @lore T3: BodyEditor (TipTap) cannot run in JSDOM. Mocked at module level with
 * a textarea data-testid="mock-body-editor". Matches BetCreateDialog.test.tsx pattern.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkBetCreate } from "../pages/WorkBetCreate";

// Mock BodyEditor — TipTap cannot run in JSDOM
vi.mock("../ds", async (importOriginal) => {
	const original = await importOriginal<typeof import("../ds")>();
	return {
		...original,
		BodyEditor: ({
			onChange,
			placeholder,
			editable,
		}: {
			onChange?: (md: string) => void;
			initialContent?: string;
			placeholder?: string;
			editable?: boolean;
		}) => (
			<textarea
				aria-label="Body editor"
				data-testid="mock-body-editor"
				placeholder={placeholder}
				disabled={editable === false}
				onChange={(e) => onChange?.(e.target.value)}
			/>
		),
	};
});

// Mock apiFetch so we can inspect POST calls without network
vi.mock("../services/api-fetch.js", () => ({
	apiFetch: vi.fn(),
}));

// Mock useTeams — WorkBetCreate calls it unconditionally (no overrideTeams prop)
vi.mock("../hooks/useTeams", () => ({
	useTeams: vi.fn(),
}));

// Mock navigate so we can assert navigation without a real router history
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
	const original = await importOriginal<typeof import("react-router-dom")>();
	return {
		...original,
		useNavigate: () => mockNavigate,
	};
});

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
};

const SINGLE_TEAM = [{ id: "team-1", name: "Alpha Team", ...TEAM_BASE }];
const MULTIPLE_TEAMS = [
	{ id: "team-1", name: "Alpha Team", ...TEAM_BASE },
	{ id: "team-2", name: "Beta Team", ...TEAM_BASE },
];

async function setupUseTeams(teams: typeof SINGLE_TEAM) {
	const { useTeams } = await import("../hooks/useTeams");
	vi.mocked(useTeams).mockReturnValue({
		data: { teams },
		loading: false,
		error: null,
		refetch: vi.fn(),
	});
}

function renderPage(): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={["/work/bet/new"]}>
			<WorkBetCreate />
		</MemoryRouter>,
	);
}

beforeEach(async () => {
	vi.clearAllMocks();
	await setupUseTeams(SINGLE_TEAM);
});

afterEach(() => {
	vi.clearAllMocks();
});

// ─── AC1: Full-page surface ────────────────────────────────────────────────────

describe("AC1 — full-page surface, no dialog", () => {
	it("renders data-testid='bet-create-page'", () => {
		renderPage();
		expect(screen.getByTestId("bet-create-page")).toBeInTheDocument();
	});

	it("renders BodyEditor (mock-body-editor)", () => {
		renderPage();
		expect(screen.getByTestId("mock-body-editor")).toBeInTheDocument();
	});

	it("does NOT render a dialog role", () => {
		renderPage();
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});

	it("renders Create button", () => {
		renderPage();
		expect(screen.getByRole("button", { name: /^create$/i })).toBeInTheDocument();
	});

	it("renders Cancel button", () => {
		renderPage();
		expect(screen.getByRole("button", { name: /^cancel$/i })).toBeInTheDocument();
	});

	// AD9: breadcrumb points to /work (was /work/portfolio)
	it("renders breadcrumb nav (back to work overview)", () => {
		renderPage();
		const nav = screen.getByRole("navigation", { name: /breadcrumb/i });
		expect(nav).toBeInTheDocument();
	});
});

// ─── AC4: Commitments aside ───────────────────────────────────────────────────

describe("AC4 — commitments aside", () => {
	it("renders bet-create-commitments aside", () => {
		renderPage();
		expect(screen.getByTestId("bet-create-commitments")).toBeInTheDocument();
	});

	it("single team: Create enabled when body non-empty (team auto-resolved)", async () => {
		await setupUseTeams(SINGLE_TEAM);
		renderPage();
		const editor = screen.getByTestId("mock-body-editor");
		fireEvent.change(editor, { target: { value: "# A Bet\n\nSome content." } });

		const createBtn = screen.getByRole("button", { name: /^create$/i });
		expect(createBtn).not.toBeDisabled();
	});

	it("Create disabled when body is empty (single team)", async () => {
		await setupUseTeams(SINGLE_TEAM);
		renderPage();
		const createBtn = screen.getByRole("button", { name: /^create$/i });
		expect(createBtn).toBeDisabled();
	});

	it("multiple teams: shows team select when more than 1 team", async () => {
		await setupUseTeams(MULTIPLE_TEAMS);
		renderPage();
		// Should render a team selector
		expect(screen.getByLabelText(/team/i)).toBeInTheDocument();
	});

	it("multiple teams: Create disabled when body non-empty but no team selected", async () => {
		await setupUseTeams(MULTIPLE_TEAMS);
		renderPage();
		const editor = screen.getByTestId("mock-body-editor");
		fireEvent.change(editor, { target: { value: "# A Bet\n\nContent." } });

		const createBtn = screen.getByRole("button", { name: /^create$/i });
		expect(createBtn).toBeDisabled();
	});

	it("POST payload never includes costAppetite (cost-cap feature deleted, AU21 Increment 14a)", async () => {
		const { apiFetch } = await import("../services/api-fetch.js");
		const fetchSpy = vi.mocked(apiFetch);
		fetchSpy.mockResolvedValueOnce(
			new Response(JSON.stringify({ id: "bet-new-1" }), { status: 201 }),
		);

		await setupUseTeams(SINGLE_TEAM);
		renderPage();

		const editor = screen.getByTestId("mock-body-editor");
		fireEvent.change(editor, { target: { value: "# My Bet\n\nContent here." } });

		fireEvent.click(screen.getByRole("button", { name: /^create$/i }));

		await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
		const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
		const body = JSON.parse(options.body as string) as Record<string, unknown>;
		expect(body).not.toHaveProperty("costAppetite");
		expect(body).toHaveProperty("teamId", "team-1");
		expect(body).toHaveProperty("description");
	});

	it("single team: no team select rendered (static line or label only)", async () => {
		await setupUseTeams(SINGLE_TEAM);
		renderPage();
		// The team select (combobox) must NOT appear when only 1 team
		expect(screen.queryByRole("combobox", { name: /team/i })).not.toBeInTheDocument();
	});
});

// ─── AC6: Abandon / Cancel behavior ──────────────────────────────────────────

describe("AC6 — cancel and abandon", () => {
	it("Cancel with empty body navigates immediately (no confirm)", async () => {
		await setupUseTeams(SINGLE_TEAM);
		renderPage();

		// Body is empty — click Cancel
		fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));

		// AD9: navigates to /work (was /work/portfolio)
		expect(mockNavigate).toHaveBeenCalledWith("/work");
	});

	it("Cancel with body content shows a confirm dialog (dirty guard)", async () => {
		await setupUseTeams(SINGLE_TEAM);
		renderPage();

		// Type some content to make body dirty
		const editor = screen.getByTestId("mock-body-editor");
		fireEvent.change(editor, { target: { value: "# Dirty content" } });

		// Spy on window.confirm
		const confirmSpy = vi.spyOn(window, "confirm").mockReturnValueOnce(false);

		fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));

		expect(confirmSpy).toHaveBeenCalledTimes(1);
		// User declined — should NOT navigate
		expect(mockNavigate).not.toHaveBeenCalled();

		confirmSpy.mockRestore();
	});

	it("Cancel with dirty body AND confirm=true does navigate", async () => {
		await setupUseTeams(SINGLE_TEAM);
		renderPage();

		const editor = screen.getByTestId("mock-body-editor");
		fireEvent.change(editor, { target: { value: "# Dirty content" } });

		const confirmSpy = vi.spyOn(window, "confirm").mockReturnValueOnce(true);

		fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));

		expect(confirmSpy).toHaveBeenCalledTimes(1);
		// AD9: navigates to /work (was /work/portfolio)
		expect(mockNavigate).toHaveBeenCalledWith("/work");

		confirmSpy.mockRestore();
	});

	it("abandon without clicking Create does NOT fire a POST", async () => {
		const { apiFetch } = await import("../services/api-fetch.js");
		const fetchSpy = vi.mocked(apiFetch);

		await setupUseTeams(SINGLE_TEAM);
		renderPage();

		// Type some content, then cancel (confirm = true)
		const editor = screen.getByTestId("mock-body-editor");
		fireEvent.change(editor, { target: { value: "# Content to abandon" } });

		vi.spyOn(window, "confirm").mockReturnValueOnce(true);
		fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));

		// No POST should have been fired
		expect(fetchSpy).not.toHaveBeenCalled();
	});
});

// ─── AC7: POST payload + success navigation ───────────────────────────────────

describe("AC7 — POST payload and success navigation", () => {
	it("POST fires only when Create is clicked (not on editor change)", async () => {
		const { apiFetch } = await import("../services/api-fetch.js");
		const fetchSpy = vi.mocked(apiFetch);

		await setupUseTeams(SINGLE_TEAM);
		renderPage();

		const editor = screen.getByTestId("mock-body-editor");
		fireEvent.change(editor, { target: { value: "# My Bet\n\nSome content." } });

		// No POST yet
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("POST to /api/bets on Create with correct teamId + description", async () => {
		const { apiFetch } = await import("../services/api-fetch.js");
		const fetchSpy = vi.mocked(apiFetch);
		fetchSpy.mockResolvedValueOnce(
			new Response(JSON.stringify({ id: "bet-xyz" }), { status: 201 }),
		);

		await setupUseTeams(SINGLE_TEAM);
		renderPage();

		const editor = screen.getByTestId("mock-body-editor");
		fireEvent.change(editor, { target: { value: "# My Bet\n\nSome content." } });

		fireEvent.click(screen.getByRole("button", { name: /^create$/i }));

		await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
		const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
		expect(url).toBe("/api/bets");
		expect((options.method as string).toUpperCase()).toBe("POST");
		const body = JSON.parse(options.body as string) as Record<string, unknown>;
		expect(body).toHaveProperty("teamId", "team-1");
		expect(body).toHaveProperty("description", "# My Bet\n\nSome content.");
	});

	it("navigates to /work/bet/:id on 201 response", async () => {
		const { apiFetch } = await import("../services/api-fetch.js");
		vi.mocked(apiFetch).mockResolvedValueOnce(
			new Response(JSON.stringify({ id: "bet-created-1" }), { status: 201 }),
		);

		await setupUseTeams(SINGLE_TEAM);
		renderPage();

		const editor = screen.getByTestId("mock-body-editor");
		fireEvent.change(editor, { target: { value: "# New Bet\n\nContent." } });
		fireEvent.click(screen.getByRole("button", { name: /^create$/i }));

		await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/work/bet/bet-created-1"));
	});

	it("shows error when API returns non-ok", async () => {
		const { apiFetch } = await import("../services/api-fetch.js");
		vi.mocked(apiFetch).mockResolvedValueOnce(
			new Response(JSON.stringify({ error: "Team not found" }), { status: 422 }),
		);

		await setupUseTeams(SINGLE_TEAM);
		renderPage();

		const editor = screen.getByTestId("mock-body-editor");
		fireEvent.change(editor, { target: { value: "# Bad Bet\n\nContent." } });
		fireEvent.click(screen.getByRole("button", { name: /^create$/i }));

		await waitFor(() => {
			const alert = screen.getByRole("alert");
			expect(alert).toBeInTheDocument();
			expect(alert.textContent).toContain("Team not found");
		});
	});

	it("title preview updates live from body content", async () => {
		await setupUseTeams(SINGLE_TEAM);
		renderPage();

		const editor = screen.getByTestId("mock-body-editor");
		fireEvent.change(editor, { target: { value: "# My Feature Bet\n\nContent." } });

		// Title preview should show derived title
		expect(screen.getByTestId("bet-create-title-preview")).toBeInTheDocument();
		expect(screen.getByTestId("bet-create-title-preview").textContent).toContain("My Feature Bet");
	});

	it("BodyEditor disabled while submitting", async () => {
		const { apiFetch } = await import("../services/api-fetch.js");
		vi.mocked(apiFetch).mockImplementation(() => new Promise(() => {})); // never resolves

		await setupUseTeams(SINGLE_TEAM);
		renderPage();

		const editor = screen.getByTestId("mock-body-editor");
		fireEvent.change(editor, { target: { value: "# Bet\n\nContent." } });
		fireEvent.click(screen.getByRole("button", { name: /^create$/i }));

		// Editor should be disabled during submit
		expect(screen.getByTestId("mock-body-editor")).toBeDisabled();
	});
});
