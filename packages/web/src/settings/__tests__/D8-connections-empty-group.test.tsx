/**
 * D8 (POLISH-060) — SettingsConnections: empty groups are hidden, not bare grey boxes.
 *
 * AC: empty source groups (inherited/token/mcp) do not render a bare empty list;
 * groups with zero connections are fully hidden.
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

import { SettingsConnections } from "../SettingsConnections.js";

const INHERITED_GITHUB = {
	id: "inherited:claude-code:github",
	service: "GitHub",
	via: "claude-code · gh CLI",
	authSource: "inherited" as const,
	health: "working" as const,
	removable: false,
};

describe("D8 — SettingsConnections empty groups are hidden", () => {
	let apiFetch: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		const module = await import("../../services/api-fetch.js");
		apiFetch = module.apiFetch as ReturnType<typeof vi.fn>;
		mockShowToast.mockClear();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("empty token and mcp groups are not rendered when zero connections", async () => {
		// Only inherited connection — token and mcp groups are empty
		apiFetch.mockResolvedValue({
			ok: true,
			json: () => Promise.resolve([INHERITED_GITHUB]),
		});

		render(<SettingsConnections />);

		await waitFor(() => {
			expect(screen.getByText("GitHub")).toBeInTheDocument();
		});

		// The inherited group renders (has a connection)
		expect(screen.getByText(/inherited/i)).toBeInTheDocument();

		// Token and MCP group headers must NOT be rendered (groups hidden when empty)
		// The labels from SettingsConnections are "Tokens" / "API Keys" and "MCP"
		// Check that neither empty section header appears
		const tokenHeader = screen.queryByText(/api keys|tokens/i);
		const mcpHeader = screen.queryByText(/^mcp$/i);
		// If they appear, they should have content (no bare empty list)
		// The simplest assertion: no aria-label from an empty ItemList's wrapper
		// With D8 fix, empty groups return null entirely
		expect(tokenHeader).toBeNull();
		expect(mcpHeader).toBeNull();
	});

	it("all-empty state (no connections): no source group sections rendered", async () => {
		apiFetch.mockResolvedValue({
			ok: true,
			json: () => Promise.resolve([]),
		});

		render(<SettingsConnections />);

		await waitFor(() => {
			// Wait for load to complete — the add button should be present
			expect(screen.getByRole("button", { name: /add connection/i })).toBeInTheDocument();
		});

		// With zero connections, ALL groups are hidden — no section headers
		expect(screen.queryByText(/inherited/i)).toBeNull();
		expect(screen.queryByText(/api keys|tokens/i)).toBeNull();
		expect(screen.queryByText(/^mcp$/i)).toBeNull();
	});
});
