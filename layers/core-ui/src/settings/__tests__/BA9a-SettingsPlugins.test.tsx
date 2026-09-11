/**
 * BA9a — SettingsPlugins component DOM proof.
 *
 * Proves: install form elements present, plugin list renders name/version/scope,
 * Contributions button visible with "detached" label when a contribution has a
 * user override, contribution expand shows detached tag + restore button.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsPlugins } from "../SettingsPlugins.js";

vi.mock("../../shell/ToastRegion.js", () => ({
	useToast: () => ({ showToast: vi.fn() }),
}));

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

function setupFetch(plugins: unknown[]): void {
	vi.stubGlobal(
		"fetch",
		vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ plugins }),
		}),
	);
}

/** Routes GET /api/teams separately so the team picker has real rows to offer. */
function setupFetchWithTeams(
	plugins: unknown[],
	teams: Array<{ id: string; name: string }>,
): ReturnType<typeof vi.fn> {
	const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
		const url = typeof input === "string" ? input : input.toString();
		if (url.includes("/api/teams")) {
			return { ok: true, json: async () => ({ teams }) };
		}
		if (url.includes("/api/plugins") && !url.includes("POST")) {
			return { ok: true, json: async () => ({ plugins }) };
		}
		return { ok: true, json: async () => ({ plugins }) };
	});
	vi.stubGlobal("fetch", fetchSpy);
	return fetchSpy;
}

describe("SettingsPlugins", () => {
	afterEach(() => vi.restoreAllMocks());

	describe("install form", () => {
		beforeEach(() => setupFetch([]));

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

		it("picks a team through the combobox and installs with that team's id", async () => {
			const user = userEvent.setup();
			const fetchSpy = setupFetchWithTeams([], [{ id: "team-alpha", name: "Alpha Team" }]);
			render(<SettingsPlugins />);
			await waitFor(() => {
				expect(screen.getByTestId("plugin-scope-kind")).toBeInTheDocument();
			});

			await user.selectOptions(screen.getByTestId("plugin-scope-kind"), "team");
			await user.type(screen.getByTestId("plugin-source-value"), "https://github.com/org/plugin");

			const teamField = screen.getByTestId("plugin-scope-team-id");
			const trigger = within(teamField).getByRole("combobox");
			await user.click(trigger);
			await user.click(await screen.findByText("Alpha Team"));

			await user.click(screen.getByTestId("plugin-install-btn"));

			await waitFor(() => {
				const postCall = fetchSpy.mock.calls.find(
					([, opts]) => (opts as RequestInit | undefined)?.method === "POST",
				);
				expect(postCall).toBeDefined();
				const postOpts = postCall?.[1] as RequestInit;
				const body = JSON.parse(postOpts.body as string) as {
					scope: { kind: string; teamId: string };
				};
				expect(body.scope).toEqual({ kind: "team", teamId: "team-alpha" });
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
		beforeEach(() => setupFetch([PLUGIN_WITH_DETACHED, PLUGIN_NO_CONTRIBUTIONS]));

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
	});

	describe("detached contributions", () => {
		beforeEach(() => setupFetch([PLUGIN_WITH_DETACHED]));

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
	});
});
