/**
 * D4 (POLISH-060) — SettingsOrgChart: team edges resolve team name, not raw uuid.
 *
 * AC:
 *   1. A "team" mechanism edge renders the team NAME (not the raw team id).
 *   2. Empty edges state has explanatory copy about teams not auto-creating edges.
 *
 * @lore BC5 T9: door swap — `call("search_users", {})` replaces `GET
 * /api/org`. A team-mechanism edge's target is now the team's real id
 * directly (no more `team_members` indirection to resolve through).
 */

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { callMock } = vi.hoisted(() => ({ callMock: vi.fn() }));
vi.mock("../../services/call.js", () => ({ call: callMock }));

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

function setupCall(users: MockUserRow[]): void {
	callMock.mockImplementation((name: string) => {
		if (name === "search_users") return Promise.resolve({ ok: true, data: users });
		return Promise.resolve({ ok: false, problems: [{ code: "unmocked", message: name }] });
	});
}

describe("OrgChart team edge renders team name not raw id", () => {
	beforeEach(() => {
		callMock.mockReset();
		mockShowToast.mockClear();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("renders team name instead of raw team id for team-mechanism edges", async () => {
		setupCall([
			mkUser({
				id: "u1",
				name: "Alice",
				team: { id: "team-abc-uuid-123", name: "Alpha Team" },
				edges: [{ id: "edge-1", mechanism: "team", target: "team-abc-uuid-123" }],
			}),
			mkUser({ id: "u2", name: "Bob", team: { id: "team-abc-uuid-123", name: "Alpha Team" } }),
		]);

		render(<SettingsOrgChart />);

		await waitFor(() => {
			// Should show the resolved name, not the raw uuid
			expect(screen.getByText("Alpha Team")).toBeInTheDocument();
		});

		// Raw uuid must NOT appear in the rendered edge list
		expect(screen.queryByText("team-abc-uuid-123")).not.toBeInTheDocument();
	});

	it("non-team mechanism edges render target as-is (direct/function)", async () => {
		setupCall([
			mkUser({
				id: "u1",
				name: "Alice",
				edges: [{ id: "edge-2", mechanism: "function", target: "Engineering" }],
			}),
			mkUser({ id: "u2", name: "Bob" }),
		]);

		render(<SettingsOrgChart />);

		await waitFor(() => {
			expect(screen.getByText("Engineering")).toBeInTheDocument();
		});
	});

	it("empty edges state shows explanatory copy about teams not auto-creating edges", async () => {
		setupCall([mkUser({ id: "u1", name: "Alice" }), mkUser({ id: "u2", name: "Bob" })]);

		render(<SettingsOrgChart />);

		await waitFor(() => {
			expect(screen.getByText(/teams don't auto-create/i)).toBeInTheDocument();
		});
	});
});
