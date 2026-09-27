/**
 * AF15 — SettingsOrgChart: team target from real teams list (AC-6).
 *
 * Tests that:
 * - When search_users returns users carrying a `team`, the Add-Edge form's
 *   Team select populates from those distinct teams (not from edge derivation).
 * - When no teams are returned, the select shows the "No teams yet…" disabled
 *   option with copy pointing to Setup (not to "Work").
 * - Solo short-circuit (1 human) is RELAXED: Add-Edge form still renders.
 * - With 1 human, mechanism defaults to "function" (not "direct").
 *
 * @lore search_users/edit_user replace org routes — each UserRow carries its own edges and team, so a target is its real id, no team_members indirection.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { callMock } = vi.hoisted(() => ({ callMock: vi.fn() }));
vi.mock("../../services/call.js", () => ({ call: callMock }));

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

type MockEdge = { id: string; mechanism: string; target: string };
type MockUserRow = {
	id: string;
	kind: string;
	name: string;
	role: string;
	team: { id: string; name: string } | null;
	edges: MockEdge[];
};

function mkUser(overrides: Partial<MockUserRow> = {}): MockUserRow {
	return {
		id: overrides.id ?? "u1",
		kind: overrides.kind ?? "human",
		name: overrides.name ?? "User",
		role: overrides.role ?? "member",
		team: overrides.team ?? null,
		edges: overrides.edges ?? [],
	};
}

/** Routes `search_users` (the list) and `edit_user` (add/remove edges). */
function setupCall(users: MockUserRow[]): void {
	callMock.mockImplementation((name: string, input: Record<string, unknown>) => {
		if (name === "search_users") return Promise.resolve({ ok: true, data: users });
		if (name === "edit_user") {
			const id = input.id as string;
			const editedUser = users.find((u) => u.id === id);
			const edgesInput = input.edges as
				| { add?: { mechanism: string; target: string }[]; remove?: string[] }
				| undefined;
			let edges = editedUser?.edges ?? [];
			if (edgesInput?.remove) {
				edges = edges.filter((e) => !edgesInput.remove?.includes(e.id));
			}
			if (edgesInput?.add) {
				edges = [...edges, ...edgesInput.add.map((a, i) => ({ id: `new-edge-${i}`, ...a }))];
			}
			if (editedUser) editedUser.edges = edges;
			return Promise.resolve({
				ok: true,
				data: { user: { ...editedUser, id, edges } },
			});
		}
		return Promise.resolve({ ok: false, problems: [{ code: "unmocked", message: name }] });
	});
}

describe("SettingsOrgChart: team select from real teams", () => {
	beforeEach(() => {
		callMock.mockReset();
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

	it("populates team select from users' effective teams when teams are available", async () => {
		const user = userEvent.setup();
		setupCall([
			mkUser({ id: "u1", name: "Alice", team: { id: "team-1", name: "Alpha Team" } }),
			mkUser({ id: "u2", name: "Bob", team: { id: "team-1", name: "Alpha Team" } }),
		]);

		render(<SettingsOrgChart />);

		await waitFor(() => {
			expect(screen.getByTestId("add-edge-btn")).toBeInTheDocument();
		});

		await user.click(screen.getByTestId("add-edge-btn"));

		const mechanismSelect = screen.getByRole("combobox", { name: /mechanism/i });
		await user.selectOptions(mechanismSelect, "team");

		const targetTrigger = await screen.findByRole("combobox", { name: "Target" });
		await user.click(targetTrigger);
		await waitFor(() => {
			expect(screen.getByText("Alpha Team")).toBeInTheDocument();
		});
	});

	it("shows disabled 'No teams yet' option when no user carries a team", async () => {
		const user = userEvent.setup();
		setupCall([mkUser({ id: "u1", name: "Alice" }), mkUser({ id: "u2", name: "Bob" })]);

		render(<SettingsOrgChart />);
		await waitFor(() => {
			expect(screen.getByTestId("add-edge-btn")).toBeInTheDocument();
		});

		await user.click(screen.getByTestId("add-edge-btn"));

		const mechanismSelect = screen.getByRole("combobox", { name: /mechanism/i });
		await user.selectOptions(mechanismSelect, "team");

		const targetTrigger = await screen.findByRole("combobox", { name: "Target" });
		await user.click(targetTrigger);

		await waitFor(() => {
			const text = document.body.textContent ?? "";
			expect(text).toMatch(/no teams yet/i);
		});
	});

	it("picks From and Target (team) through their comboboxes and calls edit_user with that team's id", async () => {
		const user = userEvent.setup();
		setupCall([
			mkUser({ id: "u1", name: "Alice", team: { id: "team-1", name: "Alpha Team" } }),
			mkUser({ id: "u2", name: "Bob", team: { id: "team-1", name: "Alpha Team" } }),
		]);

		render(<SettingsOrgChart />);
		await waitFor(() => {
			expect(screen.getByTestId("add-edge-btn")).toBeInTheDocument();
		});
		await user.click(screen.getByTestId("add-edge-btn"));

		const fromTrigger = screen.getByRole("combobox", { name: "From" });
		await user.click(fromTrigger);
		await user.click(await screen.findByText("Alice"));

		const mechanismSelect = screen.getByRole("combobox", { name: /mechanism/i });
		await user.selectOptions(mechanismSelect, "team");

		const targetTrigger = await screen.findByRole("combobox", { name: "Target" });
		await user.click(targetTrigger);
		await user.click(await screen.findByText("Alpha Team"));

		await user.click(screen.getByTestId("org-add-submit"));

		await waitFor(() => {
			expect(callMock).toHaveBeenCalledWith("edit_user", {
				id: "u1",
				edges: { add: [{ mechanism: "team", target: "team-1" }] },
			});
		});
	});

	// Mirrors the "team" path above — the "direct" (user → user) path had no
	// test of its own even though it is the default mechanism.
	it("picks From and Target (direct/user) through their comboboxes and calls edit_user with the target user's id", async () => {
		const user = userEvent.setup();
		setupCall([mkUser({ id: "u1", name: "Alice" }), mkUser({ id: "u2", name: "Bob" })]);

		render(<SettingsOrgChart />);
		await waitFor(() => {
			expect(screen.getByTestId("add-edge-btn")).toBeInTheDocument();
		});
		await user.click(screen.getByTestId("add-edge-btn"));

		const fromTrigger = screen.getByRole("combobox", { name: "From" });
		await user.click(fromTrigger);
		await user.click(await screen.findByText("Alice"));

		// Mechanism defaults to "direct" — no need to switch it.
		const targetTrigger = screen.getByRole("combobox", { name: "Target" });
		await user.click(targetTrigger);
		await user.click(await screen.findByText("Bob"));

		await user.click(screen.getByTestId("org-add-submit"));

		await waitFor(() => {
			expect(callMock).toHaveBeenCalledWith("edit_user", {
				id: "u1",
				edges: { add: [{ mechanism: "direct", target: "u2" }] },
			});
		});
	});

	it("'No teams yet' copy does NOT say 'create one in Work' (dead-end copy removed)", async () => {
		const user = userEvent.setup();
		setupCall([mkUser({ id: "u1", name: "Alice" }), mkUser({ id: "u2", name: "Bob" })]);

		render(<SettingsOrgChart />);
		await waitFor(() => {
			expect(screen.getByTestId("add-edge-btn")).toBeInTheDocument();
		});
		await user.click(screen.getByTestId("add-edge-btn"));
		const mechanismSelect = screen.getByRole("combobox", { name: /mechanism/i });
		await user.selectOptions(mechanismSelect, "team");

		const targetTrigger = await screen.findByRole("combobox", { name: "Target" });
		await user.click(targetTrigger);

		await waitFor(() => {
			const text = document.body.textContent ?? "";
			expect(text).not.toMatch(/create one in work/i);
		});
	});
});

describe("SettingsOrgChart: solo short-circuit relaxed", () => {
	beforeEach(() => {
		callMock.mockReset();
		mockShowToast.mockClear();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("renders Add-Edge form when exactly 1 human user (not only guidance text)", async () => {
		setupCall([mkUser({ id: "u1", name: "Solo Founder" })]);

		render(<SettingsOrgChart />);
		await waitFor(() => {
			expect(screen.getByTestId("add-edge-btn")).toBeInTheDocument();
		});
	});

	it("shows solo hint text alongside Add-Edge form (not instead of it)", async () => {
		setupCall([mkUser({ id: "u1", name: "Solo Founder" })]);

		render(<SettingsOrgChart />);
		await waitFor(() => {
			expect(screen.getByTestId("add-edge-btn")).toBeInTheDocument();
		});
		const text = document.body.textContent ?? "";
		expect(text.toLowerCase()).toMatch(/function|reporting|add/i);
	});

	it("mechanism defaults to 'function' in solo mode (1 human)", async () => {
		const user = userEvent.setup();
		setupCall([mkUser({ id: "u1", name: "Solo Founder" })]);

		render(<SettingsOrgChart />);
		await waitFor(() => {
			expect(screen.getByTestId("add-edge-btn")).toBeInTheDocument();
		});

		await user.click(screen.getByTestId("add-edge-btn"));

		await waitFor(() => {
			const mechanismSelect = screen.getByRole("combobox", { name: /mechanism/i });
			expect((mechanismSelect as HTMLSelectElement).value).toBe("function");
		});
	});
});
