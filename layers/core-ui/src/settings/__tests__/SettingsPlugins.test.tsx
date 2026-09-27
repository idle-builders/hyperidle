/**
 * BA9a — SettingsPlugins component DOM proof.
 *
 * Proves: install form elements present, plugin list renders name/version/scope,
 * Contributions button visible with "detached" label when a contribution has a
 * user override, contribution expand shows detached tag + restore button.
 *
 * @lore The five raw `apiFetch("/api/plugins…")` calls this page used to make are gone — `call("search_plugins", …)`/`call("edit_plugin", …)` is the one door now, so `call` is mocked directly (the same idiom `ScopeChangeDialog`'s and `SettingsSkillsAndRules`' own tests use).
 *
 * @lore door-swap: `useTeams` no longer reads `GET /api/teams` — deleted with the `teams` route family — it derives teams from `search_users({})` (the distinct `team` each row carries) plus a per-team `search_tasks` call for the blocked/in-progress signal. The team-picker test drives that through the same `callMock`, not a separate `fetch` stub.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { callMock } = vi.hoisted(() => ({ callMock: vi.fn() }));

vi.mock("../../services/call.js", () => ({ call: callMock }));

vi.mock("../../shell/ToastRegion.js", () => ({
	useToast: () => ({ showToast: vi.fn() }),
}));

import { SettingsPlugins } from "../SettingsPlugins.js";

const PLUGIN_WITH_DETACHED = {
	id: "acme-crm",
	name: "acme-crm",
	version: "1.0.4",
	state: "enabled",
	scope: { kind: "team", teamId: "team-sales" },
	installedAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
	disabledAt: null,
	contributions: [
		{
			kind: "agent",
			key: "acme-crm/crm-agent",
			manifestKey: "crm-agent",
			entityId: "acme-crm/crm-agent",
			label: "crm-agent",
			detached: true,
		},
		{
			kind: "document",
			key: "acme-crm/lookup-contact",
			manifestKey: "lookup-contact",
			entityId: "acme-crm/lookup-contact",
			label: "lookup-contact",
			detached: false,
		},
	],
};

const PLUGIN_NO_CONTRIBUTIONS = {
	id: "acme-search",
	name: "acme-search",
	version: "2.1.0",
	state: "disabled",
	scope: { kind: "factory", teamId: null },
	installedAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
	disabledAt: "2026-01-02T00:00:00.000Z",
	contributions: [],
};

/**
 * `search_plugins` always resolves to `plugins`; `edit_plugin` resolves `ok: true`
 * with the first plugin unless a caller overrides it. `search_users` resolves to
 * `teamUsers` (one row per team is enough — `useTeams` derives the distinct set)
 * and `search_tasks` resolves empty, so `useTeams` settles every team `healthy`.
 */
function setupCall(
	plugins: unknown[],
	teamUsers: ReadonlyArray<{ id: string; name: string; team: { id: string; name: string } }> = [],
): void {
	callMock.mockImplementation((name: string) => {
		if (name === "search_plugins") return Promise.resolve({ ok: true, data: plugins });
		if (name === "search_users") return Promise.resolve({ ok: true, data: teamUsers });
		if (name === "search_tasks") return Promise.resolve({ ok: true, data: [] });
		return Promise.resolve({ ok: true, data: plugins[0] ?? PLUGIN_WITH_DETACHED });
	});
}

afterEach(() => {
	vi.restoreAllMocks();
	callMock.mockReset();
});

describe("SettingsPlugins", () => {
	describe("install form", () => {
		beforeEach(() => {
			setupCall([]);
		});

		it("renders source type select, URL input, scope select, and install button", async () => {
			render(<SettingsPlugins />);
			// Wait past loading state
			await waitFor(() => {
				expect(screen.getByTestId("plugin-install-form")).toBeInTheDocument();
			});
			expect(screen.getByTestId("plugin-source-kind")).toBeInTheDocument();
			expect(screen.getByTestId("plugin-source-value")).toBeInTheDocument();
			expect(screen.getByTestId("plugin-scope-kind")).toBeInTheDocument();
			expect(screen.getByTestId("plugin-install-btn")).toBeInTheDocument();
		});

		it("shows team ID input when scope is set to team", async () => {
			const user = userEvent.setup();
			render(<SettingsPlugins />);
			await waitFor(() => {
				expect(screen.getByTestId("plugin-scope-kind")).toBeInTheDocument();
			});
			const scopeSelect = screen.getByTestId("plugin-scope-kind");
			await user.selectOptions(scopeSelect, "team");
			expect(screen.getByTestId("plugin-scope-team-id")).toBeInTheDocument();
		});

		it("picks a team through the combobox and installs with that team's id nested in source", async () => {
			const user = userEvent.setup();
			setupCall(
				[],
				[{ id: "u-alpha", name: "Alice", team: { id: "team-alpha", name: "Alpha Team" } }],
			);
			render(<SettingsPlugins />);
			await waitFor(() => {
				expect(screen.getByTestId("plugin-scope-kind")).toBeInTheDocument();
			});

			await user.selectOptions(screen.getByTestId("plugin-scope-kind"), "team");
			await user.type(screen.getByTestId("plugin-source-value"), "https://github.com/org/plugin");

			const trigger = screen.getByRole("combobox", { name: "Team" });
			await user.click(trigger);
			await user.click(await screen.findByText("Alpha Team"));

			await user.click(screen.getByTestId("plugin-install-btn"));

			await waitFor(() => {
				const editCall = callMock.mock.calls.find(([name]) => name === "edit_plugin");
				expect(editCall).toBeDefined();
				const input = editCall?.[1] as {
					source: { kind: string; url: string; scope: { kind: string; teamId: string } };
				};
				expect(input.source).toEqual({
					kind: "git",
					url: "https://github.com/org/plugin",
					scope: { kind: "team", teamId: "team-alpha" },
				});
			});
		});

		it("renders empty state when no plugins installed", async () => {
			render(<SettingsPlugins />);
			await waitFor(() => {
				expect(screen.getByTestId("plugins-empty")).toBeInTheDocument();
			});
		});
	});

	describe("plugin list", () => {
		beforeEach(() => {
			setupCall([PLUGIN_WITH_DETACHED, PLUGIN_NO_CONTRIBUTIONS]);
		});

		it("renders a row per installed plugin", async () => {
			render(<SettingsPlugins />);
			await waitFor(() => {
				expect(screen.getByTestId("plugins-list")).toBeInTheDocument();
			});
			expect(screen.getByTestId("plugin-row-acme-crm")).toBeInTheDocument();
			expect(screen.getByTestId("plugin-row-acme-search")).toBeInTheDocument();
		});

		it("shows plugin name and version in each row", async () => {
			render(<SettingsPlugins />);
			await waitFor(() => {
				expect(screen.getByTestId("plugin-row-acme-crm")).toBeInTheDocument();
			});
			const crmRow = screen.getByTestId("plugin-row-acme-crm");
			expect(crmRow.textContent).toContain("acme-crm");
			expect(crmRow.textContent).toContain("v1.0.4");
		});

		it("shows disable/enable toggle and remove buttons per plugin", async () => {
			render(<SettingsPlugins />);
			await waitFor(() => {
				expect(screen.getByTestId("plugin-toggle-acme-crm")).toBeInTheDocument();
			});
			// acme-crm is enabled → shows Disable
			expect(screen.getByTestId("plugin-toggle-acme-crm").textContent).toBe("Disable");
			// acme-search is disabled → shows Enable
			expect(screen.getByTestId("plugin-toggle-acme-search").textContent).toBe("Enable");
			expect(screen.getByTestId("plugin-remove-acme-crm")).toBeInTheDocument();
		});

		it("disabling a plugin calls edit_plugin with id and the opposite state", async () => {
			const user = userEvent.setup();
			render(<SettingsPlugins />);
			await waitFor(() => {
				expect(screen.getByTestId("plugin-toggle-acme-crm")).toBeInTheDocument();
			});
			await user.click(screen.getByTestId("plugin-toggle-acme-crm"));
			await waitFor(() => {
				expect(callMock).toHaveBeenCalledWith("edit_plugin", { id: "acme-crm", state: "disabled" });
			});
		});

		it("removing a plugin calls edit_plugin with id and remove: true", async () => {
			const user = userEvent.setup();
			render(<SettingsPlugins />);
			await waitFor(() => {
				expect(screen.getByTestId("plugin-remove-acme-crm")).toBeInTheDocument();
			});
			await user.click(screen.getByTestId("plugin-remove-acme-crm"));
			await waitFor(() => {
				expect(callMock).toHaveBeenCalledWith("edit_plugin", { id: "acme-crm", remove: true });
			});
		});
	});

	describe("detached contributions", () => {
		beforeEach(() => {
			setupCall([PLUGIN_WITH_DETACHED]);
		});

		it("shows Contributions button with detached hint when any contribution is detached", async () => {
			render(<SettingsPlugins />);
			await waitFor(() => {
				expect(screen.getByTestId("plugin-expand-acme-crm")).toBeInTheDocument();
			});
			const expandBtn = screen.getByTestId("plugin-expand-acme-crm");
			expect(expandBtn.textContent).toMatch(/Contributions.*detached/i);
		});

		it("expands to show contribution keys, kinds, detached tag, and restore button", async () => {
			const user = userEvent.setup();
			render(<SettingsPlugins />);
			await waitFor(() => {
				expect(screen.getByTestId("plugin-expand-acme-crm")).toBeInTheDocument();
			});
			await user.click(screen.getByTestId("plugin-expand-acme-crm"));
			await waitFor(() => {
				expect(screen.getByTestId("plugin-contributions-acme-crm")).toBeInTheDocument();
			});
			const list = screen.getByTestId("plugin-contributions-acme-crm");
			// contribution manifestKey present
			expect(list.textContent).toContain("crm-agent");
			// kind label present
			expect(list.textContent).toContain("agent");
			// detached contribution shows tag text
			expect(screen.getByText("detached")).toBeInTheDocument();
			// restore button present for the detached contribution
			expect(screen.getByTestId("btn-restore-acme-crm/crm-agent")).toBeInTheDocument();
		});

		it("non-detached contributions do not show restore button", async () => {
			const user = userEvent.setup();
			render(<SettingsPlugins />);
			await waitFor(() => {
				expect(screen.getByTestId("plugin-expand-acme-crm")).toBeInTheDocument();
			});
			await user.click(screen.getByTestId("plugin-expand-acme-crm"));
			await waitFor(() => {
				expect(screen.getByTestId("plugin-contributions-acme-crm")).toBeInTheDocument();
			});
			// lookup-contact is not detached — no restore button for it
			expect(screen.queryByTestId("btn-restore-acme-crm/lookup-contact")).not.toBeInTheDocument();
		});

		it("restoring a contribution calls edit_plugin with id and the contribution's key", async () => {
			const user = userEvent.setup();
			render(<SettingsPlugins />);
			await waitFor(() => {
				expect(screen.getByTestId("plugin-expand-acme-crm")).toBeInTheDocument();
			});
			await user.click(screen.getByTestId("plugin-expand-acme-crm"));
			await user.click(await screen.findByTestId("btn-restore-acme-crm/crm-agent"));
			await waitFor(() => {
				expect(callMock).toHaveBeenCalledWith("edit_plugin", {
					id: "acme-crm",
					restore: { contribution: "acme-crm/crm-agent" },
				});
			});
		});
	});
});

// ---------------------------------------------------------------------------
// Available bundled plugins
// ---------------------------------------------------------------------------

describe("SettingsPlugins — available bundled plugins", () => {
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

	const INSTALLED_BUNDLED = {
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

	function setupAvailableCall(listing: unknown[]): void {
		callMock.mockImplementation((name: string) => {
			if (name === "search_plugins") return Promise.resolve({ ok: true, data: listing });
			if (name === "open_user") {
				return Promise.resolve({
					ok: true,
					data: { user: { id: "u-ada", team: { id: "team-a", name: "Team A" } } },
				});
			}
			if (name === "search_users") return Promise.resolve({ ok: true, data: [] });
			return Promise.resolve({ ok: true, data: INSTALLED_BUNDLED });
		});
	}

	it("lists each available plugin with its description and an Install button, beside the installed ones", async () => {
		setupAvailableCall([INSTALLED_BUNDLED, ROLE_PERSONAS, DOCUMENT_MANAGEMENT]);
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
		setupAvailableCall([ROLE_PERSONAS]);
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
		setupAvailableCall([DOCUMENT_MANAGEMENT]);
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

// ---------------------------------------------------------------------------
// An installed row a person can read
// ---------------------------------------------------------------------------

describe("SettingsPlugins — an installed row a person can read", () => {
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

	function setupRowCall(listing: unknown[]): void {
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

	it("shows a team install's name, version and team name, never the raw team id", async () => {
		setupRowCall([TEAM_INSTALL]);
		render(<SettingsPlugins />);

		const row = await screen.findByTestId(`plugin-row-role-personas@${TEAM_ID}`);
		expect(within(row).getByText("role-personas")).toBeInTheDocument();
		expect(within(row).getByText("v1.0.0")).toBeInTheDocument();
		expect(await within(row).findByText(/My Team/)).toBeInTheDocument();
		expect(row.textContent).not.toContain(TEAM_ID);
	});

	it("says a factory install is for everyone", async () => {
		setupRowCall([FACTORY_INSTALL]);
		render(<SettingsPlugins />);

		const row = await screen.findByTestId("plugin-row-document-management");
		expect(within(row).getByText("document-management")).toBeInTheDocument();
		expect(within(row).getByText(/everyone/i)).toBeInTheDocument();
	});
});
