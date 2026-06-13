/**
 * AH2 RED — SettingsAgents component tests
 *
 * AC2: Harness field is a Select (no text input), options = registered types
 * AC5: Model field replaces tier — renders a Select from MODEL_CATALOG
 * DESIGN-1: Save error (422) rendered inline (not just a toast)
 *
 * These tests FAIL until:
 *  - SettingsAgents.tsx adds Model Select (from MODEL_CATALOG) and Harness Select (from /api/harnesses)
 *  - Free-text harness input is replaced by a Select
 *  - 422 server error is rendered inline near the form actions
 *  - Model Tier field is removed
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
		soulPrompt: null,
		harnessType: "builtin",
		modelId: "claude-opus-4-8",
		modelProvider: "anthropic",
		maxConcurrentSessions: 1,
		status: "active",
		activeSessions: 0,
	},
	{
		id: "agent-sonnet-1",
		name: "Sonnet Agent",
		role: "product_manager",
		soulPrompt: null,
		harnessType: "claude-code",
		modelId: "claude-sonnet-4-6",
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

function mockFetchHappy(opts?: {
	patchStatus?: number;
	patchBody?: Record<string, unknown>;
	postStatus?: number;
	postBody?: Record<string, unknown>;
}): void {
	vi.stubGlobal(
		"fetch",
		vi.fn().mockImplementation((url: string, init?: RequestInit) => {
			if (typeof url === "string" && url.includes("/api/harnesses")) {
				return Promise.resolve({
					ok: true,
					status: 200,
					json: async () => MOCK_HARNESSES,
				});
			}
			if (typeof url === "string" && url.includes("/api/agents/templates")) {
				return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
			}
			if (typeof url === "string" && url.includes("/api/agents")) {
				const method = (init?.method ?? "GET").toUpperCase();
				if (method === "GET") {
					return Promise.resolve({ ok: true, status: 200, json: async () => MOCK_AGENTS });
				}
				if (method === "PATCH") {
					const status = opts?.patchStatus ?? 200;
					return Promise.resolve({
						ok: status < 400,
						status,
						json: async () => opts?.patchBody ?? { ...MOCK_AGENTS[0] },
					});
				}
				if (method === "POST") {
					const status = opts?.postStatus ?? 201;
					return Promise.resolve({
						ok: status < 400,
						status,
						json: async () =>
							opts?.postBody ?? { id: "new-ah2", ...MOCK_AGENTS[0], name: "New Agent" },
					});
				}
			}
			return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
		}),
	);
}

// ---------------------------------------------------------------------------
// AC2: Harness field is a constrained Select
// ---------------------------------------------------------------------------

describe("AH2 AC2: harness is a constrained <select>, not a text input", () => {
	beforeEach(() => {
		mockFetchHappy();
		mockShowToast.mockClear();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("renders a Harness Select (not a text input) in the edit form", async () => {
		const user = userEvent.setup();
		render(<SettingsAgents />);

		await waitFor(() => expect(screen.getByText("Opus Agent")).toBeInTheDocument());

		// Open edit for first agent
		const editButtons = screen.getAllByRole("button", { name: /edit/i });
		await user.click(editButtons[0] as HTMLElement);

		await waitFor(() => {
			// Should have a Select (combobox) for harness — NOT a plain text input
			const harnessSelect = screen.getByRole("combobox", { name: /harness/i });
			expect(harnessSelect.tagName).toBe("SELECT");
		});
	});

	it("harness Select options come from /api/harnesses (builtin, claude-code)", async () => {
		const user = userEvent.setup();
		render(<SettingsAgents />);

		await waitFor(() => expect(screen.getByText("Opus Agent")).toBeInTheDocument());

		const editButtons = screen.getAllByRole("button", { name: /edit/i });
		await user.click(editButtons[0] as HTMLElement);

		await waitFor(() => {
			const harnessSelect = screen.getByRole("combobox", { name: /harness/i });
			const options = Array.from(harnessSelect.querySelectorAll("option")).map((o) => o.value);
			expect(options).toContain("builtin");
			expect(options).toContain("claude-code");
		});
	});

	it("harness Select does NOT allow free text (no text input for harness)", async () => {
		const user = userEvent.setup();
		render(<SettingsAgents />);

		await waitFor(() => expect(screen.getByText("Opus Agent")).toBeInTheDocument());

		const editButtons = screen.getAllByRole("button", { name: /edit/i });
		await user.click(editButtons[0] as HTMLElement);

		await waitFor(() => {
			// There must be no free-text input for harness
			const textInputs = screen.queryAllByRole("textbox");
			// Name input is expected; harness must not be among textboxes
			const harnessTextInput = textInputs.find(
				(el) =>
					(el as HTMLInputElement).name === "harnessType" ||
					el.getAttribute("aria-label")?.toLowerCase().includes("harness"),
			);
			expect(harnessTextInput).toBeUndefined();
		});
	});

	it("add form also uses Select for harness (not free text)", async () => {
		const user = userEvent.setup();
		render(<SettingsAgents />);

		await waitFor(() => expect(screen.getByText("Opus Agent")).toBeInTheDocument());

		const addButton = screen.getByRole("button", { name: /add agent/i });
		await user.click(addButton);

		await waitFor(() => {
			const harnessSelect = screen.getByRole("combobox", { name: /harness/i });
			expect(harnessSelect.tagName).toBe("SELECT");
		});
	});
});

// ---------------------------------------------------------------------------
// AC5: Model Select replaces tier Select
// ---------------------------------------------------------------------------

describe("AH2 AC5: Model Select from MODEL_CATALOG replaces tier Select", () => {
	beforeEach(() => {
		mockFetchHappy();
		mockShowToast.mockClear();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("renders a Model Select in the edit form (not a tier select)", async () => {
		const user = userEvent.setup();
		render(<SettingsAgents />);

		await waitFor(() => expect(screen.getByText("Opus Agent")).toBeInTheDocument());

		const editButtons = screen.getAllByRole("button", { name: /edit/i });
		await user.click(editButtons[0] as HTMLElement);

		await waitFor(() => {
			const modelSelect = screen.getByRole("combobox", { name: /model/i });
			expect(modelSelect.tagName).toBe("SELECT");
		});
	});

	it("Model Select options include catalog ids (claude-opus-4-8, claude-sonnet-4-6)", async () => {
		const user = userEvent.setup();
		render(<SettingsAgents />);

		await waitFor(() => expect(screen.getByText("Opus Agent")).toBeInTheDocument());

		const editButtons = screen.getAllByRole("button", { name: /edit/i });
		await user.click(editButtons[0] as HTMLElement);

		await waitFor(() => {
			const modelSelect = screen.getByRole("combobox", { name: /model/i });
			const options = Array.from(modelSelect.querySelectorAll("option")).map((o) => o.value);
			expect(options).toContain("claude-opus-4-8");
			expect(options).toContain("claude-sonnet-4-6");
			expect(options).toContain("claude-haiku-4-5");
			expect(options).toContain("claude-fable-5");
		});
	});

	it("Model Select options do NOT include stale -20250514 ids", async () => {
		const user = userEvent.setup();
		render(<SettingsAgents />);

		await waitFor(() => expect(screen.getByText("Opus Agent")).toBeInTheDocument());

		const editButtons = screen.getAllByRole("button", { name: /edit/i });
		await user.click(editButtons[0] as HTMLElement);

		await waitFor(() => {
			const modelSelect = screen.getByRole("combobox", { name: /model/i });
			const options = Array.from(modelSelect.querySelectorAll("option")).map((o) => o.value);
			for (const opt of options) {
				expect(opt).not.toContain("20250514");
				expect(opt).not.toContain("haiku-3-5");
			}
		});
	});

	it("table has a 'Model' column (no 'Model Tier' column)", async () => {
		render(<SettingsAgents />);

		await waitFor(() => expect(screen.getByText("Opus Agent")).toBeInTheDocument());

		// Should have Model column
		expect(screen.getByText(/^model$/i)).toBeInTheDocument();
		// Should NOT have Model Tier column
		expect(screen.queryByText(/model tier/i)).not.toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// DESIGN-1: Save error (422) rendered inline
// ---------------------------------------------------------------------------

describe("AH2 DESIGN-1: 422 server error rendered inline (not just toast)", () => {
	beforeEach(() => {
		mockShowToast.mockClear();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("renders inline error message when PATCH returns 422 UNKNOWN_HARNESS", async () => {
		mockFetchHappy({
			patchStatus: 422,
			patchBody: { error: "Unknown harness: ghost-harness", code: "UNKNOWN_HARNESS" },
		});

		const user = userEvent.setup();
		render(<SettingsAgents />);

		await waitFor(() => expect(screen.getByText("Opus Agent")).toBeInTheDocument());

		const editButtons = screen.getAllByRole("button", { name: /edit/i });
		await user.click(editButtons[0] as HTMLElement);

		await waitFor(() => screen.getByRole("button", { name: /save/i }));
		await user.click(screen.getByRole("button", { name: /save/i }));

		// Inline error must appear (not just a toast)
		await waitFor(() => {
			expect(screen.getByText(/unknown harness/i)).toBeInTheDocument();
		});
	});

	it("edit form stays open when 422 is returned (values intact)", async () => {
		mockFetchHappy({
			patchStatus: 422,
			patchBody: {
				error: "Harness 'ghost' does not support provider 'openrouter'.",
				code: "INCOMPATIBLE_HARNESS_MODEL",
			},
		});

		const user = userEvent.setup();
		render(<SettingsAgents />);

		await waitFor(() => expect(screen.getByText("Opus Agent")).toBeInTheDocument());

		const editButtons = screen.getAllByRole("button", { name: /edit/i });
		await user.click(editButtons[0] as HTMLElement);

		await waitFor(() => screen.getByLabelText(/name/i));
		await user.click(screen.getByRole("button", { name: /save/i }));

		// Form must still be open
		await waitFor(() => {
			expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
			// Inline error visible
			expect(screen.getByText(/does not support provider/i)).toBeInTheDocument();
		});
	});

	it("does NOT call showToast for structured 422 errors", async () => {
		mockFetchHappy({
			patchStatus: 422,
			patchBody: { error: "Unknown model: stale-model", code: "UNKNOWN_MODEL" },
		});

		const user = userEvent.setup();
		render(<SettingsAgents />);

		await waitFor(() => expect(screen.getByText("Opus Agent")).toBeInTheDocument());

		const editButtons = screen.getAllByRole("button", { name: /edit/i });
		await user.click(editButtons[0] as HTMLElement);

		await waitFor(() => screen.getByRole("button", { name: /save/i }));
		await user.click(screen.getByRole("button", { name: /save/i }));

		await waitFor(() => {
			expect(screen.getByText(/unknown model/i)).toBeInTheDocument();
		});

		// Toast should NOT be called for this structured error
		expect(mockShowToast).not.toHaveBeenCalledWith(expect.stringMatching(/failed to save/i));
	});

	it("clears inline error on next field change", async () => {
		mockFetchHappy({
			patchStatus: 422,
			patchBody: { error: "Unknown harness: ghost", code: "UNKNOWN_HARNESS" },
		});

		const user = userEvent.setup();
		render(<SettingsAgents />);

		await waitFor(() => expect(screen.getByText("Opus Agent")).toBeInTheDocument());

		const editButtons = screen.getAllByRole("button", { name: /edit/i });
		await user.click(editButtons[0] as HTMLElement);

		await waitFor(() => screen.getByRole("button", { name: /save/i }));
		await user.click(screen.getByRole("button", { name: /save/i }));

		await waitFor(() => {
			expect(screen.getByText(/unknown harness/i)).toBeInTheDocument();
		});

		// Now change a field — error should clear
		const nameInput = screen.getByLabelText(/name/i);
		await user.type(nameInput, " X");

		await waitFor(() => {
			expect(screen.queryByText(/unknown harness/i)).not.toBeInTheDocument();
		});
	});
});

// ---------------------------------------------------------------------------
// AC2: Save disabled when harness is "not available"
// ---------------------------------------------------------------------------

describe("AH2 AC2: Save blocked when harness is unavailable", () => {
	it("shows StatusChip warning when agent harness is not in registry", async () => {
		// Agent with unregistered harness type
		vi.stubGlobal(
			"fetch",
			vi.fn().mockImplementation((url: string) => {
				if (typeof url === "string" && url.includes("/api/harnesses")) {
					return Promise.resolve({ ok: true, status: 200, json: async () => MOCK_HARNESSES });
				}
				if (typeof url === "string" && url.includes("/api/agents")) {
					return Promise.resolve({
						ok: true,
						status: 200,
						json: async () => [
							{
								...MOCK_AGENTS[0],
								harnessType: "aider", // not in MOCK_HARNESSES
							},
						],
					});
				}
				return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
			}),
		);

		render(<SettingsAgents />);

		await waitFor(() => {
			// Should render a warning chip for the unavailable harness
			expect(screen.getByText(/harness unavailable/i)).toBeInTheDocument();
		});

		vi.restoreAllMocks();
	});
});
