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
 *
 * @lore AF5/S: window.__HYPERIDLE__ is typed as HyperIdleElectronBridge (window.d.ts).
 * Casting `window as Window & { __HYPERIDLE__?: T }` still intersects T with
 * HyperIdleElectronBridge, requiring the full bridge interface. Stories use partial
 * mocks for visual testing, so we cast through `unknown` to install a minimal stub
 * without needing a full bridge implementation.
 */

import { useMemo } from "react";
import { useStoryHyperIdleBridge } from "../__storybook__/use-story-globals.js";
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
export const ElectronLocalMode = (): React.JSX.Element | null => {
	const bridgeInstalled = useStoryHyperIdleBridge(
		useMemo(() => ({ backendMode: "local" as const }), []),
	);
	if (!bridgeInstalled) return null;
	return (
		<div className="p-4 w-80">
			<SettingsWorker />
		</div>
	);
};

/**
 * Electron, shared mode — worker disabled (default state after connecting to a shared backend).
 */
export const SharedModeDisabled = (): React.JSX.Element | null => {
	const bridgeInstalled = useStoryHyperIdleBridge(
		useMemo(
			() => ({
				backendMode: "shared",
				worker: {
					enable: async (_n: number) => {},
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
					onStatusChange: (_cb) => () => {},
				},
			}),
			[],
		),
	);
	if (!bridgeInstalled) return null;
	return (
		<div className="p-4 w-80">
			<SettingsWorker />
		</div>
	);
};

/**
 * Electron, shared mode — worker enabled but not yet connected (connecting state).
 */
export const SharedModeConnecting = (): React.JSX.Element | null => {
	const bridgeInstalled = useStoryHyperIdleBridge(
		useMemo(
			() => ({
				backendMode: "shared",
				worker: {
					enable: async (_n: number) => {},
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
					onStatusChange: (_cb) => () => {},
				},
			}),
			[],
		),
	);
	if (!bridgeInstalled) return null;
	return (
		<div className="p-4 w-80">
			<SettingsWorker />
		</div>
	);
};

/**
 * Electron, shared mode — worker enabled and connected, 2 active sessions.
 */
export const SharedModeConnected = (): React.JSX.Element | null => {
	const bridgeInstalled = useStoryHyperIdleBridge(
		useMemo(
			() => ({
				backendMode: "shared",
				worker: {
					enable: async (_n: number) => {},
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
					onStatusChange: (_cb) => () => {},
				},
			}),
			[],
		),
	);
	if (!bridgeInstalled) return null;
	return (
		<div className="p-4 w-80">
			<SettingsWorker />
		</div>
	);
};

/**
 * Electron, shared mode — worker enabled but paused (no new sessions accepted).
 */
export const SharedModePaused = (): React.JSX.Element | null => {
	const bridgeInstalled = useStoryHyperIdleBridge(
		useMemo(
			() => ({
				backendMode: "shared",
				worker: {
					enable: async (_n: number) => {},
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
					onStatusChange: (_cb) => () => {},
				},
			}),
			[],
		),
	);
	if (!bridgeInstalled) return null;
	return (
		<div className="p-4 w-80">
			<SettingsWorker />
		</div>
	);
};
