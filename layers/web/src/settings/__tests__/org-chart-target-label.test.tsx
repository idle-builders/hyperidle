/**
 * D4 (POLISH-060) — SettingsOrgChart: team edges resolve team name, not raw uuid.
 *
 * AC:
 *   1. A "team" mechanism edge renders the team NAME (not "team-<uuid>").
 *   2. Empty edges state has explanatory copy about teams not auto-creating edges.
 */

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../services/api-fetch.js", () => ({
	apiFetch: vi.fn(),
}));

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

describe("OrgChart team edge renders team name not raw id", () => {
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

	it("renders team name instead of raw team id for team-mechanism edges", async () => {
		fetchSpy.mockResolvedValue(
			makeOrgResponse(
				[
					{ id: "u1", kind: "human", name: "Alice", role: "founder" },
					{ id: "u2", kind: "human", name: "Bob", role: "engineer" },
				],
				[
					{
						id: "edge-1",
						fromUserId: "u1",
						mechanism: "team",
						target: "team-abc-uuid-123",
						createdAt: "2026-01-01T00:00:00.000Z",
					},
				],
				[{ id: "team-abc-uuid-123", name: "Alpha Team" }],
			),
		);

		render(<SettingsOrgChart />);

		await waitFor(() => {
			// Should show the resolved name, not the raw uuid
			expect(screen.getByText("Alpha Team")).toBeInTheDocument();
		});

		// Raw uuid must NOT appear in the rendered edge list
		expect(screen.queryByText("team-abc-uuid-123")).not.toBeInTheDocument();
	});

	it("non-team mechanism edges render target as-is (direct/function)", async () => {
		fetchSpy.mockResolvedValue(
			makeOrgResponse(
				[
					{ id: "u1", kind: "human", name: "Alice", role: "founder" },
					{ id: "u2", kind: "human", name: "Bob", role: "engineer" },
				],
				[
					{
						id: "edge-2",
						fromUserId: "u1",
						mechanism: "function",
						target: "Engineering",
						createdAt: "2026-01-01T00:00:00.000Z",
					},
				],
				[],
			),
		);

		render(<SettingsOrgChart />);

		await waitFor(() => {
			expect(screen.getByText("Engineering")).toBeInTheDocument();
		});
	});

	it("empty edges state shows explanatory copy about teams not auto-creating edges", async () => {
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
			// The empty state should mention that teams don't auto-create edges
			expect(screen.getByText(/teams don't auto-create/i)).toBeInTheDocument();
		});
	});
});
