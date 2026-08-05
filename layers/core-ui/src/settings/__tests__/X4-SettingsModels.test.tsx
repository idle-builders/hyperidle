/**
 * X4 RED — SettingsModels component unit tests (red phase)
 *
 * AC coverage:
 *  - Renders 3 tier rows (reasoning, workhorse, fast)
 *  - Shows loading skeleton while fetching
 *  - Shows error message on fetch failure
 *  - Provider change shows correct fields per provider
 *  - Auto-saves on change via PATCH
 *
 * These tests FAIL until:
 *  - layers/core-ui/src/settings/SettingsModels.tsx is created
 *  - The component fetches from GET /api/model-gateway on mount
 *  - The component renders 3 collapsible tier rows
 *  - Provider selection shows/hides baseUrl and apiKey fields
 *  - Changes auto-save via PATCH /api/model-gateway
 *
 * @lore X4: SettingsModels follows the SettingsAgents pattern — fetch on mount,
 * row-based display, auto-save. No navigation link to Credentials section
 * (critique F-ERR-1 — Credentials section is Electron-only). Shows
 * hasApiKey status dot without a navigation link.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsModels } from "../SettingsModels.js";

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

// AH2: Updated mock to use current catalog IDs (stale -20250514 ids removed in task 1)
const MOCK_GATEWAY_CONFIG = {
	reasoning: {
		provider: "anthropic",
		model: "claude-opus-4-8",
		hasApiKey: false,
	},
	workhorse: {
		provider: "anthropic",
		model: "claude-sonnet-4-6",
		hasApiKey: false,
	},
	fast: {
		provider: "anthropic",
		model: "claude-haiku-4-5",
		hasApiKey: false,
	},
};

const MOCK_GATEWAY_WITH_OPENROUTER = {
	reasoning: {
		provider: "anthropic",
		model: "claude-opus-4-8",
		hasApiKey: false,
	},
	workhorse: {
		provider: "openrouter",
		model: "anthropic/claude-sonnet-4",
		hasApiKey: false,
	},
	fast: {
		provider: "anthropic",
		model: "claude-haiku-4-5",
		hasApiKey: false,
	},
};

// ---------------------------------------------------------------------------
// Mock useToast
// ---------------------------------------------------------------------------

const mockShowToast = vi.fn();
vi.mock("../../shell/ToastRegion.js", async () => {
	const actual = await vi.importActual("../../shell/ToastRegion.js");
	return {
		...actual,
		useToast: vi.fn(() => ({ showToast: mockShowToast })),
	};
});

// ---------------------------------------------------------------------------
// AC: Renders 3 tier rows
// ---------------------------------------------------------------------------

describe("X4 AC: SettingsModels renders 3 tier rows", () => {
	beforeEach(() => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockImplementation((url: string) => {
				if (url.includes("/api/model-gateway")) {
					return Promise.resolve({
						ok: true,
						status: 200,
						json: async () => MOCK_GATEWAY_CONFIG,
					});
				}
				return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
			}),
		);
		mockShowToast.mockClear();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("renders all 3 tier labels (reasoning, workhorse, fast)", async () => {
		render(<SettingsModels />);

		await waitFor(() => {
			expect(screen.getByText(/reasoning/i)).toBeInTheDocument();
			expect(screen.getByText(/workhorse/i)).toBeInTheDocument();
			expect(screen.getByText(/fast/i)).toBeInTheDocument();
		});
	});

	it("renders provider for each tier", async () => {
		render(<SettingsModels />);

		await waitFor(() => {
			// All 3 tiers should show "anthropic" as the default provider
			const anthropicLabels = screen.getAllByText(/anthropic/i);
			expect(anthropicLabels.length).toBeGreaterThanOrEqual(1);
		});
	});

	it("renders model name for each tier", async () => {
		// AH2: Updated to current catalog IDs — stale -20250514 ids removed
		render(<SettingsModels />);

		await waitFor(() => {
			// Model names appear as option text in the select dropdowns —
			// use getAllByText since each model name may appear in multiple option elements.
			expect(screen.getAllByText(/claude-opus-4-8/i).length).toBeGreaterThanOrEqual(1);
			expect(screen.getAllByText(/claude-sonnet-4-6/i).length).toBeGreaterThanOrEqual(1);
			expect(screen.getAllByText(/claude-haiku-4-5/i).length).toBeGreaterThanOrEqual(1);
		});
	});
});

// ---------------------------------------------------------------------------
// AC: Loading and error states
// ---------------------------------------------------------------------------

describe("X4 AC: SettingsModels loading and error states", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("shows loading skeleton while fetching", () => {
		// Make fetch hang
		vi.stubGlobal(
			"fetch",
			vi.fn().mockImplementation(() => new Promise(() => {})),
		);

		render(<SettingsModels />);

		// Should show at least one skeleton element (SkeletonList renders role="status")
		const skeletons = document.querySelectorAll('[role="status"]');
		expect(skeletons.length).toBeGreaterThan(0);
	});

	it("shows error message on fetch failure", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockImplementation(() =>
				Promise.resolve({
					ok: false,
					status: 500,
					json: async () => ({ error: "Internal server error" }),
				}),
			),
		);

		render(<SettingsModels />);

		await waitFor(() => {
			// Should show an error message
			expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
		});
	});
});

// ---------------------------------------------------------------------------
// AC: Provider change shows correct fields
// ---------------------------------------------------------------------------

describe("X4 AC: SettingsModels provider-specific fields", () => {
	beforeEach(() => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
				if (url.includes("/api/model-gateway")) {
					if (!opts?.method || opts.method === "GET") {
						return Promise.resolve({
							ok: true,
							status: 200,
							json: async () => MOCK_GATEWAY_CONFIG,
						});
					}
					if (opts?.method === "PATCH") {
						return Promise.resolve({
							ok: true,
							status: 200,
							json: async () => ({
								...MOCK_GATEWAY_CONFIG,
								fast: { provider: "openai-compatible", model: "gemma-3", hasApiKey: false },
							}),
						});
					}
				}
				return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
			}),
		);
		mockShowToast.mockClear();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("shows baseUrl and apiKey fields when provider is openai-compatible", async () => {
		const user = userEvent.setup();
		render(<SettingsModels />);

		// Wait for component to load
		await waitFor(() => {
			expect(screen.getByText(/reasoning/i)).toBeInTheDocument();
		});

		// Find the provider select for one of the tiers (e.g. fast)
		// The component should have provider selects for each tier
		const providerSelects = screen.getAllByRole("combobox", {
			name: /provider/i,
		});
		// Select the 'fast' tier provider (3rd one)
		const fastProviderSelect = providerSelects[2];
		if (!fastProviderSelect) {
			// Alternate: look by label
			expect(providerSelects.length).toBeGreaterThan(0);
			return;
		}

		await user.selectOptions(fastProviderSelect, "openai-compatible");

		await waitFor(() => {
			// Should show baseUrl input
			expect(screen.getByLabelText(/base url/i)).toBeInTheDocument();
			// Should show apiKey input
			expect(screen.getByLabelText(/api key/i)).toBeInTheDocument();
		});
	});

	it("does NOT show baseUrl field when provider is anthropic", async () => {
		render(<SettingsModels />);

		await waitFor(() => {
			expect(screen.getByText(/reasoning/i)).toBeInTheDocument();
		});

		// With all anthropic providers, no baseUrl input should exist
		expect(screen.queryByLabelText(/base url/i)).not.toBeInTheDocument();
	});

	it("does NOT show apiKey field when provider is openrouter", async () => {
		// Serve openrouter config
		vi.stubGlobal(
			"fetch",
			vi.fn().mockImplementation((url: string) => {
				if (url.includes("/api/model-gateway")) {
					return Promise.resolve({
						ok: true,
						status: 200,
						json: async () => MOCK_GATEWAY_WITH_OPENROUTER,
					});
				}
				return Promise.resolve({ ok: false, status: 404 });
			}),
		);

		render(<SettingsModels />);

		await waitFor(() => {
			expect(screen.getByText(/workhorse/i)).toBeInTheDocument();
		});

		// openrouter does not show apiKey input (key is in credential catalog)
		expect(screen.queryByLabelText(/api key/i)).not.toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// AC: Auto-saves on change via PATCH
// ---------------------------------------------------------------------------

describe("X4 AC: SettingsModels auto-saves via PATCH", () => {
	beforeEach(() => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
				if (url.includes("/api/model-gateway")) {
					if (!opts?.method || opts.method === "GET") {
						return Promise.resolve({
							ok: true,
							status: 200,
							json: async () => MOCK_GATEWAY_CONFIG,
						});
					}
					if (opts?.method === "PATCH") {
						// Return the body as saved config (with hasApiKey added)
						const body = JSON.parse(opts.body as string) as Record<string, Record<string, unknown>>;
						return Promise.resolve({
							ok: true,
							status: 200,
							json: async () =>
								Object.fromEntries(
									Object.entries(body).map(([tier, cfg]) => [
										tier,
										{ ...cfg, hasApiKey: false, apiKey: undefined },
									]),
								),
						});
					}
				}
				return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
			}),
		);
		mockShowToast.mockClear();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("calls PATCH /api/model-gateway when provider is changed", async () => {
		const user = userEvent.setup();
		render(<SettingsModels />);

		await waitFor(() => {
			expect(screen.getByText(/reasoning/i)).toBeInTheDocument();
		});

		// Find provider selects
		const providerSelects = screen.getAllByRole("combobox", { name: /provider/i });
		if (providerSelects.length > 0) {
			// Change the first provider to openrouter
			await user.selectOptions(providerSelects[0] as HTMLElement, "openrouter");

			// PATCH should be called
			await waitFor(() => {
				const fetchMock = vi.mocked(fetch);
				const patchCall = fetchMock.mock.calls.find(
					([url, opts]) =>
						typeof url === "string" &&
						url.includes("/api/model-gateway") &&
						(opts as RequestInit)?.method === "PATCH",
				);
				expect(patchCall).toBeDefined();
			});
		}
	});

	it("shows a toast after successful save", async () => {
		const user = userEvent.setup();
		render(<SettingsModels />);

		await waitFor(() => {
			expect(screen.getByText(/reasoning/i)).toBeInTheDocument();
		});

		const providerSelects = screen.getAllByRole("combobox", { name: /provider/i });
		if (providerSelects.length > 0) {
			await user.selectOptions(providerSelects[0] as HTMLElement, "openrouter");

			await waitFor(() => {
				expect(mockShowToast).toHaveBeenCalled();
			});
		}
	});
});
