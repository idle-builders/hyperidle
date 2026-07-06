/**
 * D1 (POLISH-060) — cursor-agent is non-actionable in the harness list.
 *
 * AC: Settings does not present cursor as an authable/selectable backend;
 * no "Log in to Cursor" CTA; row shows the "not yet supported" reason.
 *
 * Tests render SettingsHarnesses with a cursor-agent descriptor in the
 * "unavailable" state (matching the D1 server-side fix) and assert that:
 *   1. The row is present (not hidden — it's on the roadmap).
 *   2. There is NO toggle switch for cursor-agent.
 *   3. There is NO "Log in to Cursor" button or command text.
 *   4. The "not yet supported" message is visible.
 */

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsHarnesses } from "../SettingsHarnesses.js";

const CURSOR_UNAVAILABLE_DESCRIPTORS = [
	{
		type: "builtin",
		name: "Built-in",
		kind: "local",
		accessMode: "api-gateway",
		authAction: { kind: "enter_api_key", label: "Enter API key" },
		discovery: { state: "ready" },
		models: [],
		runtime: {
			preCompactionTrigger: false,
			subAgents: false,
			mcpSupport: false,
			modelProviders: ["anthropic"],
			fileEditing: false,
			toolUse: false,
		},
		modelProviders: ["anthropic"],
	},
	{
		type: "cursor-agent",
		name: "Cursor Agent",
		kind: "local",
		accessMode: "provider-subscription-cli",
		// D1 fix: kind:"none" → no actionable auth step
		authAction: { kind: "none" },
		discovery: {
			state: "unavailable",
			reason:
				"Cursor Agent is not yet supported. Cursor does not expose a headless CLI surface HyperIdle can drive.",
		},
		models: [],
		runtime: {
			preCompactionTrigger: false,
			subAgents: false,
			mcpSupport: false,
			modelProviders: [],
			fileEditing: false,
			toolUse: false,
		},
		modelProviders: [],
	},
];

// biome-ignore lint/suspicious/noExplicitAny: test fixture
function mockFetch(descriptors: any[] = CURSOR_UNAVAILABLE_DESCRIPTORS): void {
	vi.stubGlobal(
		"fetch",
		vi.fn().mockImplementation((url: string) => {
			if (typeof url === "string" && url.includes("/api/harnesses")) {
				return Promise.resolve({
					ok: true,
					status: 200,
					json: async () => descriptors,
				});
			}
			return Promise.resolve({ ok: false, status: 404 });
		}),
	);
}

describe("D1 — cursor-agent is non-actionable", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("renders cursor-agent row (present in list, not hidden)", async () => {
		mockFetch();
		render(<SettingsHarnesses />);
		await waitFor(() => {
			expect(screen.getByText("Cursor Agent")).toBeInTheDocument();
		});
	});

	it("cursor-agent row has NO toggle/switch (unavailable state)", async () => {
		mockFetch();
		render(<SettingsHarnesses />);
		await waitFor(() => {
			expect(screen.getByText("Cursor Agent")).toBeInTheDocument();
		});
		const allSwitches = screen.queryAllByRole("switch");
		const cursorSwitch = allSwitches.find((s) =>
			s.getAttribute("aria-label")?.match(/cursor agent/i),
		);
		expect(cursorSwitch).toBeUndefined();
	});

	it("cursor-agent row has NO 'Log in to Cursor' CTA text", async () => {
		mockFetch();
		render(<SettingsHarnesses />);
		await waitFor(() => {
			expect(screen.getByText("Cursor Agent")).toBeInTheDocument();
		});
		// No login CTA copy
		expect(screen.queryByText(/log in to cursor/i)).not.toBeInTheDocument();
	});

	it("cursor-agent row shows 'not yet supported' message", async () => {
		mockFetch();
		render(<SettingsHarnesses />);
		await waitFor(() => {
			expect(screen.getByText(/not yet supported/i)).toBeInTheDocument();
		});
	});
});
