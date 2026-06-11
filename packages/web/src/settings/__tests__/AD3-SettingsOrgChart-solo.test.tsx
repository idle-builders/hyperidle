/**
 * AD3 — AC-2: SettingsOrgChart solo contextual message.
 *
 * When there is exactly 1 human user:
 *   - The contextual message is shown (no table, no "Add Edge" button)
 *   - Message text: "Org chart manages reporting lines between humans. Add a second human user to start defining your org structure."
 *
 * When there are 2+ human users:
 *   - The normal table / "Add Edge" button is shown
 *   - The contextual message is NOT shown
 */

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../services/api-fetch.js", () => ({
	apiFetch: vi.fn(),
}));

// Mock useToast
const mockShowToast = vi.fn();
vi.mock("../../shell/ToastRegion.js", async () => {
	const actual = await vi.importActual("../../shell/ToastRegion.js");
	return {
		...actual,
		useToast: vi.fn(() => ({ showToast: mockShowToast })),
	};
});

import { SettingsOrgChart } from "../SettingsOrgChart";

type OrgUser = { id: string; kind: string; name: string; role: string };

function makeOrgResponse(users: OrgUser[], edges: unknown[] = [], teams: unknown[] = []): Response {
	// AF15: GET /api/org now returns { edges, users, teams }
	return new Response(JSON.stringify({ edges, users, teams }), { status: 200 });
}

describe("AD3 AC-2: SettingsOrgChart — solo contextual message", () => {
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

	it("shows contextual message when there is exactly 1 human user", async () => {
		const users: OrgUser[] = [
			{ id: "u1", kind: "human", name: "Solo Founder", role: "owner" },
			{ id: "a1", kind: "agent", name: "Helper Bot", role: "agent" },
		];
		fetchSpy.mockResolvedValueOnce(makeOrgResponse(users));
		render(<SettingsOrgChart />);

		await waitFor(() => {
			expect(
				screen.getByText(
					/add a second human to define reporting lines|add a function.*describe your role/i,
				),
			).toBeInTheDocument();
		});
	});

	it("does NOT render the edge table when solo (but does render Add Edge form)", async () => {
		// AF15: Solo short-circuit relaxed. Table is still hidden (no edges), but
		// the Add Edge form/button is now shown (with guidance hint above it).
		const users: OrgUser[] = [{ id: "u1", kind: "human", name: "Solo Founder", role: "owner" }];
		fetchSpy.mockResolvedValueOnce(makeOrgResponse(users));
		render(<SettingsOrgChart />);

		await waitFor(() => {
			expect(
				screen.getByText(
					/add a second human to define reporting lines|add a function.*describe your role/i,
				),
			).toBeInTheDocument();
		});

		expect(screen.queryByRole("table")).not.toBeInTheDocument();
	});

	it("DOES render the Add Edge button when solo (AF15: solo short-circuit relaxed)", async () => {
		// AF15: The design spec relaxed solo mode — the founder must be able to create
		// function edges even as the only human. The hint is shown above the form,
		// but the form and Add Edge button are still rendered.
		const users: OrgUser[] = [{ id: "u1", kind: "human", name: "Solo Founder", role: "owner" }];
		fetchSpy.mockResolvedValueOnce(makeOrgResponse(users));
		render(<SettingsOrgChart />);

		await waitFor(() => {
			expect(
				screen.getByText(
					/add a second human to define reporting lines|add a function.*describe your role/i,
				),
			).toBeInTheDocument();
		});

		expect(screen.getByTestId("add-edge-btn")).toBeInTheDocument();
	});

	it("shows the full org chart UI when there are 2 human users", async () => {
		const users: OrgUser[] = [
			{ id: "u1", kind: "human", name: "Alice", role: "owner" },
			{ id: "u2", kind: "human", name: "Bob", role: "member" },
		];
		fetchSpy.mockResolvedValueOnce(makeOrgResponse(users));
		render(<SettingsOrgChart />);

		await waitFor(() => {
			expect(screen.getByTestId("add-edge-btn")).toBeInTheDocument();
		});

		expect(
			screen.queryByText(
				/add a second human to define reporting lines|add a function.*describe your role/i,
			),
		).not.toBeInTheDocument();
	});

	it("does NOT show solo message when org has only agents (humanCount = 0)", async () => {
		// 0 humans: show normal UI (not solo message — solo is only for === 1 human)
		const users: OrgUser[] = [{ id: "a1", kind: "agent", name: "Bot", role: "agent" }];
		fetchSpy.mockResolvedValueOnce(makeOrgResponse(users));
		render(<SettingsOrgChart />);

		await waitFor(() => {
			expect(screen.getByTestId("add-edge-btn")).toBeInTheDocument();
		});

		expect(
			screen.queryByText(
				/add a second human to define reporting lines|add a function.*describe your role/i,
			),
		).not.toBeInTheDocument();
	});
});
