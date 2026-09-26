/**
 * S4 RED — SettingsWorker component tests (AC-1, AC-6, AC-7).
 *
 * AC coverage:
 *  - Without bridge (__HYPERIDLE__ undefined): renders "requires desktop app" message
 *  - With bridge, local mode (platform = "electron" and NOT shared mode): renders shared-mode required message
 *  - With bridge, shared mode, worker disabled: renders toggle (off), no status section
 *  - With bridge, shared mode, worker enabled+connected: renders toggle (on), status badge, session count, pause button
 *  - Toggle on: calls bridge.worker.enable(maxConcurrent)
 *  - Toggle off: calls bridge.worker.disable()
 *  - Pause button click: calls bridge.worker.pause()
 *  - Resume button click (when paused): calls bridge.worker.resume()
 *  - Status change via onStatusChange: re-renders with updated status
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsWorker } from "../SettingsWorker.js";

// ── Bridge helpers ────────────────────────────────────────────────────────────

interface WorkerStatus {
	enabled: boolean;
	connected: boolean;
	paused: boolean;
	activeSessions: number;
	maxConcurrent: number;
	deviceId: string | null;
	modelProviders: string[];
}

function makeWorkerBridge(overrides: Partial<WorkerStatus> = {}) {
	const defaultStatus: WorkerStatus = {
		enabled: false,
		connected: false,
		paused: false,
		activeSessions: 0,
		maxConcurrent: 1,
		deviceId: null,
		modelProviders: [],
		...overrides,
	};

	let statusChangeCallback: ((s: WorkerStatus) => void) | null = null;

	const bridge = {
		enable: vi.fn().mockResolvedValue(undefined),
		disable: vi.fn().mockResolvedValue(undefined),
		pause: vi.fn().mockResolvedValue(undefined),
		resume: vi.fn().mockResolvedValue(undefined),
		status: vi.fn().mockResolvedValue(defaultStatus),
		onStatusChange: vi.fn().mockImplementation((cb: (s: WorkerStatus) => void) => {
			statusChangeCallback = cb;
			return () => {
				statusChangeCallback = null;
			};
		}),
		// Test helper to push a status update
		_triggerStatusChange: (s: WorkerStatus) => {
			statusChangeCallback?.(s);
		},
	};

	return bridge;
}

function mockBridgeOnWindow(
	workerBridge: ReturnType<typeof makeWorkerBridge>,
	backendMode: "local" | "shared" = "shared",
) {
	Object.defineProperty(window, "__HYPERIDLE__", {
		value: {
			apiKey: "test-key",
			platform: "electron" as const,
			backendMode,
			worker: workerBridge,
			credentials: {
				set: vi.fn().mockResolvedValue({ stored: true }),
			},
			shell: {
				openLogs: vi.fn(),
				openData: vi.fn(),
				selectFolder: vi.fn(),
			},
			onOpenSettings: vi.fn(),
		},
		configurable: true,
		writable: true,
	});
}

function clearBridgeFromWindow() {
	Object.defineProperty(window, "__HYPERIDLE__", {
		value: undefined,
		configurable: true,
		writable: true,
	});
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("SettingsWorker: no bridge (web-only)", () => {
	beforeEach(() => {
		clearBridgeFromWindow();
	});

	afterEach(() => {
		clearBridgeFromWindow();
	});

	it("renders 'requires desktop app' message when no bridge", () => {
		render(<SettingsWorker />);
		expect(screen.getByText(/desktop app/i)).toBeInTheDocument();
	});
});

describe("SettingsWorker: local mode electron", () => {
	beforeEach(() => {
		const bridge = makeWorkerBridge();
		// In local mode, the backend mode is "local"
		mockBridgeOnWindow(bridge, "local");
	});

	afterEach(() => {
		clearBridgeFromWindow();
	});

	it("renders 'shared backend mode required' message in local mode", () => {
		render(<SettingsWorker />);
		expect(screen.getByText(/shared backend mode/i)).toBeInTheDocument();
	});
});

describe("SettingsWorker: shared mode, worker disabled", () => {
	let workerBridge: ReturnType<typeof makeWorkerBridge>;

	beforeEach(() => {
		workerBridge = makeWorkerBridge({ enabled: false, connected: false });
		mockBridgeOnWindow(workerBridge, "shared");
	});

	afterEach(() => {
		clearBridgeFromWindow();
		vi.restoreAllMocks();
	});

	it("renders the worker toggle in off state when disabled", async () => {
		render(<SettingsWorker />);

		await waitFor(() => {
			const toggle = screen.getByRole("switch", { name: /register.*worker/i });
			expect(toggle).not.toBeChecked();
		});
	});

	it("does not render status section when disabled", async () => {
		render(<SettingsWorker />);

		await waitFor(() => {
			expect(screen.queryByText(/connected/i)).toBeNull();
		});
	});

	it("renders maxConcurrent input when in shared mode", async () => {
		render(<SettingsWorker />);

		await waitFor(() => {
			// maxConcurrent input should be present
			expect(screen.getByRole("spinbutton")).toBeInTheDocument();
		});
	});
});

describe("SettingsWorker: shared mode, worker enabled+connected", () => {
	let workerBridge: ReturnType<typeof makeWorkerBridge>;

	beforeEach(() => {
		workerBridge = makeWorkerBridge({
			enabled: true,
			connected: true,
			paused: false,
			activeSessions: 0,
			maxConcurrent: 2,
			deviceId: "test-device-uuid",
			modelProviders: ["anthropic"],
		});
		mockBridgeOnWindow(workerBridge, "shared");
	});

	afterEach(() => {
		clearBridgeFromWindow();
		vi.restoreAllMocks();
	});

	it("renders toggle in on state when enabled", async () => {
		render(<SettingsWorker />);

		await waitFor(() => {
			const toggle = screen.getByRole("switch", { name: /register.*worker/i });
			expect(toggle).toBeChecked();
		});
	});

	it("renders 'Connected' status badge when connected", async () => {
		render(<SettingsWorker />);

		await waitFor(() => {
			expect(screen.getByText(/connected/i)).toBeInTheDocument();
		});
	});

	it("renders active session count when enabled", async () => {
		render(<SettingsWorker />);

		await waitFor(() => {
			// Should show "0 / 2" or similar
			expect(screen.getByText(/0.*\/.*2/)).toBeInTheDocument();
		});
	});

	it("renders Pause button when not paused", async () => {
		render(<SettingsWorker />);

		await waitFor(() => {
			expect(screen.getByRole("button", { name: /pause/i })).toBeInTheDocument();
		});
	});
});

describe("SettingsWorker: shared mode, worker paused", () => {
	let workerBridge: ReturnType<typeof makeWorkerBridge>;

	beforeEach(() => {
		workerBridge = makeWorkerBridge({
			enabled: true,
			connected: true,
			paused: true,
			activeSessions: 0,
			maxConcurrent: 1,
		});
		mockBridgeOnWindow(workerBridge, "shared");
	});

	afterEach(() => {
		clearBridgeFromWindow();
		vi.restoreAllMocks();
	});

	it("renders Resume button when paused", async () => {
		render(<SettingsWorker />);

		await waitFor(() => {
			expect(screen.getByRole("button", { name: /resume/i })).toBeInTheDocument();
		});
	});
});

describe("SettingsWorker: interactions", () => {
	let workerBridge: ReturnType<typeof makeWorkerBridge>;

	beforeEach(() => {
		workerBridge = makeWorkerBridge({ enabled: false, connected: false });
		mockBridgeOnWindow(workerBridge, "shared");
	});

	afterEach(() => {
		clearBridgeFromWindow();
		vi.restoreAllMocks();
	});

	it("toggling on calls bridge.worker.enable(maxConcurrent)", async () => {
		const user = userEvent.setup();
		render(<SettingsWorker />);

		await waitFor(() => {
			expect(screen.getByRole("switch", { name: /register.*worker/i })).toBeInTheDocument();
		});

		const toggle = screen.getByRole("switch", { name: /register.*worker/i });
		await user.click(toggle);

		expect(workerBridge.enable).toHaveBeenCalledWith(expect.any(Number));
	});

	it("toggling off (when enabled) calls bridge.worker.disable()", async () => {
		// Start with enabled bridge
		const enabledBridge = makeWorkerBridge({ enabled: true, connected: true });
		mockBridgeOnWindow(enabledBridge, "shared");

		const user = userEvent.setup();
		render(<SettingsWorker />);

		await waitFor(() => {
			const toggle = screen.getByRole("switch", { name: /register.*worker/i });
			expect(toggle).toBeChecked();
		});

		const toggle = screen.getByRole("switch", { name: /register.*worker/i });
		await user.click(toggle);

		expect(enabledBridge.disable).toHaveBeenCalled();
	});

	it("Pause button click calls bridge.worker.pause()", async () => {
		const enabledBridge = makeWorkerBridge({ enabled: true, connected: true, paused: false });
		mockBridgeOnWindow(enabledBridge, "shared");

		const user = userEvent.setup();
		render(<SettingsWorker />);

		await waitFor(() => {
			expect(screen.getByRole("button", { name: /pause/i })).toBeInTheDocument();
		});

		await user.click(screen.getByRole("button", { name: /pause/i }));

		expect(enabledBridge.pause).toHaveBeenCalled();
	});

	it("Resume button click calls bridge.worker.resume()", async () => {
		const pausedBridge = makeWorkerBridge({ enabled: true, connected: true, paused: true });
		mockBridgeOnWindow(pausedBridge, "shared");

		const user = userEvent.setup();
		render(<SettingsWorker />);

		await waitFor(() => {
			expect(screen.getByRole("button", { name: /resume/i })).toBeInTheDocument();
		});

		await user.click(screen.getByRole("button", { name: /resume/i }));

		expect(pausedBridge.resume).toHaveBeenCalled();
	});
});

describe("SettingsWorker: connecting state", () => {
	let workerBridge: ReturnType<typeof makeWorkerBridge>;

	beforeEach(() => {
		// Enabled but NOT yet connected → "Connecting"
		workerBridge = makeWorkerBridge({ enabled: true, connected: false, paused: false });
		mockBridgeOnWindow(workerBridge, "shared");
	});

	afterEach(() => {
		clearBridgeFromWindow();
		vi.restoreAllMocks();
	});

	it("renders 'Connecting' badge when enabled but not yet connected", async () => {
		render(<SettingsWorker />);

		await waitFor(() => {
			expect(screen.getByText(/connecting/i)).toBeInTheDocument();
		});
	});
});

describe("SettingsWorker: status change subscription", () => {
	let workerBridge: ReturnType<typeof makeWorkerBridge>;

	beforeEach(() => {
		workerBridge = makeWorkerBridge({ enabled: true, connected: false, paused: false });
		mockBridgeOnWindow(workerBridge, "shared");
	});

	afterEach(() => {
		clearBridgeFromWindow();
		vi.restoreAllMocks();
	});

	it("re-renders with updated status when onStatusChange fires", async () => {
		render(<SettingsWorker />);

		// Initially enabled but not yet connected → "Connecting" state
		await waitFor(() => {
			expect(screen.getByText(/connecting/i)).toBeInTheDocument();
		});

		// Trigger a status change to connected
		workerBridge._triggerStatusChange({
			enabled: true,
			connected: true,
			paused: false,
			activeSessions: 1,
			maxConcurrent: 2,
			deviceId: null,
			modelProviders: ["anthropic"],
		});

		await waitFor(() => {
			expect(screen.getByText(/connected/i)).toBeInTheDocument();
		});
	});
});

describe("SettingsWorker: shared backend key field", () => {
	let workerBridge: ReturnType<typeof makeWorkerBridge>;

	beforeEach(() => {
		workerBridge = makeWorkerBridge({ enabled: false, connected: false });
		mockBridgeOnWindow(workerBridge, "shared");
	});

	afterEach(() => {
		clearBridgeFromWindow();
		vi.restoreAllMocks();
	});

	function getCredentialsBridge(): { set: ReturnType<typeof vi.fn> } {
		const credentials = window.__HYPERIDLE__?.credentials;
		if (!credentials) throw new Error("credentials bridge not mocked");
		return credentials as unknown as { set: ReturnType<typeof vi.fn> };
	}

	it("saving the field calls credentials.set with the one credential name", async () => {
		const user = userEvent.setup();
		render(<SettingsWorker />);

		const input = screen.getByLabelText(/shared backend key/i);
		await user.type(input, "dummy-test-value");
		await user.click(screen.getByRole("button", { name: /save key/i }));

		expect(getCredentialsBridge().set).toHaveBeenCalledWith(
			"shared_backend_key",
			"dummy-test-value",
		);
	});

	it("surfaces the warning returned by credentials.set", async () => {
		getCredentialsBridge().set.mockResolvedValue({
			stored: false,
			warning: "Keychain unavailable — value not stored",
		});

		const user = userEvent.setup();
		render(<SettingsWorker />);

		const input = screen.getByLabelText(/shared backend key/i);
		await user.type(input, "dummy-test-value");
		await user.click(screen.getByRole("button", { name: /save key/i }));

		await waitFor(() => {
			expect(screen.getByText(/keychain unavailable/i)).toBeInTheDocument();
		});
	});

	it("never reads the value back — the bridge exposes no get method", () => {
		const credentials = window.__HYPERIDLE__?.credentials as unknown as Record<string, unknown>;
		expect(credentials.get).toBeUndefined();
	});
});
