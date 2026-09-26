/**
 * SettingsPlugins — an installed row a person can read: the plugin's name and
 * version, and whose install it is by the team's NAME (read from the teams
 * the page already loads through `search_users`), never a raw team id.
 */

import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { callMock } = vi.hoisted(() => ({ callMock: vi.fn() }));

vi.mock("../../services/call.js", () => ({ call: callMock }));

vi.mock("../../shell/ToastRegion.js", () => ({
	useToast: () => ({ showToast: vi.fn() }),
}));

import { SettingsPlugins } from "../SettingsPlugins.js";

const TEAM_ID = "team-ad503683-56e0-487b-b67d-6dccd4a595b4";

const TEAM_INSTALL = {
	id: `role-personas@${TEAM_ID}`,
	name: "role-personas",
	version: "1.0.0",
	state: "enabled",
	scope: { kind: "team", teamId: TEAM_ID },
	installedAt: "2026-09-25T00:00:00.000Z",
	updatedAt: "2026-09-25T00:00:00.000Z",
	disabledAt: null,
	contributions: [
		{
			kind: "agent",
			key: "pa_builder",
			manifestKey: "pa_builder",
			entityId: "pa_builder",
			label: "Builder",
			detached: false,
		},
	],
};

const FACTORY_INSTALL = {
	...TEAM_INSTALL,
	id: "document-management",
	name: "document-management",
	scope: { kind: "factory", teamId: null },
};

function setupCall(listing: unknown[]): void {
	callMock.mockImplementation((name: string) => {
		if (name === "search_plugins") return Promise.resolve({ ok: true, data: listing });
		if (name === "search_users") {
			return Promise.resolve({
				ok: true,
				data: [{ id: "u-ada", name: "Ada", team: { id: TEAM_ID, name: "My Team" } }],
			});
		}
		if (name === "search_tasks") return Promise.resolve({ ok: true, data: [] });
		return Promise.resolve({ ok: true, data: listing[0] });
	});
}

describe("SettingsPlugins — an installed row", () => {
	afterEach(() => {
		callMock.mockReset();
	});

	it("shows a team install's name, version and team name, never the team id", async () => {
		setupCall([TEAM_INSTALL]);
		render(<SettingsPlugins />);

		const row = await screen.findByTestId(`plugin-row-role-personas@${TEAM_ID}`);
		expect(within(row).getByText("role-personas")).toBeInTheDocument();
		expect(within(row).getByText("v1.0.0")).toBeInTheDocument();
		expect(await within(row).findByText(/My Team/)).toBeInTheDocument();
		expect(row.textContent).not.toContain(TEAM_ID);
	});

	it("says a factory install is for everyone", async () => {
		setupCall([FACTORY_INSTALL]);
		render(<SettingsPlugins />);

		const row = await screen.findByTestId("plugin-row-document-management");
		expect(within(row).getByText("document-management")).toBeInTheDocument();
		expect(within(row).getByText(/everyone/i)).toBeInTheDocument();
	});
});
