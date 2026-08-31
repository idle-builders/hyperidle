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
 * AC2 (harness warning): the per-row StatusChip was removed. Fifteen identical amber
 * "Harness unavailable" chips on every row was noise, not information — especially when
 * the cause is simply missing credentials. The list is now a clean index; harness issues
 * surface in the detail pane when the user opens an agent. This test now guards against
 * re-adding the per-row chip.
 *
 * @lore UI-122 (final): Harness availability is a configuration detail, not a list-level
 * concern. The agent list is an index — it should identify agents, not repeat the same
 * warning for every entry. Detail belongs in the detail pane.
 */

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsAgents } from "../SettingsAgents.js";

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_HARNESSES = [
	{ type: "opencode", name: "OpenCode", modelProviders: ["anthropic", "openrouter"] },
	{ type: "claude-code", name: "Claude Code", modelProviders: ["anthropic"] },
];

const MOCK_AGENTS = [
	{
		id: "agent-opus-1",
		name: "Opus Agent",
		role: "builder",
		systemPrompt: null,
		harnessType: "opencode",
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
// AC2: Agent list rows are clean — no per-row harness warning chip
//
// Harness availability is a detail-pane concern. The list is an index;
// repeated amber chips on every row shouting the same fact is noise.
// ---------------------------------------------------------------------------

describe("AH2 AC2: Agent list rows show no per-row harness warning", () => {
	it("does NOT show 'Harness unavailable' in the list even when agent harness is not in registry", async () => {
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
						// Agent uses "aider" which is not in MOCK_HARNESSES — no chip should appear
						json: async () => [{ ...MOCK_AGENTS[0], harnessType: "aider" }],
					});
				}
				return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
			}),
		);

		render(<SettingsAgents />);

		// Agent name appears in the list
		await waitFor(() => {
			expect(screen.getByText("Opus Agent")).toBeInTheDocument();
		});

		// No harness warning chip — harness issues surface in the detail pane, not the list
		expect(screen.queryByText(/harness unavailable/i)).toBeNull();
	});
});
