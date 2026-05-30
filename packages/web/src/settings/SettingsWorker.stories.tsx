/**
 * Stories for SettingsWorker.
 *
 * Covers all rendering paths:
 * 1. No electron bridge (web-only)
 * 2. Electron, local mode
 * 3. Electron, shared mode — disabled worker
 * 4. Electron, shared mode — enabled worker (connecting — enabled but not yet connected)
 * 5. Electron, shared mode — enabled worker (connected)
 * 6. Electron, shared mode — enabled worker (paused)
 */

import { SettingsWorker } from "./SettingsWorker";

export default {
	title: "SettingsWorker",
	tier: "3" as const,
};

/**
 * Running in a plain browser — no electron bridge present.
 */
export const NoBridge = (): React.JSX.Element => {
	// Render without any window.__HYPERIDLE__ override — simulates web-only context.
	return (
		<div className="p-4 w-80">
			<SettingsWorker />
		</div>
	);
};

/**
 * Electron, local backend mode — worker tab visible but unusable.
 *
 * Sets window.__HYPERIDLE__.backendMode = "local" before rendering.
 */
export const ElectronLocalMode = (): React.JSX.Element => {
	if (typeof window !== "undefined") {
		(window as Window & { __HYPERIDLE__?: { backendMode: string } }).__HYPERIDLE__ = {
			backendMode: "local",
		};
	}
	return (
		<div className="p-4 w-80">
			<SettingsWorker />
		</div>
	);
};

/**
 * Electron, shared mode — worker disabled (default state after connecting to a shared backend).
 */
export const SharedModeDisabled = (): React.JSX.Element => {
	if (typeof window !== "undefined") {
		(
			window as Window & {
				__HYPERIDLE__?: {
					backendMode: string;
					worker: {
						enable: (n: number) => Promise<void>;
						disable: () => Promise<void>;
						pause: () => Promise<void>;
						resume: () => Promise<void>;
						status: () => Promise<{
							enabled: boolean;
							connected: boolean;
							paused: boolean;
							activeSessions: number;
							maxConcurrent: number;
							deviceId: string | null;
							modelProviders: string[];
						}>;
						onStatusChange: (cb: (s: unknown) => void) => () => void;
					};
				};
			}
		).__HYPERIDLE__ = {
			backendMode: "shared",
			worker: {
				enable: async () => {},
				disable: async () => {},
				pause: async () => {},
				resume: async () => {},
				status: async () => ({
					enabled: false,
					connected: false,
					paused: false,
					activeSessions: 0,
					maxConcurrent: 1,
					deviceId: null,
					modelProviders: [],
				}),
				onStatusChange: () => () => {},
			},
		};
	}
	return (
		<div className="p-4 w-80">
			<SettingsWorker />
		</div>
	);
};

/**
 * Electron, shared mode — worker enabled but not yet connected (connecting state).
 */
export const SharedModeConnecting = (): React.JSX.Element => {
	if (typeof window !== "undefined") {
		(
			window as Window & {
				__HYPERIDLE__?: {
					backendMode: string;
					worker: {
						enable: (n: number) => Promise<void>;
						disable: () => Promise<void>;
						pause: () => Promise<void>;
						resume: () => Promise<void>;
						status: () => Promise<{
							enabled: boolean;
							connected: boolean;
							paused: boolean;
							activeSessions: number;
							maxConcurrent: number;
							deviceId: string | null;
							modelProviders: string[];
						}>;
						onStatusChange: (cb: (s: unknown) => void) => () => void;
					};
				};
			}
		).__HYPERIDLE__ = {
			backendMode: "shared",
			worker: {
				enable: async () => {},
				disable: async () => {},
				pause: async () => {},
				resume: async () => {},
				status: async () => ({
					enabled: true,
					connected: false,
					paused: false,
					activeSessions: 0,
					maxConcurrent: 1,
					deviceId: "device-abc123",
					modelProviders: ["anthropic"],
				}),
				onStatusChange: () => () => {},
			},
		};
	}
	return (
		<div className="p-4 w-80">
			<SettingsWorker />
		</div>
	);
};

/**
 * Electron, shared mode — worker enabled and connected, 2 active sessions.
 */
export const SharedModeConnected = (): React.JSX.Element => {
	if (typeof window !== "undefined") {
		(
			window as Window & {
				__HYPERIDLE__?: {
					backendMode: string;
					worker: {
						enable: (n: number) => Promise<void>;
						disable: () => Promise<void>;
						pause: () => Promise<void>;
						resume: () => Promise<void>;
						status: () => Promise<{
							enabled: boolean;
							connected: boolean;
							paused: boolean;
							activeSessions: number;
							maxConcurrent: number;
							deviceId: string | null;
							modelProviders: string[];
						}>;
						onStatusChange: (cb: (s: unknown) => void) => () => void;
					};
				};
			}
		).__HYPERIDLE__ = {
			backendMode: "shared",
			worker: {
				enable: async () => {},
				disable: async () => {},
				pause: async () => {},
				resume: async () => {},
				status: async () => ({
					enabled: true,
					connected: true,
					paused: false,
					activeSessions: 2,
					maxConcurrent: 4,
					deviceId: "device-abc123",
					modelProviders: ["anthropic"],
				}),
				onStatusChange: () => () => {},
			},
		};
	}
	return (
		<div className="p-4 w-80">
			<SettingsWorker />
		</div>
	);
};

/**
 * Electron, shared mode — worker enabled but paused (no new sessions accepted).
 */
export const SharedModePaused = (): React.JSX.Element => {
	if (typeof window !== "undefined") {
		(
			window as Window & {
				__HYPERIDLE__?: {
					backendMode: string;
					worker: {
						enable: (n: number) => Promise<void>;
						disable: () => Promise<void>;
						pause: () => Promise<void>;
						resume: () => Promise<void>;
						status: () => Promise<{
							enabled: boolean;
							connected: boolean;
							paused: boolean;
							activeSessions: number;
							maxConcurrent: number;
							deviceId: string | null;
							modelProviders: string[];
						}>;
						onStatusChange: (cb: (s: unknown) => void) => () => void;
					};
				};
			}
		).__HYPERIDLE__ = {
			backendMode: "shared",
			worker: {
				enable: async () => {},
				disable: async () => {},
				pause: async () => {},
				resume: async () => {},
				status: async () => ({
					enabled: true,
					connected: true,
					paused: true,
					activeSessions: 0,
					maxConcurrent: 2,
					deviceId: "device-abc123",
					modelProviders: ["anthropic"],
				}),
				onStatusChange: () => () => {},
			},
		};
	}
	return (
		<div className="p-4 w-80">
			<SettingsWorker />
		</div>
	);
};
