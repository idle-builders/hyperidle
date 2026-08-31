/**
 * AH4 — Component tests: SettingsAgents team placement picker.
 *
 * AC2: The SettingsAgents add form renders a Team Select populated from
 *      GET /api/org; the POST body includes the selected teamId.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsAgents } from "../settings/SettingsAgents";
import { ToastRegion } from "../shell/ToastRegion";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

const TEAM_ID = "tm-alpha";
const TEAM_NAME = "Alpha Team";

function mockFetch(
	teams: { id: string; name: string }[] = [{ id: TEAM_ID, name: TEAM_NAME }],
): ReturnType<typeof vi.fn> {
	return vi.fn().mockImplementation((url: string) => {
		const urlStr = String(url);
		if (urlStr.includes("/api/agents")) {
			return Promise.resolve({
				ok: true,
				status: 200,
				json: async () => [],
			});
		}
		if (urlStr.includes("/api/harnesses")) {
			return Promise.resolve({
				ok: true,
				status: 200,
				json: async () => [{ type: "opencode", name: "OpenCode", modelProviders: ["anthropic"] }],
			});
		}
		if (urlStr.includes("/api/org")) {
			return Promise.resolve({
				ok: true,
				status: 200,
				json: async () => ({ edges: [], users: [], teams }),
			});
		}
		return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
	});
}

function renderSettingsAgents(): ReturnType<typeof render> {
	return render(
		<ToastRegion>
			<SettingsAgents />
		</ToastRegion>,
	);
}

describe("AH4 AC2 — SettingsAgents add form", () => {
	// AV2: Team picker moved out of Add Agent form — AgentEditor is used instead.
	// Tests updated to match the new Add Agent flow (AgentEditor inline form).
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		fetchMock = mockFetch();
		vi.stubGlobal("fetch", fetchMock);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("renders Add Agent button after loading", async () => {
		renderSettingsAgents();
		await waitFor(() => {
			expect(screen.getByRole("button", { name: /add agent/i })).toBeInTheDocument();
		});
	});

	it("clicking Add Agent opens the AgentEditor inline form with a Name field", async () => {
		const user = userEvent.setup();
		renderSettingsAgents();

		await waitFor(() => {
			expect(screen.getByRole("button", { name: /add agent/i })).toBeInTheDocument();
		});

		await user.click(screen.getByRole("button", { name: /add agent/i }));

		// AgentEditor renders with a Name textbox
		await waitFor(() => {
			expect(screen.getByRole("textbox", { name: /name/i })).toBeInTheDocument();
		});
	});
});
