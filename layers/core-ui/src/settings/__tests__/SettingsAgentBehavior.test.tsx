/**
 * SettingsAgentBehavior reads/writes the caller's behaviour off
 * `open_user`/`edit_user`.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsAgentBehavior } from "../SettingsAgentBehavior.js";

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

afterEach(() => {
	vi.restoreAllMocks();
});

const SELF_ROW = { id: "me", kind: "human", name: "Me", team: { id: "team-1", name: "Acme" } };

const AGENT_ITEM = {
	id: "agent:agent.ast-founder",
	kind: "agent" as const,
	name: "Assistant",
	origin: { type: "builtin" as const, label: "Built-in HyperIdle", state: "enabled" as const },
	valueSource: "default" as const,
	active: true,
	activeSummary: "assistant · opencode harness",
	statusLabel: "Default",
	editableFields: [{ id: "name", label: "Name", kind: "text" as const, value: "Assistant" }],
};

function openUserData(items: unknown[]): Record<string, unknown> {
	return {
		user: SELF_ROW,
		runsOn: [],
		runConfig: null,
		documentIds: [],
		folders: [],
		subscriptions: [],
		connections: null,
		behaviour: items,
		inbox: null,
	};
}

describe("SettingsAgentBehavior", () => {
	it("calls open_user and renders the caller's behaviour entries", async () => {
		callMock.mockReset();
		callMock.mockImplementation((name: string) => {
			if (name === "open_user") {
				return Promise.resolve({ ok: true, data: openUserData([AGENT_ITEM]) });
			}
			return Promise.resolve({ ok: false, problems: [{ code: "unmocked", message: name }] });
		});

		render(<SettingsAgentBehavior />);

		await waitFor(() => {
			expect(screen.getByText("Assistant")).toBeInTheDocument();
		});
		expect(callMock).toHaveBeenCalledWith("open_user", {});
	});

	it("saves an edit through edit_user({ id: me, behaviour })", async () => {
		callMock.mockReset();
		callMock.mockImplementation((name: string) => {
			if (name === "open_user") {
				return Promise.resolve({ ok: true, data: openUserData([AGENT_ITEM]) });
			}
			if (name === "edit_user") {
				return Promise.resolve({
					ok: true,
					data: openUserData([{ ...AGENT_ITEM, activeSummary: "Founder Assistant · opencode" }]),
				});
			}
			return Promise.resolve({ ok: false, problems: [{ code: "unmocked", message: name }] });
		});

		const user = userEvent.setup();
		render(<SettingsAgentBehavior />);

		await waitFor(() => screen.getByText("Assistant"));
		await user.click(screen.getByText("Assistant"));
		await user.click(screen.getByRole("button", { name: "Edit agent behavior" }));
		await user.click(screen.getByRole("button", { name: /save/i }));

		await waitFor(() => {
			expect(callMock).toHaveBeenCalledWith("edit_user", {
				id: "me",
				behaviour: [{ id: AGENT_ITEM.id, fields: { name: "Assistant" } }],
			});
		});
		await waitFor(() => {
			expect(screen.getAllByText(/Founder Assistant · opencode/).length).toBeGreaterThan(0);
		});
	});

	it("renders an error state when open_user fails", async () => {
		callMock.mockReset();
		callMock.mockResolvedValue({ ok: false, problems: [{ code: "server_error", message: "no" }] });

		render(<SettingsAgentBehavior />);

		await waitFor(() => {
			expect(screen.getByText(/couldn't load agent behavior/i)).toBeInTheDocument();
		});
	});
});
