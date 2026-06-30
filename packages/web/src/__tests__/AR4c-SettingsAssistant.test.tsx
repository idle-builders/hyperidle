/**
 * AR4c — SettingsAssistant component with harness+model selects.
 *
 * AC2 (component side): harness + model selects render from loaded data;
 * changing them marks the form dirty; save sends them in the PATCH body.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsAssistant } from "../settings/SettingsAssistant.js";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../services/api-fetch", () => ({
	apiFetch: vi.fn(),
}));

vi.mock("../services/api-fetch.js", () => ({
	apiFetch: vi.fn(),
}));

const mockApiFetch = vi.fn();

beforeEach(async () => {
	vi.resetAllMocks();
	// Re-wire both mock paths
	const mod = await import("../services/api-fetch.js");
	(mod.apiFetch as ReturnType<typeof vi.fn>).mockImplementation(mockApiFetch);
});

afterEach(() => {
	vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Default GET response
// ---------------------------------------------------------------------------

function assistantData(
	overrides: Partial<{
		systemPrompt: string | null;
		harnessType: string | null;
		modelId: string | null;
		modelProvider: string | null;
	}> = {},
) {
	return {
		id: "ast-u-demo",
		name: "Assistant",
		systemPrompt: "Default persona",
		harnessType: "builtin",
		modelId: "deepseek/deepseek-v4-flash",
		modelProvider: "openrouter",
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AR4c: SettingsAssistant — harness+model selects", () => {
	it("renders Harness and Model selects from loaded data", async () => {
		mockApiFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => assistantData({ harnessType: "builtin" }),
		});

		// Also mock GET /api/harnesses for the harness options
		mockApiFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => [
				{ type: "builtin", name: "Built-in Harness", modelProviders: ["openrouter"] },
			],
		});

		render(<SettingsAssistant userId="u-demo" />);

		await waitFor(() => {
			expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
		});

		// Harness select should render
		const harnessSelect = screen.getByRole("combobox", { name: /harness/i });
		expect(harnessSelect).toBeDefined();

		// Model select should render
		const modelSelect = screen.getByRole("combobox", { name: /model/i });
		expect(modelSelect).toBeDefined();
	});

	it("marks form dirty when harness select changes", async () => {
		mockApiFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => assistantData({ harnessType: "builtin" }),
		});
		mockApiFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => [
				{ type: "builtin", name: "Built-in Harness", modelProviders: ["openrouter"] },
			],
		});

		render(<SettingsAssistant userId="u-demo" />);

		await waitFor(() => {
			expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
		});

		const saveButton = screen.getByRole("button", { name: /save/i });
		expect(saveButton).toBeDisabled();

		// Change the harness select
		const harnessSelect = screen.getByRole("combobox", { name: /harness/i });
		await userEvent.selectOptions(harnessSelect, "");

		// Save button should now be enabled (form is dirty)
		await waitFor(() => {
			expect(saveButton).not.toBeDisabled();
		});
	});

	it("includes harnessType + modelId + modelProvider in the PATCH body on save", async () => {
		mockApiFetch.mockResolvedValueOnce({
			ok: true,
			json: async () =>
				assistantData({
					harnessType: "builtin",
					modelId: "deepseek/deepseek-v4-flash",
					modelProvider: "openrouter",
				}),
		});
		mockApiFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => [
				{ type: "builtin", name: "Built-in Harness", modelProviders: ["openrouter"] },
			],
		});
		// PATCH response
		mockApiFetch.mockResolvedValueOnce({
			ok: true,
			json: async () =>
				assistantData({
					harnessType: "builtin",
					modelId: "deepseek/deepseek-v4-flash",
					modelProvider: "openrouter",
				}),
		});

		render(<SettingsAssistant userId="u-demo" />);

		await waitFor(() => {
			expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
		});

		// Make the form dirty by changing the system prompt textarea
		const textarea = screen.getByRole("textbox", { name: /persona/i });
		await userEvent.clear(textarea);
		await userEvent.type(textarea, "Changed persona");

		const saveButton = screen.getByRole("button", { name: /save/i });
		await waitFor(() => expect(saveButton).not.toBeDisabled());
		await userEvent.click(saveButton);

		// Find the PATCH call
		await waitFor(() => {
			const calls = mockApiFetch.mock.calls;
			const patchCall = calls.find((c) => c[1]?.method === "PATCH");
			expect(patchCall).toBeDefined();
			const body = JSON.parse(patchCall![1]!.body as string) as Record<string, unknown>;
			// PATCH body must include the triple fields
			expect(body).toHaveProperty("harnessType");
			expect(body).toHaveProperty("modelId");
			expect(body).toHaveProperty("modelProvider");
		});
	});
});
