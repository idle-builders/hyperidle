/**
 * AH4 — Component tests: SettingsAgents team placement picker.
 *
 * AC2: The SettingsAgents add form renders a Team Select populated from
 *      GET /api/org; the POST body includes the selected teamId.
 *
 * @lore BC5 T9: the door swap — `call` mocked at the door, `search_users`/
 * `open_user`/`edit_user` replace `/api/agents`, `/api/harnesses`, `/api/org`.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsAgents } from "../settings/SettingsAgents";
import { ToastRegion } from "../shell/ToastRegion";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

const { callMock } = vi.hoisted(() => ({ callMock: vi.fn() }));
vi.mock("../services/call.js", () => ({ call: callMock }));

function setupCall(): void {
	callMock.mockImplementation((name: string, input: Record<string, unknown>) => {
		if (name === "search_sessions") return Promise.resolve({ ok: true, data: [] });
		if (name === "search_users") return Promise.resolve({ ok: true, data: [] });
		if (name === "open_user") {
			const id = input.id as string | undefined;
			return Promise.resolve({
				ok: true,
				data: {
					user:
						id === undefined
							? { id: "self", team: { id: "team-alpha", name: "Alpha Team" } }
							: null,
					runsOn: [{ type: "opencode", name: "OpenCode", modelProviders: ["anthropic"] }],
					runConfig: null,
					documentIds: [],
					folders: [],
					subscriptions: [],
					connections: null,
					inbox: null,
				},
			});
		}
		return Promise.resolve({ ok: false, problems: [{ code: "unmocked", message: name }] });
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
	beforeEach(() => {
		callMock.mockReset();
		setupCall();
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
