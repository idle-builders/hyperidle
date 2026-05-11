/**
 * N4 — SettingsPanel Credentials tab tests
 *
 * AC coverage:
 *  - Credentials tab is present in the tab list
 *  - Credentials tab renders when window.__HYPERIDLE__ is available
 *  - Shows "credential storage available in desktop app" message when __HYPERIDLE__ is undefined
 *  - Renders each stored credential as a masked row: name + masked value + Remove button
 *  - Masked value shows only last 4 chars: ••••sk-1234 format
 *  - "Add credential" form has name input (text) and value input (password type)
 *  - Clicking Save calls window.__HYPERIDLE__.credentials.set(name, value)
 *  - Shows inline warning when set() returns { stored: false, warning: "..." }
 *  - Remove button calls window.__HYPERIDLE__.credentials.delete(name)
 *  - Labels are harness-agnostic: no "Anthropic" or "Claude" or "OpenAI" text
 *  - SettingsPanel accepts an initialTab prop to pre-select the credentials tab
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type SettingsData, SettingsPanel } from "../SettingsPanel.js";

// ---------------------------------------------------------------------------
// Minimal SettingsData fixture
// ---------------------------------------------------------------------------
const SETTINGS: SettingsData = {
	profile: { name: "Test User", email: "test@example.com", avatarUrl: "" },
	products: [],
	agents: [],
	notifications: {
		reviewAlerts: false,
		costAlerts: false,
		blockerAlerts: false,
		quietHoursStart: "22:00",
		quietHoursEnd: "08:00",
		mutedProducts: [],
	},
	appearance: { density: "default", theme: "dark" },
};

const NOOP_SAVE = vi.fn().mockResolvedValue(undefined);

// ---------------------------------------------------------------------------
// Mock window.__HYPERIDLE__ for testing
// ---------------------------------------------------------------------------
function setupElectronBridge(overrides?: Partial<Window["__HYPERIDLE__"]>): void {
	// @lore N4 test-bug-fix: Default credential names use neutral keys to avoid
	// conflicting with harness-agnostic assertions that check these words are absent.
	// Tests that need specific credential names override via `overrides.credentials`.
	const mockBridge: NonNullable<Window["__HYPERIDLE__"]> = {
		apiKey: "test-api-key",
		platform: "electron",
		credentials: {
			list: vi.fn().mockResolvedValue(["API_KEY_1", "SERVICE_TOKEN"]),
			get: vi.fn().mockResolvedValue(null),
			set: vi.fn().mockResolvedValue({ stored: true }),
			delete: vi.fn().mockResolvedValue(undefined),
			isEncryptionAvailable: vi.fn().mockResolvedValue(true),
		},
		shell: {
			openLogs: vi.fn().mockResolvedValue(undefined),
			openData: vi.fn().mockResolvedValue(undefined),
		},
		onOpenSettings: vi.fn().mockReturnValue(() => {}),
		...overrides,
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

describe("SettingsPanel — Credentials tab presence", () => {
	it("renders a Credentials tab in the tab list", async () => {
		setupElectronBridge();
		render(<SettingsPanel open={true} onClose={vi.fn()} onSave={NOOP_SAVE} settings={SETTINGS} />);
		expect(screen.getByRole("tab", { name: /credentials/i })).toBeInTheDocument();
	});

	it("credentials tab is the last tab (after Appearance)", async () => {
		setupElectronBridge();
		render(<SettingsPanel open={true} onClose={vi.fn()} onSave={NOOP_SAVE} settings={SETTINGS} />);
		const tabs = screen.getAllByRole("tab");
		const labels = tabs.map((t) => t.textContent?.toLowerCase() ?? "");
		const credIdx = labels.findIndex((l) => l.includes("credentials"));
		const appearIdx = labels.findIndex((l) => l.includes("appearance"));
		expect(credIdx).toBeGreaterThan(appearIdx);
	});
});

describe("SettingsPanel — Credentials tab content (with electron bridge)", () => {
	it("shows stored credential names after clicking the Credentials tab", async () => {
		setupElectronBridge({
			credentials: {
				list: vi.fn().mockResolvedValue(["MY_KEY"]),
				get: vi.fn().mockResolvedValue("sk-abc1234"),
				set: vi.fn().mockResolvedValue({ stored: true }),
				delete: vi.fn().mockResolvedValue(undefined),
				isEncryptionAvailable: vi.fn().mockResolvedValue(true),
			},
		});

		render(<SettingsPanel open={true} onClose={vi.fn()} onSave={NOOP_SAVE} settings={SETTINGS} />);

		await userEvent.click(screen.getByRole("tab", { name: /credentials/i }));
		await waitFor(() => expect(screen.getByText("MY_KEY")).toBeInTheDocument());
	});

	it("masks the credential value showing only last 4 chars (••••abcd format)", async () => {
		setupElectronBridge({
			credentials: {
				list: vi.fn().mockResolvedValue(["MY_KEY"]),
				get: vi.fn().mockResolvedValue("sk-secret1234"),
				set: vi.fn().mockResolvedValue({ stored: true }),
				delete: vi.fn().mockResolvedValue(undefined),
				isEncryptionAvailable: vi.fn().mockResolvedValue(true),
			},
		});

		render(<SettingsPanel open={true} onClose={vi.fn()} onSave={NOOP_SAVE} settings={SETTINGS} />);
		await userEvent.click(screen.getByRole("tab", { name: /credentials/i }));
		await waitFor(() => {
			// The full value should NOT be displayed; only last 4 chars are shown
			expect(screen.queryByText("sk-secret1234")).not.toBeInTheDocument();
			// Last 4 chars "1234" should appear after masking dots
			expect(screen.getByText(/•+1234/)).toBeInTheDocument();
		});
	});

	it("renders Add credential form with name (text) and value (password) inputs", async () => {
		setupElectronBridge();
		render(<SettingsPanel open={true} onClose={vi.fn()} onSave={NOOP_SAVE} settings={SETTINGS} />);
		await userEvent.click(screen.getByRole("tab", { name: /credentials/i }));
		await waitFor(() => {
			const nameInput = screen.getByLabelText(/credential name/i);
			expect(nameInput).toHaveAttribute("type", "text");
			const valueInput = screen.getByLabelText(/credential value/i);
			expect(valueInput).toHaveAttribute("type", "password");
		});
	});

	it("calls credentials.set() with correct name and value when Save is clicked", async () => {
		const setMock = vi.fn().mockResolvedValue({ stored: true });
		setupElectronBridge({
			credentials: {
				list: vi.fn().mockResolvedValue([]),
				get: vi.fn().mockResolvedValue(null),
				set: setMock,
				delete: vi.fn().mockResolvedValue(undefined),
				isEncryptionAvailable: vi.fn().mockResolvedValue(true),
			},
		});

		render(<SettingsPanel open={true} onClose={vi.fn()} onSave={NOOP_SAVE} settings={SETTINGS} />);
		await userEvent.click(screen.getByRole("tab", { name: /credentials/i }));

		await waitFor(() => screen.getByLabelText(/credential name/i));

		await userEvent.type(screen.getByLabelText(/credential name/i), "MY_KEY");
		await userEvent.type(screen.getByLabelText(/credential value/i), "super-secret");
		await userEvent.click(screen.getByRole("button", { name: /save/i }));

		await waitFor(() => {
			expect(setMock).toHaveBeenCalledWith("MY_KEY", "super-secret");
		});
	});

	it("shows inline warning when credentials.set() returns { stored: false, warning }", async () => {
		const setMock = vi.fn().mockResolvedValue({
			stored: false,
			warning: "Keychain unavailable — stored in memory only",
		});
		setupElectronBridge({
			credentials: {
				list: vi.fn().mockResolvedValue([]),
				get: vi.fn().mockResolvedValue(null),
				set: setMock,
				delete: vi.fn().mockResolvedValue(undefined),
				isEncryptionAvailable: vi.fn().mockResolvedValue(false),
			},
		});

		render(<SettingsPanel open={true} onClose={vi.fn()} onSave={NOOP_SAVE} settings={SETTINGS} />);
		await userEvent.click(screen.getByRole("tab", { name: /credentials/i }));

		await waitFor(() => screen.getByLabelText(/credential name/i));

		await userEvent.type(screen.getByLabelText(/credential name/i), "KEY");
		await userEvent.type(screen.getByLabelText(/credential value/i), "value");
		await userEvent.click(screen.getByRole("button", { name: /save/i }));

		await waitFor(() => {
			expect(screen.getByText(/keychain|memory|unavailable/i)).toBeInTheDocument();
		});
	});

	it("calls credentials.delete() when Remove button is clicked", async () => {
		const deleteMock = vi.fn().mockResolvedValue(undefined);
		setupElectronBridge({
			credentials: {
				list: vi.fn().mockResolvedValue(["TO_REMOVE"]),
				get: vi.fn().mockResolvedValue("value1234"),
				set: vi.fn().mockResolvedValue({ stored: true }),
				delete: deleteMock,
				isEncryptionAvailable: vi.fn().mockResolvedValue(true),
			},
		});

		render(<SettingsPanel open={true} onClose={vi.fn()} onSave={NOOP_SAVE} settings={SETTINGS} />);
		await userEvent.click(screen.getByRole("tab", { name: /credentials/i }));
		await waitFor(() => screen.getByText("TO_REMOVE"));

		await userEvent.click(screen.getByRole("button", { name: /remove/i }));
		await waitFor(() => {
			expect(deleteMock).toHaveBeenCalledWith("TO_REMOVE");
		});
	});
});

describe("SettingsPanel — Credentials tab without electron bridge", () => {
	it("shows browser-only message when __HYPERIDLE__ is undefined", async () => {
		removeElectronBridge();
		render(<SettingsPanel open={true} onClose={vi.fn()} onSave={NOOP_SAVE} settings={SETTINGS} />);
		await userEvent.click(screen.getByRole("tab", { name: /credentials/i }));
		await waitFor(() => {
			expect(
				screen.getByText(/credential storage is available in the desktop app/i),
			).toBeInTheDocument();
		});
	});
});

describe("SettingsPanel — harness-agnostic labels", () => {
	it("does not contain the word 'Anthropic' in the credentials tab UI", async () => {
		setupElectronBridge();
		render(<SettingsPanel open={true} onClose={vi.fn()} onSave={NOOP_SAVE} settings={SETTINGS} />);
		await userEvent.click(screen.getByRole("tab", { name: /credentials/i }));
		await waitFor(() => screen.getByLabelText(/credential name/i));
		expect(screen.queryByText(/anthropic/i)).not.toBeInTheDocument();
	});

	it("does not contain the word 'Claude' in the credentials tab UI", async () => {
		setupElectronBridge();
		render(<SettingsPanel open={true} onClose={vi.fn()} onSave={NOOP_SAVE} settings={SETTINGS} />);
		await userEvent.click(screen.getByRole("tab", { name: /credentials/i }));
		await waitFor(() => screen.getByLabelText(/credential name/i));
		expect(screen.queryByText(/\bclaude\b/i)).not.toBeInTheDocument();
	});

	it("does not contain the word 'OpenAI' in the credentials tab UI", async () => {
		setupElectronBridge();
		render(<SettingsPanel open={true} onClose={vi.fn()} onSave={NOOP_SAVE} settings={SETTINGS} />);
		await userEvent.click(screen.getByRole("tab", { name: /credentials/i }));
		await waitFor(() => screen.getByLabelText(/credential name/i));
		expect(screen.queryByText(/openai/i)).not.toBeInTheDocument();
	});
});

describe("SettingsPanel — initialTab prop", () => {
	it("pre-selects the credentials tab when initialTab='credentials'", async () => {
		setupElectronBridge();
		render(
			<SettingsPanel
				open={true}
				onClose={vi.fn()}
				onSave={NOOP_SAVE}
				settings={SETTINGS}
				initialTab="credentials"
			/>,
		);
		// Should show credentials content immediately without clicking the tab
		await waitFor(() => {
			expect(screen.getByRole("tab", { name: /credentials/i })).toHaveAttribute(
				"aria-selected",
				"true",
			);
		});
	});
});
