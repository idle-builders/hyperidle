/**
 * BA9a — SettingsPlugins component DOM proof.
 *
 * Proves: install form elements present, plugin list renders name/version/scope,
 * Contributions button visible with "detached" label when a contribution has a
 * user override, contribution expand shows detached tag + restore button.
 *
 * @lore The five raw `apiFetch("/api/plugins…")` calls this page used to
 * make are gone — `call("search_plugins", …)`/`call("edit_plugin", …)` is the
 * one door now, so `call` is mocked directly (the same idiom
 * `ScopeChangeDialog`'s and `SettingsSkillsAndRules`' own tests use).
 * `useTeams` still reads `GET /api/teams` through plain `fetch` — untouched by
 * this door swap — so the team-picker test keeps its own `fetch` stub.
 */

import { render, screen, waitFor } from "@testing-library/react";
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
			kind: "skill",
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

/** `search_plugins` always resolves to `plugins`; `edit_plugin` resolves `ok: true` with the first plugin unless a caller overrides it. */
function setupCall(plugins: unknown[]): void {
	callMock.mockImplementation((name: string) => {
		if (name === "search_plugins") return Promise.resolve({ ok: true, data: plugins });
		return Promise.resolve({ ok: true, data: plugins[0] ?? PLUGIN_WITH_DETACHED });
	});
}

/** `useTeams` reads `GET /api/teams` through plain `fetch` — a separate door. */
function setupTeamsFetch(teams: Array<{ id: string; name: string }>): void {
	vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ teams }) }));
}

describe("SettingsPlugins", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		callMock.mockReset();
	});

	describe("install form", () => {
		beforeEach(() => {
			setupCall([]);
			setupTeamsFetch([]);
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
			setupTeamsFetch([{ id: "team-alpha", name: "Alpha Team" }]);
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
			setupTeamsFetch([]);
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

		it("shows scope label for factory and team scope", async () => {
			render(<SettingsPlugins />);
			await waitFor(() => {
				expect(screen.getByTestId("plugins-list")).toBeInTheDocument();
			});
			// Team scope
			expect(screen.getByText("Team: team-sales")).toBeInTheDocument();
			// Factory scope
			expect(screen.getByText("Factory")).toBeInTheDocument();
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
			setupTeamsFetch([]);
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
