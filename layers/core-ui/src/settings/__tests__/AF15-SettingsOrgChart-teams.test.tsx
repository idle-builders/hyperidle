/**
 * AF15 RED — SettingsOrgChart: team target from real teams list (AC-6).
 *
 * Tests that:
 * - When GET /api/org returns teams: [{id, name}], the Add-Edge form's Team
 *   select populates from data.teams (not from edge derivation).
 * - When no teams are returned, the select shows the "No teams yet…" disabled
 *   option with copy pointing to Setup (not to "Work").
 * - Solo short-circuit (1 human) is RELAXED: Add-Edge form still renders.
 * - With 1 human, mechanism defaults to "function" (not "direct").
 *
 * @lore AF15: The previous code derived teams from existing edges — a circular
 * dependency. Now teams come from GET /api/org `teams` array. The solo short-circuit
 * showed only guidance text; now it shows guidance AS HINT + the Add-Edge form below.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock apiFetch (SettingsOrgChart uses this, not global.fetch)
vi.mock("../../services/api-fetch.js", () => ({
	apiFetch: vi.fn(),
}));

// Mock useToast (SettingsOrgChart uses it; no ToastRegion in this test env)
const mockShowToast = vi.fn();
vi.mock("../../shell/ToastRegion.js", async () => {
	const actual = await vi.importActual("../../shell/ToastRegion.js");
	return {
		...actual,
		useToast: vi.fn(() => ({ showToast: mockShowToast })),
	};
});

import { SettingsOrgChart } from "../SettingsOrgChart.js";

type OrgUser = { id: string; kind: string; name: string; role: string };
type OrgTeam = { id: string; name: string };

function makeOrgResponse(users: OrgUser[], edges: unknown[] = [], teams: OrgTeam[] = []): Response {
	return new Response(JSON.stringify({ edges, users, teams }), { status: 200 });
}

describe("AF15 AC-6 — SettingsOrgChart: team select from real teams", () => {
	let fetchSpy: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		const { apiFetch } = await import("../../services/api-fetch.js");
		fetchSpy = vi.mocked(apiFetch);
		fetchSpy.mockReset();
		mockShowToast.mockClear();
		Object.defineProperty(window, "__HYPERIDLE__", {
			value: undefined,
			configurable: true,
			writable: true,
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("populates team select from data.teams when teams are available", async () => {
		const user = userEvent.setup();
		fetchSpy.mockResolvedValue(
			makeOrgResponse(
				[
					{ id: "u1", kind: "human", name: "Alice", role: "founder" },
					{ id: "u2", kind: "human", name: "Bob", role: "engineer" },
				],
				[],
				[{ id: "tm-1", name: "Alpha Team" }],
			),
		);

		render(<SettingsOrgChart />);

		// Wait for load — add-edge button appears in multi-human mode
		await waitFor(() => {
			expect(screen.getByTestId("add-edge-btn")).toBeInTheDocument();
		});

		// Open add form
		await user.click(screen.getByTestId("add-edge-btn"));

		// Switch mechanism to "team"
		const mechanismSelect = screen.getByRole("combobox", { name: /mechanism/i });
		await user.selectOptions(mechanismSelect, "team");

		// Open the team target combobox — its popover should offer "Alpha Team"
		const targetTrigger = await waitFor(() => {
			const found = screen.getAllByRole("combobox").find((c) => c.id === "org-target");
			expect(found).toBeDefined();
			return found as HTMLElement;
		});
		await user.click(targetTrigger);
		await waitFor(() => {
			expect(screen.getByText("Alpha Team")).toBeInTheDocument();
		});
	});

	it("shows disabled 'No teams yet' option when teams array is empty", async () => {
		const user = userEvent.setup();
		fetchSpy.mockResolvedValue(
			makeOrgResponse(
				[
					{ id: "u1", kind: "human", name: "Alice", role: "founder" },
					{ id: "u2", kind: "human", name: "Bob", role: "engineer" },
				],
				[],
				[], // no teams
			),
		);

		render(<SettingsOrgChart />);
		await waitFor(() => {
			expect(screen.getByTestId("add-edge-btn")).toBeInTheDocument();
		});

		await user.click(screen.getByTestId("add-edge-btn"));

		const mechanismSelect = screen.getByRole("combobox", { name: /mechanism/i });
		await user.selectOptions(mechanismSelect, "team");

		const targetTrigger = await waitFor(() => {
			const found = screen.getAllByRole("combobox").find((c) => c.id === "org-target");
			expect(found).toBeDefined();
			return found as HTMLElement;
		});
		await user.click(targetTrigger);

		// Should show the "No teams yet" message
		await waitFor(() => {
			const text = document.body.textContent ?? "";
			expect(text).toMatch(/no teams yet/i);
		});
	});

	it("picks From and Target (team) through their comboboxes and PUTs that team's id", async () => {
		const user = userEvent.setup();
		fetchSpy.mockResolvedValue(
			makeOrgResponse(
				[
					{ id: "u1", kind: "human", name: "Alice", role: "founder" },
					{ id: "u2", kind: "human", name: "Bob", role: "engineer" },
				],
				[],
				[{ id: "tm-1", name: "Alpha Team" }],
			),
		);

		render(<SettingsOrgChart />);
		await waitFor(() => {
			expect(screen.getByTestId("add-edge-btn")).toBeInTheDocument();
		});
		await user.click(screen.getByTestId("add-edge-btn"));

		const fromTrigger = screen.getAllByRole("combobox").find((c) => c.id === "org-from");
		expect(fromTrigger).toBeDefined();
		await user.click(fromTrigger as HTMLElement);
		await user.click(await screen.findByText("Alice"));

		const mechanismSelect = screen.getByRole("combobox", { name: /mechanism/i });
		await user.selectOptions(mechanismSelect, "team");

		const targetTrigger = await waitFor(() => {
			const found = screen.getAllByRole("combobox").find((c) => c.id === "org-target");
			expect(found).toBeDefined();
			return found as HTMLElement;
		});
		await user.click(targetTrigger);
		await user.click(await screen.findByText("Alpha Team"));

		await user.click(screen.getByTestId("org-add-submit"));

		await waitFor(() => {
			const putCall = fetchSpy.mock.calls.find(
				([, opts]) => (opts as RequestInit | undefined)?.method === "PUT",
			);
			expect(putCall).toBeDefined();
			const body = JSON.parse((putCall?.[1] as RequestInit).body as string) as {
				fromUserId: string;
				mechanism: string;
				target: string;
			};
			expect(body).toEqual({ fromUserId: "u1", mechanism: "team", target: "tm-1" });
		});
	});

	it("'No teams yet' copy does NOT say 'create one in Work' (dead-end copy removed)", async () => {
		const user = userEvent.setup();
		fetchSpy.mockResolvedValue(
			makeOrgResponse(
				[
					{ id: "u1", kind: "human", name: "Alice", role: "founder" },
					{ id: "u2", kind: "human", name: "Bob", role: "engineer" },
				],
				[],
				[],
			),
		);

		render(<SettingsOrgChart />);
		await waitFor(() => {
			expect(screen.getByTestId("add-edge-btn")).toBeInTheDocument();
		});
		await user.click(screen.getByTestId("add-edge-btn"));
		const mechanismSelect = screen.getByRole("combobox", { name: /mechanism/i });
		await user.selectOptions(mechanismSelect, "team");

		const targetTrigger = await waitFor(() => {
			const found = screen.getAllByRole("combobox").find((c) => c.id === "org-target");
			expect(found).toBeDefined();
			return found as HTMLElement;
		});
		await user.click(targetTrigger);

		await waitFor(() => {
			const text = document.body.textContent ?? "";
			// Must NOT route user to Work (dead-end loop)
			expect(text).not.toMatch(/create one in work/i);
		});
	});
});

describe("AF15 AC-6 — SettingsOrgChart: solo short-circuit relaxed", () => {
	let fetchSpy: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		const { apiFetch } = await import("../../services/api-fetch.js");
		fetchSpy = vi.mocked(apiFetch);
		fetchSpy.mockReset();
		mockShowToast.mockClear();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("renders Add-Edge form when exactly 1 human user (not only guidance text)", async () => {
		fetchSpy.mockResolvedValue(
			makeOrgResponse([{ id: "u1", kind: "human", name: "Solo Founder", role: "founder" }], [], []),
		);

		render(<SettingsOrgChart />);
		await waitFor(() => {
			// The add-edge button must be rendered (not just guidance text)
			expect(screen.getByTestId("add-edge-btn")).toBeInTheDocument();
		});
	});

	it("shows solo hint text alongside Add-Edge form (not instead of it)", async () => {
		fetchSpy.mockResolvedValue(
			makeOrgResponse([{ id: "u1", kind: "human", name: "Solo Founder", role: "founder" }], [], []),
		);

		render(<SettingsOrgChart />);
		await waitFor(() => {
			// Both the guidance copy AND the add button should be visible
			expect(screen.getByTestId("add-edge-btn")).toBeInTheDocument();
		});
		// Should show some solo guidance copy above the form
		const text = document.body.textContent ?? "";
		expect(text.toLowerCase()).toMatch(/function|reporting|add/i);
	});

	it("mechanism defaults to 'function' in solo mode (1 human)", async () => {
		const user = userEvent.setup();
		fetchSpy.mockResolvedValue(
			makeOrgResponse([{ id: "u1", kind: "human", name: "Solo Founder", role: "founder" }], [], []),
		);

		render(<SettingsOrgChart />);
		await waitFor(() => {
			expect(screen.getByTestId("add-edge-btn")).toBeInTheDocument();
		});

		await user.click(screen.getByTestId("add-edge-btn"));

		// Mechanism select should default to "function" in solo mode
		await waitFor(() => {
			const mechanismSelect = screen.getByRole("combobox", { name: /mechanism/i });
			expect((mechanismSelect as HTMLSelectElement).value).toBe("function");
		});
	});
});
