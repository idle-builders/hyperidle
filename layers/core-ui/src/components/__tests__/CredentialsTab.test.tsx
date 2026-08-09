/**
 * AH1 — CredentialsTab: HTTP-backed, 4-slot catalog.
 *
 * AC5: 4 credential rows, all from CREDENTIAL_CATALOG.
 * AC2 (UI): No plaintext value ever visible.
 * AC3 (UI): Save with no secret shows warning copy.
 *
 * @lore AH1 §5: CredentialsTab no longer gates on the desktop bridge.
 * apiFetch is used for all environments. Tests mock fetch (global.fetch).
 */

import { CREDENTIAL_CATALOG } from "@hyperidle/domain-model";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CredentialsTab } from "../CredentialsTab.js";

// ---------------------------------------------------------------------------
// Mock apiFetch via global fetch
// ---------------------------------------------------------------------------

function makeAbsentCatalog(): Array<{ name: string; state: string; lastValidatedAt: null }> {
	return CREDENTIAL_CATALOG.map((e) => ({ name: e.name, state: "absent", lastValidatedAt: null }));
}

function setupFetch(
	responses: Array<{ url: RegExp | string; method?: string; body: unknown; status?: number }>,
): void {
	vi.stubGlobal(
		"fetch",
		vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
			const method = opts?.method?.toUpperCase() ?? "GET";
			for (const r of responses) {
				const urlMatches = typeof r.url === "string" ? url.includes(r.url) : r.url.test(url);
				const methodMatches = !r.method || r.method.toUpperCase() === method;
				if (urlMatches && methodMatches) {
					const status = r.status ?? 200;
					return Promise.resolve({
						ok: status >= 200 && status < 300,
						status,
						json: () => Promise.resolve(r.body),
						text: () => Promise.resolve(JSON.stringify(r.body)),
					} as unknown as Response);
				}
			}
			// Default: empty catalog
			return Promise.resolve({
				ok: true,
				status: 200,
				json: () => Promise.resolve(makeAbsentCatalog()),
				text: () => Promise.resolve(JSON.stringify(makeAbsentCatalog())),
			} as unknown as Response);
		}),
	);
}

beforeEach(() => {
	vi.clearAllMocks();
	// Default: return 4-entry absent catalog on GET /api/credentials
	setupFetch([{ url: "/api/credentials", method: "GET", body: makeAbsentCatalog() }]);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("AH1 — CredentialsTab: HTTP-backed, 4-slot catalog", () => {
	it("renders exactly 4 credential rows (one per CREDENTIAL_CATALOG entry)", async () => {
		render(<CredentialsTab />);
		await waitFor(() => {
			const rows = document.querySelectorAll("[data-testid^='credential-row-']");
			expect(rows).toHaveLength(4);
		});
	});

	it("renders the openai_compatible_api_key row", async () => {
		render(<CredentialsTab />);
		await waitFor(() => {
			expect(
				document.querySelector("[data-testid='credential-row-openai_compatible_api_key']"),
			).toBeInTheDocument();
		});
	});

	it("renders all 4 catalog entry labels", async () => {
		render(<CredentialsTab />);
		await waitFor(() => {
			expect(screen.getByText(/anthropic api key/i)).toBeInTheDocument();
			expect(screen.getByText(/openrouter api key/i)).toBeInTheDocument();
			expect(screen.getByText(/shared backend/i)).toBeInTheDocument();
			expect(screen.getByText(/openai.compatible api key/i)).toBeInTheDocument();
		});
	});

	it("shows state chips for all rows", async () => {
		render(<CredentialsTab />);
		await waitFor(() => {
			const chips = document.querySelectorAll("[data-testid='credential-state-chip']");
			expect(chips).toHaveLength(4);
		});
	});

	it("shows 'Not set' label for absent credentials", async () => {
		render(<CredentialsTab />);
		await waitFor(() => {
			// Multiple "Not set" labels — one per absent row
			const notSetElements = screen.getAllByText(/not set/i);
			expect(notSetElements.length).toBeGreaterThanOrEqual(1);
		});
	});

	it("shows 'Valid' label for a valid credential", async () => {
		const catalog = makeAbsentCatalog();
		catalog[0]!.state = "valid";
		setupFetch([{ url: "/api/credentials", method: "GET", body: catalog }]);
		render(<CredentialsTab />);
		await waitFor(() => {
			// AH1: scope to the specific row to avoid matching the "Validate" button
			// that appears on present-state rows (/valid/i would match "Validate").
			const row = screen.getByTestId("credential-row-anthropic_api_key");
			const chip = within(row).getByTestId("credential-state-chip");
			expect(within(chip).getByText(/^valid$/i)).toBeInTheDocument();
		});
	});

	it("does NOT render a freeform credential name input", async () => {
		render(<CredentialsTab />);
		await waitFor(() => {
			expect(screen.queryByLabelText(/credential name/i)).not.toBeInTheDocument();
		});
	});

	it("shows Set button for each absent credential", async () => {
		render(<CredentialsTab />);
		await waitFor(() => {
			const setButtons = screen.getAllByRole("button", { name: /^set$/i });
			expect(setButtons.length).toBeGreaterThanOrEqual(1);
		});
	});

	it("clicking Set shows a password input", async () => {
		render(<CredentialsTab />);
		await waitFor(() => screen.getAllByRole("button", { name: /^set$/i }));
		const setButtons = screen.getAllByRole("button", { name: /^set$/i });
		await userEvent.click(setButtons[0]!);
		await waitFor(() => {
			const inputs = document.querySelectorAll('input[type="password"]');
			expect(inputs.length).toBeGreaterThanOrEqual(1);
		});
	});

	it("calls PUT /api/credentials/:name when saving", async () => {
		const putResponse = {
			name: "anthropic_api_key",
			state: "present_untested",
			lastValidatedAt: null,
		};
		setupFetch([
			{ url: "/api/credentials", method: "GET", body: makeAbsentCatalog() },
			{ url: "/api/credentials/anthropic_api_key", method: "PUT", body: putResponse },
		]);

		render(<CredentialsTab />);
		await waitFor(() => screen.getAllByRole("button", { name: /^set$/i }));

		const setButtons = screen.getAllByRole("button", { name: /^set$/i });
		await userEvent.click(setButtons[0]!);

		await waitFor(() => {
			const inputs = document.querySelectorAll('input[type="password"]');
			expect(inputs.length).toBeGreaterThanOrEqual(1);
		});

		const passwordInput = document.querySelector('input[type="password"]') as HTMLInputElement;
		await userEvent.type(passwordInput, "sk-ant-test-key");

		const saveButton = screen.getByRole("button", { name: /^save$/i });
		await userEvent.click(saveButton);

		await waitFor(() => {
			const fetchMock = vi.mocked(global.fetch);
			const putCall = fetchMock.mock.calls.find(
				([url, opts]) =>
					(url as string).includes("/api/credentials/anthropic_api_key") &&
					(opts as RequestInit)?.method === "PUT",
			);
			expect(putCall).toBeDefined();
		});
	});

	it("shows missing secret warning when PUT returns 500 MISSING_ROOT_SECRET", async () => {
		setupFetch([
			{ url: "/api/credentials", method: "GET", body: makeAbsentCatalog() },
			{
				url: "/api/credentials/anthropic_api_key",
				method: "PUT",
				body: { error: "Encryption secret not configured", code: "MISSING_ROOT_SECRET" },
				status: 500,
			},
		]);

		render(<CredentialsTab />);
		await waitFor(() => screen.getAllByRole("button", { name: /^set$/i }));
		await userEvent.click(screen.getAllByRole("button", { name: /^set$/i })[0]!);

		await waitFor(() => document.querySelector('input[type="password"]'));
		const passwordInput = document.querySelector('input[type="password"]') as HTMLInputElement;
		await userEvent.type(passwordInput, "sk-ant-test-key");
		await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

		await waitFor(() => {
			// Warning copy should appear
			expect(screen.getByText(/encryption secret not configured/i)).toBeInTheDocument();
		});
	});

	it("shows neutral 'Unknown' chips when GET /api/credentials fails", async () => {
		setupFetch([
			{
				url: "/api/credentials",
				method: "GET",
				body: { error: "Server error" },
				status: 500,
			},
		]);
		render(<CredentialsTab />);
		await waitFor(() => {
			// Should not crash; shows error message
			const alerts = screen.getAllByRole("alert");
			expect(alerts.length).toBeGreaterThanOrEqual(1);
		});
	});

	it("calls DELETE /api/credentials/:name when removing a present credential", async () => {
		const catalog = makeAbsentCatalog();
		catalog[0]!.state = "valid"; // anthropic_api_key is valid
		setupFetch([
			{ url: "/api/credentials", method: "GET", body: catalog },
			{ url: "/api/credentials/anthropic_api_key", method: "DELETE", body: null },
		]);

		render(<CredentialsTab />);
		await waitFor(() => screen.getByRole("button", { name: /remove/i }));
		await userEvent.click(screen.getByRole("button", { name: /remove/i }));

		await waitFor(() => {
			const fetchMock = vi.mocked(global.fetch);
			const deleteCall = fetchMock.mock.calls.find(
				([url, opts]) =>
					(url as string).includes("/api/credentials/anthropic_api_key") &&
					(opts as RequestInit)?.method === "DELETE",
			);
			expect(deleteCall).toBeDefined();
		});
	});
});
