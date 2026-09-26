/**
 * SettingsPlugins — the plugins that ship with the app. `search_plugins`
 * answers them as `state: "available"` rows beside the installed ones; each
 * renders its name, version and description with an Install button that
 * installs it by name — a team plugin into the viewer's own team (their
 * effective team, from `open_user({})`), a factory plugin factory-wide.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const { callMock } = vi.hoisted(() => ({ callMock: vi.fn() }));

vi.mock("../../services/call.js", () => ({ call: callMock }));

vi.mock("../../shell/ToastRegion.js", () => ({
	useToast: () => ({ showToast: vi.fn() }),
}));

import { SettingsPlugins } from "../SettingsPlugins.js";

const ROLE_PERSONAS = {
	id: "role-personas",
	name: "role-personas",
	version: "1.0.0",
	description: "A team of agents with defined roles.",
	state: "available",
	installScope: "team",
};

const DOCUMENT_MANAGEMENT = {
	id: "document-management",
	name: "document-management",
	version: "1.0.0",
	description: "Document Librarian agent.",
	state: "available",
	installScope: "factory",
};

const INSTALLED = {
	id: "acme-search",
	name: "acme-search",
	version: "2.1.0",
	state: "enabled",
	scope: { kind: "factory", teamId: null },
	installedAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
	disabledAt: null,
	contributions: [],
};

function setupCall(listing: unknown[]): void {
	callMock.mockImplementation((name: string) => {
		if (name === "search_plugins") return Promise.resolve({ ok: true, data: listing });
		if (name === "open_user") {
			return Promise.resolve({
				ok: true,
				data: { user: { id: "u-ada", team: { id: "team-a", name: "Team A" } } },
			});
		}
		if (name === "search_users") return Promise.resolve({ ok: true, data: [] });
		return Promise.resolve({ ok: true, data: INSTALLED });
	});
}

describe("SettingsPlugins — available bundled plugins", () => {
	afterEach(() => {
		callMock.mockReset();
	});

	it("lists each available plugin with its description and an Install button, beside the installed ones", async () => {
		setupCall([INSTALLED, ROLE_PERSONAS, DOCUMENT_MANAGEMENT]);
		render(<SettingsPlugins />);

		const row = await screen.findByTestId("plugin-row-role-personas");
		expect(within(row).getByText("role-personas")).toBeInTheDocument();
		expect(within(row).getByText("v1.0.0")).toBeInTheDocument();
		expect(within(row).getByText("A team of agents with defined roles.")).toBeInTheDocument();
		expect(within(row).getByRole("button", { name: "Install" })).toBeInTheDocument();
		expect(screen.getByTestId("plugin-install-document-management")).toBeInTheDocument();
		// An available row is not an install: nothing to disable or remove yet.
		expect(screen.queryByTestId("plugin-toggle-role-personas")).not.toBeInTheDocument();
		expect(screen.getByTestId("plugin-toggle-acme-search")).toBeInTheDocument();
	});

	it("installs a team plugin by name into the viewer's own team", async () => {
		const user = userEvent.setup();
		setupCall([ROLE_PERSONAS]);
		render(<SettingsPlugins />);

		await user.click(await screen.findByTestId("plugin-install-role-personas"));

		await waitFor(() => {
			expect(callMock).toHaveBeenCalledWith("edit_plugin", {
				source: {
					kind: "bundled",
					name: "role-personas",
					scope: { kind: "team", teamId: "team-a" },
				},
			});
		});
		// Reloads the list after installing.
		expect(callMock.mock.calls.filter(([name]) => name === "search_plugins").length).toBe(2);
	});

	it("installs a factory plugin by name for everyone", async () => {
		const user = userEvent.setup();
		setupCall([DOCUMENT_MANAGEMENT]);
		render(<SettingsPlugins />);

		await user.click(await screen.findByTestId("plugin-install-document-management"));

		await waitFor(() => {
			expect(callMock).toHaveBeenCalledWith("edit_plugin", {
				source: {
					kind: "bundled",
					name: "document-management",
					scope: { kind: "factory", teamId: null },
				},
			});
		});
	});
});
