/**
 * BA1 D10: the trigger-rule entity retires. This file's fixtures and
 * assertions were built entirely around three `kind:"trigger"` items
 * (`trigger.daily-product-scan`, `trigger.growth-digest`,
 * `fallback.default`); all three are deleted here, not carried forward
 * under a different kind. The "plugin disabled" state-label coverage
 * `trigger.growth-digest` used to provide is preserved by adding a `tool`
 * item owned by the same disabled plugin instead.
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SETTINGS_SECTIONS } from "../../settings/settings-types.js";
import { SettingsPage } from "../SettingsPage.js";

vi.mock("../../hooks/useCurrentUser", () => ({
	useCurrentUser: () => ({
		user: { id: "u-founder", name: "Test Founder", email: "test@example.com", avatarUrl: null },
		status: "ready",
		error: null,
	}),
}));

vi.mock("../../hooks/useTeams", () => ({
	useTeams: () => ({
		data: {
			teams: [{ id: "team-product", name: "Product" }],
			users: [{ id: "u-founder", name: "Test Founder", kind: "human", role: "founder" }],
			edges: [],
		},
		loading: false,
		error: null,
	}),
}));

vi.mock("../../hooks/useTheme", () => ({
	useTheme: () => ({ theme: "dark", setTheme: vi.fn() }),
}));

vi.mock("../../shell/ToastRegion", () => ({
	useToast: () => ({ showToast: vi.fn() }),
	ToastContext: { Provider: ({ children }: { children: React.ReactNode }) => children },
}));

const AGENT_BEHAVIOR_ITEMS = [
	{
		id: "tool:tool.legacy_report",
		kind: "tool",
		name: "Legacy report",
		origin: { type: "plugin", label: "Legacy Ops plugin", state: "removed" },
		valueSource: "default",
		active: false,
		activeSummary: "Default no longer applies.",
		statusLabel: "Needs attention: origin removed",
		editableFields: [],
	},
	// Preserves the "plugin disabled" state-label coverage the deleted
	// `trigger.growth-digest` fixture used to provide.
	{
		id: "tool:tool.growth_digest",
		kind: "tool",
		name: "Growth digest",
		origin: { type: "plugin", label: "Growth plugin", state: "disabled" },
		valueSource: "default",
		active: false,
		activeSummary: "Summarize growth metrics.",
		statusLabel: "Inactive: plugin disabled",
		editableFields: [{ id: "enabled", label: "Enabled", kind: "toggle", value: true }],
	},
	{
		id: "agent:agent.ast-founder",
		kind: "agent",
		name: "Assistant",
		origin: { type: "builtin", label: "Built-in HyperIdle", state: "enabled" },
		valueSource: "default",
		active: true,
		activeSummary: "assistant · opencode harness",
		statusLabel: "Default",
		editableFields: [{ id: "name", label: "Name", kind: "text", value: "Assistant" }],
		links: [{ target: "settings-agents", label: "Open Agents", href: "#settings-section-agents" }],
	},
	{
		id: "skill:skill.ast-founder.create-bet",
		kind: "skill",
		name: "Create bet",
		origin: { type: "builtin", label: "Built-in HyperIdle", state: "enabled" },
		valueSource: "default",
		active: true,
		activeSummary: "autonomy level 3",
		statusLabel: "Built-in",
		editableFields: [],
	},
	{
		id: "subscription:subscription.daily-product-scan",
		kind: "subscription",
		name: "Daily product scan",
		origin: { type: "builtin", label: "Built-in HyperIdle", state: "enabled" },
		valueSource: "default",
		active: true,
		activeSummary: "calendar · Product Manager",
		statusLabel: "Default",
		editableFields: [],
		links: [
			{
				target: "settings-notifications",
				label: "Open Notifications",
				href: "#settings-section-notifications",
			},
		],
	},
	{
		id: "mcp:mcp_server.figma",
		kind: "mcp",
		name: "Figma",
		origin: { type: "builtin", label: "Built-in HyperIdle", state: "enabled" },
		valueSource: "default",
		active: true,
		activeSummary: "https://mcp.figma.example/sse",
		statusLabel: "Default",
		editableFields: [],
		links: [
			{
				target: "settings-connections",
				label: "Open Connections",
				href: "#settings-section-connections",
			},
		],
	},
];

const SELF_ROW = {
	id: "u-founder",
	kind: "human",
	name: "Test Founder",
	role: "founder",
	status: "active",
	team: { id: "team-product", name: "Product" },
};

/** The full `open_user({})` self-view shape every re-pointed Settings section reads from. */
function openUserData(behaviour: typeof AGENT_BEHAVIOR_ITEMS): Record<string, unknown> {
	return {
		user: SELF_ROW,
		runsOn: [],
		runConfig: null,
		documentIds: [],
		folders: [],
		subscriptions: [],
		connections: { connections: [], inherited: [] },
		behaviour,
		inbox: [],
	};
}

function setupFetch(): void {
	// @lore BC5 T11: SettingsAgentBehavior (and every other re-pointed
	// section this page mounts alongside it — Profile/OrgChart/Agents/
	// Filesystems/Harnesses/Connections) reads/writes through the actions
	// door now (`open_user`/`edit_user`), not the deleted
	// `/api/settings/agent-behavior/config` route.
	let behaviour = AGENT_BEHAVIOR_ITEMS;
	vi.stubGlobal(
		"fetch",
		vi.fn().mockImplementation((url: string, init?: RequestInit) => {
			const urlStr = String(url);
			if (urlStr.includes("/api/actions/open_user")) {
				return Promise.resolve({
					ok: true,
					status: 200,
					json: async () => ({ ok: true, data: openUserData(behaviour) }),
				});
			}
			if (urlStr.includes("/api/actions/edit_user")) {
				const body = JSON.parse(String(init?.body ?? "{}")) as {
					behaviour?: ReadonlyArray<{ id: string; fields: Record<string, unknown> }>;
				};
				const edit = body.behaviour?.[0];
				if (edit) {
					behaviour = behaviour.map((item) =>
						item.id === edit.id
							? {
									...item,
									name: (edit.fields.name as string | undefined) ?? item.name,
									activeSummary: "Founder Assistant · opencode harness",
									valueSource: "user_override",
									editableFields: item.editableFields.map((field) =>
										field.id in edit.fields ? { ...field, value: edit.fields[field.id] } : field,
									),
								}
							: item,
					) as typeof AGENT_BEHAVIOR_ITEMS;
				}
				return Promise.resolve({
					ok: true,
					status: 200,
					json: async () => ({ ok: true, data: openUserData(behaviour) }),
				});
			}
			if (urlStr.includes("/api/actions/search_users")) {
				return Promise.resolve({
					ok: true,
					status: 200,
					json: async () => ({ ok: true, data: [SELF_ROW] }),
				});
			}
			if (urlStr.includes("/api/actions/search_tasks")) {
				return Promise.resolve({
					ok: true,
					status: 200,
					json: async () => ({ ok: true, data: [] }),
				});
			}
			// SettingsPlugins reads through `call("search_plugins", …)` —
			// `POST /api/actions/search_plugins`, not the deleted `/api/plugins`
			// route — and the action's own result shape (`{ ok, data }`).
			if (urlStr.includes("/api/actions/search_plugins")) {
				return Promise.resolve({
					ok: true,
					status: 200,
					json: async () => ({ ok: true, data: [] }),
				});
			}
			if (urlStr.includes("/api/settings") || urlStr.includes("/api/credentials")) {
				return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
			}
			return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
		}),
	);
}

function renderSettingsPage(): ReturnType<typeof render> {
	return render(
		<MemoryRouter>
			<SettingsPage />
		</MemoryRouter>,
	);
}

describe("Settings Agent behavior surface", () => {
	beforeEach(() => setupFetch());
	afterEach(() => vi.restoreAllMocks());

	// BA1 D10: "Triggers" category is gone — five kinds now (agents, skills,
	// subscriptions, tools, MCP).
	it("renders one Settings area for agents, skills, subscriptions, tools, and MCP without Fabric/Strategy/trigger labels", async () => {
		renderSettingsPage();

		const section = await screen.findByTestId("settings-section-agent-behavior");
		expect(within(section).getByText("Agent behavior")).toBeInTheDocument();
		expect(SETTINGS_SECTIONS).toContainEqual({ id: "agent-behavior", label: "Agent behavior" });
		expect(within(section).getByTestId("settings-agent-behavior")).toHaveAttribute(
			"data-testid",
			"settings-agent-behavior",
		);
		expect(section.querySelector('[data-ds-component="split-view"]')).toBeInTheDocument();
		for (const label of ["Agents", "Skills", "Subscriptions", "Tools", "MCP"]) {
			expect(within(section).getByText(label)).toBeInTheDocument();
		}
		expect(section.textContent ?? "").not.toMatch(/Fabric|Strategy|trigger/i);
	});

	it("shows disabled and removed plugin origin states for tool items", async () => {
		renderSettingsPage();

		const section = await screen.findByTestId("settings-section-agent-behavior");
		expect(await within(section).findByText("Legacy report")).toBeInTheDocument();
		const initialText = section.textContent ?? "";
		expect(initialText).toContain("Inactive: plugin disabled");
		expect(initialText).toContain("Needs attention: origin removed");
	});

	it("saves a supported agent edit, keeps existing Settings links reachable, and reloads active override state", async () => {
		const user = userEvent.setup();
		renderSettingsPage();

		const section = await screen.findByTestId("settings-section-agent-behavior");
		await user.click(within(section).getByText("Assistant"));
		expect(within(section).queryByLabelText("Name")).toBeNull();
		await user.click(within(section).getByRole("button", { name: "Edit agent behavior" }));
		await user.clear(within(section).getByLabelText("Name"));
		await user.type(within(section).getByLabelText("Name"), "Founder Assistant");
		await user.click(within(section).getByRole("button", { name: /save/i }));

		await waitFor(() => {
			expect(
				within(section).getAllByText("Founder Assistant · opencode harness").length,
			).toBeGreaterThan(0);
		});
		expect(screen.getByTestId("settings-section-agents")).toBeInTheDocument();
		expect(screen.getByTestId("settings-section-agent-backends")).toBeInTheDocument();
		expect(screen.getByTestId("settings-section-connections")).toBeInTheDocument();
	});

	it("Cancel restores the selected behavior snapshot without saving", async () => {
		const user = userEvent.setup();
		renderSettingsPage();
		const section = await screen.findByTestId("settings-section-agent-behavior");
		await user.click(within(section).getByText("Assistant"));
		await user.click(within(section).getByRole("button", { name: "Edit agent behavior" }));
		await user.clear(within(section).getByLabelText("Name"));
		await user.type(within(section).getByLabelText("Name"), "Should Not Save");
		await user.click(
			within(section).getByRole("button", { name: "Cancel agent behavior editing" }),
		);
		expect(within(section).queryByLabelText("Name")).toBeNull();
		expect(within(section).getAllByText(/assistant · opencode harness/i).length).toBeGreaterThan(0);
	});

	it("keeps MCP URL changes read-only in Agent behavior and routes to Connections", async () => {
		const user = userEvent.setup();
		renderSettingsPage();

		const section = await screen.findByTestId("settings-section-agent-behavior");
		await user.click(within(section).getByText("Figma"));

		expect(within(section).getAllByText("https://mcp.figma.example/sse").length).toBeGreaterThan(0);
		expect(within(section).queryByLabelText("Server URL")).toBeNull();
		expect(within(section).getByText("Open Connections")).toBeInTheDocument();
	});
});
