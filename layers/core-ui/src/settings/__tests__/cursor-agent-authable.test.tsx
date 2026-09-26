/**
 * cursor-agent is actionable when discovery reports ready/unauthenticated.
 *
 * @lore: the door swap — `open_user({}).runsOn` replaces `GET
 * /api/harnesses`; `call` is mocked at the door instead of `fetch`.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SettingsHarnesses } from "../SettingsHarnesses.js";

const { callMock } = vi.hoisted(() => ({ callMock: vi.fn() }));
vi.mock("../../services/call.js", () => ({ call: callMock }));

const CURSOR_READY_DESCRIPTOR = {
	type: "cursor-agent",
	name: "Cursor Agent",
	kind: "local",
	accessMode: "provider-subscription-cli",
	discovery: {
		state: "ready",
		version: "2026.07.09",
		reason: "Authenticated and ready.",
	},
	authAction: {
		kind: "native_cli_login",
		label: "Log in to Cursor",
		command: ["cursor-agent", "login"],
	},
	runtime: {
		preCompactionTrigger: false,
		fileEditing: true,
		toolUse: true,
		mcpSupport: false,
		subAgents: false,
		modelProviders: [],
	},
	models: [],
	modelProviders: [],
};

function mockFetch(descriptors: unknown[] = [CURSOR_READY_DESCRIPTOR]): void {
	callMock.mockReset();
	callMock.mockImplementation((name: string) => {
		if (name === "open_user") {
			return Promise.resolve({
				ok: true,
				data: {
					user: { id: "me", kind: "human", name: "Me", team: { id: "team-1", name: "Acme" } },
					runsOn: descriptors,
					runConfig: null,
					documentIds: [],
					folders: [],
					subscriptions: [],
					connections: null,
					inbox: null,
				},
			});
		}
		throw new Error(`unexpected call: ${name}`);
	});
}

describe("cursor-agent is actionable when supported", () => {
	it("renders cursor-agent row as ready with login command detail", async () => {
		mockFetch();
		const user = userEvent.setup();
		render(<SettingsHarnesses />);
		expect(await screen.findByText("Cursor Agent")).toBeInTheDocument();
		expect(screen.getByText(/authenticated and ready/i)).toBeInTheDocument();
		await user.click(screen.getByText("Cursor Agent"));
		expect(await screen.findByText("cursor-agent login")).toBeInTheDocument();
	});
});
