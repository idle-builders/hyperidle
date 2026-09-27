/**
 * The whole Settings page renders on the real `open_user({})` shape.
 *
 * Reproduces the packaged-app crash end to end: opening Settings on the demo
 * database threw `TypeError: Cannot read properties of undefined (reading
 * 'localeCompare')` inside `SettingsConnections`, and the uncaught render
 * error took down every section below it, not just Connections.
 *
 * @lore: the fixture below is the exact shape `open_user({})` returns on that database — `connections.inherited` rows shaped like `ConnectionView` (id/service/via/authSource/health/removable), no held connections, no documents. Every section under scope (SettingsConnections/DocumentSlotList/SettingsSkillsAndRules/ SettingsFilesystems/SettingsHarnesses/SettingsNotifications) reads through this one `open_user` response.
 */

import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "../../components/ErrorBoundary.js";
import { SettingsPage } from "../SettingsPage.js";

vi.mock("../../hooks/useCurrentUser", () => ({
	useCurrentUser: () => ({
		user: { id: "me", name: "Me", avatarUrl: null },
		status: "ready",
		error: null,
	}),
}));

vi.mock("../../hooks/useTeams", () => ({
	useTeams: () => ({
		data: {
			teams: [{ id: "team-1", name: "Acme" }],
			users: [{ id: "me", name: "Me", kind: "human", role: "founder" }],
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

const SELF_ROW = {
	id: "me",
	kind: "human",
	name: "Me",
	role: "founder",
	status: "active",
	team: { id: "team-1", name: "Acme" },
};

const INHERITED_SERVICES = [
	"claude-code",
	"github",
	"figma",
	"linear",
	"notion",
	"stripe-mcp",
	"vercel",
	"sentry",
	"postgres",
	"slack",
	"gh-cli",
	"codex",
	"opencode",
	"cursor-agent",
];

/** The real wire shape open_user({}) returns for the inherited group. */
function inheritedRows(): unknown[] {
	return INHERITED_SERVICES.map((service, i) => ({
		id: `inherited:harness:${service}`,
		service,
		via: `CLI · ${service}`,
		authSource: "inherited",
		health: i % 4 === 0 ? "needs-attention" : "working",
		removable: false,
	}));
}

/** The exact open_user({}) shape from the crash: 14 inherited rows, no held
 * connections, no documents. */
function openUserData(): Record<string, unknown> {
	return {
		user: SELF_ROW,
		runsOn: [],
		runConfig: null,
		documentIds: [],
		folders: [],
		subscriptions: [],
		connections: { connections: [], inherited: inheritedRows() },
		inbox: [],
	};
}

function setupFetch(): void {
	vi.stubGlobal(
		"fetch",
		vi.fn().mockImplementation((url: string) => {
			const urlStr = String(url);
			if (urlStr.includes("/api/actions/open_user")) {
				return Promise.resolve({
					ok: true,
					status: 200,
					json: async () => ({ ok: true, data: openUserData() }),
				});
			}
			if (urlStr.includes("/api/actions/search_documents")) {
				return Promise.resolve({
					ok: true,
					status: 200,
					json: async () => ({ ok: true, data: [] }),
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
			if (urlStr.includes("/api/actions/search_plugins")) {
				return Promise.resolve({
					ok: true,
					status: 200,
					json: async () => ({ ok: true, data: [] }),
				});
			}
			return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
		}),
	);
}

function renderSettingsPage(): ReturnType<typeof render> {
	return render(
		<MemoryRouter>
			<ErrorBoundary>
				<SettingsPage />
			</ErrorBoundary>
		</MemoryRouter>,
	);
}

describe("SettingsPage on the real open_user shape", () => {
	beforeEach(() => setupFetch());
	afterEach(() => vi.restoreAllMocks());

	it("renders every section without falling into the error boundary", async () => {
		renderSettingsPage();

		await screen.findByText("claude-code");
		expect(screen.queryByTestId("error-boundary-fallback")).toBeNull();

		for (const testId of [
			"settings-section-connections",
			"settings-section-skills",
			"settings-section-filesystems",
			"settings-section-agent-backends",
			"settings-section-notifications",
		]) {
			expect(screen.getByTestId(testId)).toBeInTheDocument();
		}
	});

	it("renders the inherited connection rows and their needs-attention chips", async () => {
		renderSettingsPage();

		await screen.findByText("claude-code");
		for (const service of INHERITED_SERVICES) {
			expect(screen.getByText(service)).toBeInTheDocument();
		}
		const chips = await screen.findAllByText(/needs attention/i);
		expect(chips.length).toBeGreaterThan(0);
	});

	it("renders the skills & rules section with an empty document list", async () => {
		renderSettingsPage();

		const section = await screen.findByTestId("settings-section-skills");
		await waitFor(() => {
			expect(section.textContent ?? "").not.toBe("");
		});
		expect(screen.queryByTestId("error-boundary-fallback")).toBeNull();
	});
});
