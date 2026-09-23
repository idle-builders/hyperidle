/**
 * D8 (POLISH-060) — SettingsConnections: empty groups are hidden, not bare grey boxes.
 *
 * AC: empty source groups (inherited/token/mcp) do not render a bare empty list;
 * groups with zero connections are fully hidden.
 *
 * @lore BC5 T10: mocks `call` at the door (`open_user({}).connections`)
 * instead of `apiFetch`.
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

import { SettingsConnections } from "../SettingsConnections.js";

const SELF_ROW = { id: "me", kind: "human", name: "Me", team: { id: "team-1", name: "Acme" } };

function openUserData(connections: unknown[], inherited: unknown[]): Record<string, unknown> {
	return {
		user: SELF_ROW,
		runsOn: [],
		runConfig: null,
		documentIds: [],
		folders: [],
		subscriptions: [],
		connections: { connections, inherited },
		behaviour: null,
		inbox: null,
	};
}

const INHERITED_GITHUB = {
	name: "GitHub",
	kind: "cli" as const,
	source: "claude-code · gh CLI",
	health: "working" as const,
};

describe("SettingsConnections empty groups are hidden", () => {
	beforeEach(() => {
		callMock.mockReset();
		mockShowToast.mockClear();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("empty token and mcp groups are not rendered when zero connections", async () => {
		// Only an inherited connection — token and mcp groups are empty
		callMock.mockImplementation((name: string) => {
			if (name === "open_user") {
				return Promise.resolve({ ok: true, data: openUserData([], [INHERITED_GITHUB]) });
			}
			return Promise.resolve({ ok: false, problems: [{ code: "unmocked", message: name }] });
		});

		render(<SettingsConnections />);

		await waitFor(() => {
			expect(screen.getByText("GitHub")).toBeInTheDocument();
		});

		expect(screen.getByText(/inherited/i)).toBeInTheDocument();

		const tokenHeader = screen.queryByText(/api keys|tokens/i);
		const mcpHeader = screen.queryByText(/^mcp$/i);
		expect(tokenHeader).toBeNull();
		expect(mcpHeader).toBeNull();
	});

	it("all-empty state (no connections): no source group sections rendered", async () => {
		callMock.mockImplementation((name: string) => {
			if (name === "open_user") {
				return Promise.resolve({ ok: true, data: openUserData([], []) });
			}
			return Promise.resolve({ ok: false, problems: [{ code: "unmocked", message: name }] });
		});

		render(<SettingsConnections />);

		await waitFor(() => {
			expect(screen.getByRole("button", { name: /add connection/i })).toBeInTheDocument();
		});

		expect(screen.queryByText(/inherited/i)).toBeNull();
		expect(screen.queryByText(/api keys|tokens/i)).toBeNull();
		expect(screen.queryByText(/^mcp$/i)).toBeNull();
	});
});
