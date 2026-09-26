/**
 * SettingsConnections renders on the real `open_user({})` shape.
 *
 * Reproduces the packaged-app crash: `TypeError: Cannot read properties of
 * undefined (reading 'localeCompare')` then `[ErrorBoundary] caught render
 * error`, opening Settings on the demo database.
 *
 * @lore The connections door (`agent-orchestration/connections`'s
 * `projectFacts`) returns the inherited group as `ServiceConnectionView`
 * rows — the same `id/service/via/authSource/health/removable` shape the
 * held groups use. This fixture is that real wire shape: 14 inherited rows,
 * some `needs-attention`, no held connections, no documents.
 */

import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "../../components/ErrorBoundary.js";
import { SettingsConnections } from "../../settings/SettingsConnections.js";

const { callMock } = vi.hoisted(() => ({ callMock: vi.fn() }));
vi.mock("../../services/call.js", () => ({ call: callMock }));

const SELF_ROW = { id: "me", kind: "human", name: "Me", team: { id: "team-1", name: "Acme" } };

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

function openUserData(): Record<string, unknown> {
	return {
		user: SELF_ROW,
		runsOn: [],
		runConfig: null,
		documentIds: [],
		folders: [],
		subscriptions: [],
		connections: {
			connections: [],
			inherited: inheritedRows(),
		},
		inbox: null,
		reviewTrackRecord: null,
	};
}

describe("SettingsConnections on the real open_user shape", () => {
	beforeEach(() => {
		callMock.mockReset();
		callMock.mockImplementation((name: string) => {
			if (name === "open_user") {
				return Promise.resolve({ ok: true, data: openUserData() });
			}
			return Promise.resolve({ ok: false, problems: [{ code: "unmocked", message: name }] });
		});
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("does not crash to the error boundary with 14 inherited rows and no held connections", async () => {
		render(
			<ErrorBoundary>
				<SettingsConnections />
			</ErrorBoundary>,
		);

		await screen.findByText("claude-code");
		expect(screen.queryByTestId("error-boundary-fallback")).toBeNull();
	});

	it("renders every inherited service row", async () => {
		render(
			<ErrorBoundary>
				<SettingsConnections />
			</ErrorBoundary>,
		);

		for (const service of INHERITED_SERVICES) {
			expect(await screen.findByText(service)).toBeDefined();
		}
	});

	it("shows a needs-attention chip for the inherited rows that need it", async () => {
		render(
			<ErrorBoundary>
				<SettingsConnections />
			</ErrorBoundary>,
		);

		await screen.findByText("claude-code");
		const chips = await screen.findAllByText(/needs attention/i);
		expect(chips.length).toBeGreaterThan(0);
	});
});
