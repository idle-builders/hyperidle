/**
 * AH2 — SettingsAgents component tests (updated for AV2)
 *
 * AV2 replaced the inline edit row (table + Edit button) with a SplitView + AgentEditor.
 * Tests for harness select in the edit form, MODEL_CATALOG model select, and 422 inline
 * error are now covered by AV2-AgentEditor.test.tsx (directly via AgentEditor component).
 *
 * AC5 ("Model" column header) removed: AV2 uses ItemList/Row — no table column headers.
 * The model value still renders in the row cells but there's no "Model" column header text.
 *
 * Kept here: row-level concerns that are uniquely tested through SettingsAgents:
 *   - AC2: harness unavailability warning shown in the agent row
 */

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsAgents } from "../SettingsAgents.js";

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_HARNESSES = [
	{ type: "builtin", name: "Built-in Harness", modelProviders: ["anthropic", "openrouter"] },
	{ type: "claude-code", name: "Claude Code", modelProviders: ["anthropic"] },
];

const MOCK_AGENTS = [
	{
		id: "agent-opus-1",
		name: "Opus Agent",
		role: "builder",
		systemPrompt: null,
		harnessType: "builtin",
		modelId: "claude-opus-4-8",
		modelProvider: "anthropic",
		maxConcurrentSessions: 1,
		status: "active",
		activeSessions: 0,
	},
];

const mockShowToast = vi.fn();
vi.mock("../../shell/ToastRegion.js", async () => {
	const actual = await vi.importActual("../../shell/ToastRegion.js");
	return {
		...actual,
		useToast: vi.fn(() => ({ showToast: mockShowToast })),
	};
});

afterEach(() => {
	vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// AC5: Model column check removed — AV2 uses ItemList/Row (no table column headers).
// AV2 coverage: model value still shown in row cells; no "Model Tier" text anywhere.
// ---------------------------------------------------------------------------
// AC2: Warns when agent harness is unavailable
// ---------------------------------------------------------------------------

describe("AH2 AC2: Warns when agent harness is unavailable", () => {
	it("shows StatusChip warning when agent harness is not in registry", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockImplementation((url: string) => {
				if (String(url).includes("/api/harnesses")) {
					return Promise.resolve({ ok: true, status: 200, json: async () => MOCK_HARNESSES });
				}
				if (String(url).includes("/api/agents")) {
					return Promise.resolve({
						ok: true,
						status: 200,
						json: async () => [{ ...MOCK_AGENTS[0], harnessType: "aider" }],
					});
				}
				return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
			}),
		);

		render(<SettingsAgents />);

		await waitFor(() => {
			expect(screen.getByText(/harness unavailable/i)).toBeInTheDocument();
		});
	});
});
