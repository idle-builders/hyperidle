/**
 * AH2 RED — SettingsModels component tests
 *
 * AC5: Global tier table no longer per-agent mechanism — demoted to "system default"
 * - SettingsModels shows a helper line: "System default models. Used only when..."
 * - Anthropic model options in each tier row use MODEL_CATALOG ids (not stale)
 *
 * These tests FAIL until:
 *  - SettingsModels.tsx replaces KNOWN_ANTHROPIC_MODELS with MODEL_CATALOG
 *  - SettingsModels.tsx adds the "system default" helper paragraph
 */

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsModels } from "../SettingsModels.js";

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_GATEWAY_CONFIG = {
	reasoning: { provider: "anthropic", model: "claude-opus-4-8", hasApiKey: false },
	workhorse: { provider: "anthropic", model: "claude-sonnet-4-6", hasApiKey: false },
	fast: { provider: "anthropic", model: "claude-haiku-4-5", hasApiKey: false },
};

const mockShowToast = vi.fn();
vi.mock("../../shell/ToastRegion.js", async () => {
	const actual = await vi.importActual("../../shell/ToastRegion.js");
	return {
		...actual,
		useToast: vi.fn(() => ({ showToast: mockShowToast })),
	};
});

// ---------------------------------------------------------------------------
// AC5: "system default" helper copy visible
// ---------------------------------------------------------------------------

describe("AH2 AC5: SettingsModels shows system-default helper copy", () => {
	beforeEach(() => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockImplementation((url: string) => {
				if (typeof url === "string" && url.includes("/api/model-gateway")) {
					return Promise.resolve({ ok: true, status: 200, json: async () => MOCK_GATEWAY_CONFIG });
				}
				return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
			}),
		);
		mockShowToast.mockClear();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("renders the 'System default models' helper text", async () => {
		render(<SettingsModels />);

		await waitFor(() => {
			expect(screen.getByText(/system default models/i)).toBeInTheDocument();
		});
	});

	it("helper text mentions 'per-agent models in Settings → Agents'", async () => {
		render(<SettingsModels />);

		await waitFor(() => {
			expect(screen.getByText(/set per-agent models in settings.*agents/i)).toBeInTheDocument();
		});
	});
});

// ---------------------------------------------------------------------------
// AC4: Model options use current catalog ids (not stale)
// ---------------------------------------------------------------------------

describe("AH2 AC4: SettingsModels Anthropic model options use current catalog ids", () => {
	beforeEach(() => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockImplementation((url: string) => {
				if (typeof url === "string" && url.includes("/api/model-gateway")) {
					return Promise.resolve({ ok: true, status: 200, json: async () => MOCK_GATEWAY_CONFIG });
				}
				return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
			}),
		);
		mockShowToast.mockClear();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("renders claude-opus-4-8 as an option (current catalog id)", async () => {
		render(<SettingsModels />);

		await waitFor(() => {
			// The current model should appear in options
			const elements = screen.queryAllByText(/claude-opus-4-8/i);
			expect(elements.length).toBeGreaterThan(0);
		});
	});

	it("renders claude-sonnet-4-6 as an option (current catalog id)", async () => {
		render(<SettingsModels />);

		await waitFor(() => {
			const elements = screen.queryAllByText(/claude-sonnet-4-6/i);
			expect(elements.length).toBeGreaterThan(0);
		});
	});

	it("renders claude-haiku-4-5 as an option (current catalog id)", async () => {
		render(<SettingsModels />);

		await waitFor(() => {
			const elements = screen.queryAllByText(/claude-haiku-4-5/i);
			expect(elements.length).toBeGreaterThan(0);
		});
	});

	it("does NOT render stale claude-opus-4-20250514 option", async () => {
		render(<SettingsModels />);

		await waitFor(() => {
			expect(screen.getByText(/reasoning/i)).toBeInTheDocument();
		});

		// Stale IDs should not appear as options
		const staleElements = screen.queryAllByText(/claude-opus-4-20250514/i);
		expect(staleElements.length).toBe(0);
	});

	it("does NOT render stale claude-sonnet-4-20250514 option", async () => {
		render(<SettingsModels />);

		await waitFor(() => {
			expect(screen.getByText(/workhorse/i)).toBeInTheDocument();
		});

		const staleElements = screen.queryAllByText(/claude-sonnet-4-20250514/i);
		expect(staleElements.length).toBe(0);
	});

	it("does NOT render stale claude-haiku-3-5-20241022 option", async () => {
		render(<SettingsModels />);

		await waitFor(() => {
			expect(screen.getByText(/fast/i)).toBeInTheDocument();
		});

		const staleElements = screen.queryAllByText(/claude-haiku-3-5-20241022/i);
		expect(staleElements.length).toBe(0);
	});
});
