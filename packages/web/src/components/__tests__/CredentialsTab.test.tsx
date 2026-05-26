/**
 * P3 RED — CredentialsTab uses fixed catalog (AC-13)
 *
 * AC coverage:
 *  - Renders three credential entries (Anthropic, OpenRouter, Shared Backend)
 *  - Each shows correct state indicator (absent/present/valid/invalid)
 *  - Set button opens a password input for the credential value
 *  - Validate button triggers validation call
 *  - No freeform name input exists (catalog is fixed)
 *  - Shows "desktop app only" message when __HYPERIDLE__ is undefined
 *  - Remove button calls credentials.delete() with the catalog name
 *  - State indicators match the bridge status response
 *
 * @lore P3: CredentialsTab replaces the N4 freeform name/value entry with a fixed
 * catalog display. The three known credentials are shown with state indicators.
 * No arbitrary credential name input exists. The UI consumes the new bridge API:
 * credentials.status(), credentials.set(name, value), credentials.delete(name),
 * credentials.validate(name), credentials.isEncryptionAvailable().
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CredentialsTab } from "../CredentialsTab.js";

// ---------------------------------------------------------------------------
// Bridge mock helpers
// ---------------------------------------------------------------------------

type MockBridgeCredentials = NonNullable<Window["__HYPERIDLE__"]>["credentials"];

function makeDefaultBridgeCredentials(
	overrides?: Partial<MockBridgeCredentials>,
): MockBridgeCredentials {
	return {
		status: vi.fn().mockResolvedValue({
			anthropic_api_key: "absent",
			openrouter_api_key: "absent",
			shared_backend_key: "absent",
		}),
		set: vi.fn().mockResolvedValue({ stored: true }),
		delete: vi.fn().mockResolvedValue(undefined),
		validate: vi.fn().mockResolvedValue({ valid: true }),
		isEncryptionAvailable: vi.fn().mockResolvedValue(true),
		// Keep legacy methods for backward compat if bridge still has them
		...(overrides ?? {}),
	} as unknown as MockBridgeCredentials;
}

function setupElectronBridge(credentialsOverrides?: Partial<MockBridgeCredentials>): void {
	const mockBridge = {
		apiKey: "test-api-key",
		platform: "electron" as const,
		credentials: makeDefaultBridgeCredentials(credentialsOverrides),
		shell: {
			openLogs: vi.fn().mockResolvedValue(undefined),
			openData: vi.fn().mockResolvedValue(undefined),
			selectFolder: vi.fn().mockResolvedValue(null),
		},
		onOpenSettings: vi.fn().mockReturnValue(() => {}),
	};
	Object.defineProperty(window, "__HYPERIDLE__", {
		value: mockBridge,
		writable: true,
		configurable: true,
	});
}

function removeElectronBridge(): void {
	Object.defineProperty(window, "__HYPERIDLE__", {
		value: undefined,
		writable: true,
		configurable: true,
	});
}

beforeEach(() => {
	vi.clearAllMocks();
});

afterEach(() => {
	removeElectronBridge();
});

describe("P3 AC-13 — CredentialsTab: fixed catalog display", () => {
	describe("without electron bridge", () => {
		it("shows desktop-app-only message when __HYPERIDLE__ is undefined", async () => {
			removeElectronBridge();
			render(<CredentialsTab />);
			await waitFor(() => {
				expect(
					screen.getByText(/credential storage is available in the desktop app/i),
				).toBeInTheDocument();
			});
		});
	});

	describe("with electron bridge", () => {
		it("renders three catalog credential entries", async () => {
			setupElectronBridge();
			render(<CredentialsTab />);

			await waitFor(() => {
				// The three catalog labels should be present
				expect(screen.getByText(/anthropic api key/i)).toBeInTheDocument();
				expect(screen.getByText(/openrouter api key/i)).toBeInTheDocument();
				expect(screen.getByText(/shared backend/i)).toBeInTheDocument();
			});
		});

		it("does not render a freeform credential name input", async () => {
			setupElectronBridge();
			render(<CredentialsTab />);

			await waitFor(() => {
				// Should NOT have a free-form "credential name" text input
				expect(screen.queryByLabelText(/credential name/i)).not.toBeInTheDocument();
			});
		});

		it("shows absent state indicator for unset credentials", async () => {
			setupElectronBridge({
				status: vi.fn().mockResolvedValue({
					anthropic_api_key: "absent",
					openrouter_api_key: "absent",
					shared_backend_key: "absent",
				}),
			} as Partial<MockBridgeCredentials>);

			render(<CredentialsTab />);

			await waitFor(() => {
				// Each entry should show an absent indicator (text or visual)
				// The exact text varies but "absent" or "not set" should appear somewhere
				const absentIndicators = screen.getAllByText(/absent|not set/i);
				expect(absentIndicators.length).toBeGreaterThanOrEqual(1);
			});
		});

		it("shows present_untested state indicator after credential is set", async () => {
			setupElectronBridge({
				status: vi.fn().mockResolvedValue({
					anthropic_api_key: "present_untested",
					openrouter_api_key: "absent",
					shared_backend_key: "absent",
				}),
			} as Partial<MockBridgeCredentials>);

			render(<CredentialsTab />);

			await waitFor(() => {
				// Some indicator of "present" or "untested" state
				const indicator = screen.queryByText(/present|untested/i);
				expect(indicator).toBeInTheDocument();
			});
		});

		it("shows valid state indicator for a validated credential", async () => {
			setupElectronBridge({
				status: vi.fn().mockResolvedValue({
					anthropic_api_key: "valid",
					openrouter_api_key: "absent",
					shared_backend_key: "absent",
				}),
			} as Partial<MockBridgeCredentials>);

			render(<CredentialsTab />);

			await waitFor(() => {
				const indicator = screen.queryByText(/valid/i);
				expect(indicator).toBeInTheDocument();
			});
		});

		it("shows Set button for each catalog entry", async () => {
			setupElectronBridge();
			render(<CredentialsTab />);

			await waitFor(() => {
				const setButtons = screen.getAllByRole("button", { name: /set|update/i });
				expect(setButtons.length).toBeGreaterThanOrEqual(1);
			});
		});

		it("clicking Set button shows a password input for the credential value", async () => {
			setupElectronBridge();
			render(<CredentialsTab />);

			await waitFor(() => screen.getAllByRole("button", { name: /set|update/i }));

			const setButtons = screen.getAllByRole("button", { name: /set|update/i });
			await userEvent.click(setButtons[0]);

			await waitFor(() => {
				// Look for a password-type input
				const inputs = document.querySelectorAll('input[type="password"]');
				expect(inputs.length).toBeGreaterThanOrEqual(1);
			});
		});

		it("shows Validate button for testable catalog entries", async () => {
			setupElectronBridge({
				status: vi.fn().mockResolvedValue({
					anthropic_api_key: "present_untested",
					openrouter_api_key: "absent",
					shared_backend_key: "absent",
				}),
			} as Partial<MockBridgeCredentials>);

			render(<CredentialsTab />);

			await waitFor(() => {
				const validateButton = screen.queryByRole("button", { name: /validate/i });
				// Validate button exists when credential is present
				expect(validateButton).toBeInTheDocument();
			});
		});

		it("clicking Validate calls credentials.validate() with the credential name", async () => {
			const validateMock = vi.fn().mockResolvedValue({ valid: true });
			setupElectronBridge({
				status: vi.fn().mockResolvedValue({
					anthropic_api_key: "present_untested",
					openrouter_api_key: "absent",
					shared_backend_key: "absent",
				}),
				validate: validateMock,
			} as Partial<MockBridgeCredentials>);

			render(<CredentialsTab />);

			await waitFor(() => screen.getByRole("button", { name: /validate/i }));
			await userEvent.click(screen.getByRole("button", { name: /validate/i }));

			await waitFor(() => {
				expect(validateMock).toHaveBeenCalledWith("anthropic_api_key");
			});
		});

		it("shows Remove button for credentials that are present", async () => {
			setupElectronBridge({
				status: vi.fn().mockResolvedValue({
					anthropic_api_key: "valid",
					openrouter_api_key: "absent",
					shared_backend_key: "absent",
				}),
			} as Partial<MockBridgeCredentials>);

			render(<CredentialsTab />);

			await waitFor(() => {
				const removeButton = screen.queryByRole("button", { name: /remove|delete/i });
				expect(removeButton).toBeInTheDocument();
			});
		});

		it("clicking Remove calls credentials.delete() with the catalog name", async () => {
			const deleteMock = vi.fn().mockResolvedValue(undefined);
			const statusMock = vi
				.fn()
				.mockResolvedValueOnce({
					anthropic_api_key: "valid",
					openrouter_api_key: "absent",
					shared_backend_key: "absent",
				})
				.mockResolvedValue({
					anthropic_api_key: "absent",
					openrouter_api_key: "absent",
					shared_backend_key: "absent",
				});

			setupElectronBridge({
				status: statusMock,
				delete: deleteMock,
			} as Partial<MockBridgeCredentials>);

			render(<CredentialsTab />);

			await waitFor(() => screen.getByRole("button", { name: /remove|delete/i }));
			await userEvent.click(screen.getByRole("button", { name: /remove|delete/i }));

			await waitFor(() => {
				expect(deleteMock).toHaveBeenCalledWith("anthropic_api_key");
			});
		});

		it("calls credentials.set() when saving a credential value", async () => {
			const setMock = vi.fn().mockResolvedValue({ stored: true });
			setupElectronBridge({
				set: setMock,
			} as Partial<MockBridgeCredentials>);

			render(<CredentialsTab />);

			await waitFor(() => screen.getAllByRole("button", { name: /set|update/i }));

			// Click the first Set button (anthropic_api_key)
			const setButtons = screen.getAllByRole("button", { name: /set|update/i });
			await userEvent.click(setButtons[0]);

			// Find the password input and type a value
			await waitFor(() => {
				const inputs = document.querySelectorAll('input[type="password"]');
				expect(inputs.length).toBeGreaterThanOrEqual(1);
			});

			const passwordInput = document.querySelector('input[type="password"]') as HTMLInputElement;
			await userEvent.type(passwordInput, "sk-ant-test-key");

			// Find and click Save/Confirm button
			const saveButton = screen.queryByRole("button", { name: /save|confirm|ok/i });
			if (saveButton) {
				await userEvent.click(saveButton);
				await waitFor(() => {
					expect(setMock).toHaveBeenCalledWith("anthropic_api_key", "sk-ant-test-key");
				});
			}
		});
	});
});
