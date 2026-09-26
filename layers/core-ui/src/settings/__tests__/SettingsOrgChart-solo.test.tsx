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
 *
 * @lore BC5 T9: door swap — `call("search_users", {})` replaces `GET /api/org`.
 */

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { callMock } = vi.hoisted(() => ({ callMock: vi.fn() }));
vi.mock("../../services/call.js", () => ({ call: callMock }));

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

type MockUserRow = { id: string; kind: string; name: string; role: string; team: null; edges: [] };

function mkUser(overrides: Partial<MockUserRow> = {}): MockUserRow {
	return {
		id: overrides.id ?? "u1",
		kind: overrides.kind ?? "human",
		name: overrides.name ?? "User",
		role: overrides.role ?? "member",
		team: null,
		edges: [],
	};
}

function setupCall(users: MockUserRow[]): void {
	callMock.mockImplementation((name: string) => {
		if (name === "search_users") return Promise.resolve({ ok: true, data: users });
		return Promise.resolve({ ok: false, problems: [{ code: "unmocked", message: name }] });
	});
}

describe("SettingsOrgChart — solo contextual message", () => {
	beforeEach(() => {
		callMock.mockReset();
		mockShowToast.mockClear();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("shows contextual message when there is exactly 1 human user", async () => {
		setupCall([
			mkUser({ id: "u1", kind: "human", name: "Solo Founder", role: "owner" }),
			mkUser({ id: "a1", kind: "ai", name: "Helper Bot", role: "agent" }),
		]);
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
		setupCall([mkUser({ id: "u1", kind: "human", name: "Solo Founder", role: "owner" })]);
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
		setupCall([mkUser({ id: "u1", kind: "human", name: "Solo Founder", role: "owner" })]);
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
		setupCall([
			mkUser({ id: "u1", kind: "human", name: "Alice", role: "owner" }),
			mkUser({ id: "u2", kind: "human", name: "Bob", role: "member" }),
		]);
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
		setupCall([mkUser({ id: "a1", kind: "ai", name: "Bot", role: "agent" })]);
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
