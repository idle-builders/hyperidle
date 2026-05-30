/**
 * S4: Worker settings section.
 *
 * Conditional rendering per architecture-critique Warning 3:
 * - Non-electron (no bridge): show "requires desktop app"
 * - Electron, local mode: show "requires shared backend mode"
 * - Electron, shared mode: show worker toggle, status, pause/resume
 *
 * @lore S4 architecture-critique W3: The worker nav item is filtered out of
 * SETTINGS_SECTIONS in AppShell.tsx when the worker bridge is unavailable or
 * the app is in local mode. The content here guards the same conditions for
 * safety, but the nav item itself is not always rendered.
 */

import { type JSX, useEffect, useState } from "react";

interface WorkerStatus {
	enabled: boolean;
	connected: boolean;
	paused: boolean;
	activeSessions: number;
	maxConcurrent: number;
	deviceId: string | null;
	modelProviders: string[];
}

function isElectron(): boolean {
	return typeof window !== "undefined" && window.__HYPERIDLE__ !== undefined;
}

function isSharedMode(): boolean {
	return typeof window !== "undefined" && window.__HYPERIDLE__?.backendMode === "shared";
}

const DEFAULT_STATUS: WorkerStatus = {
	enabled: false,
	connected: false,
	paused: false,
	activeSessions: 0,
	maxConcurrent: 1,
	deviceId: null,
	modelProviders: [],
};

type ConnectionState = "connected" | "connecting" | "disconnected";

/**
 * Status badge for the worker connection state.
 * Three states: connected (green), connecting (warning), disconnected (ghost).
 */
function ConnectionBadge({ state }: { state: ConnectionState }): JSX.Element {
	const badgeClass =
		state === "connected"
			? "badge-success"
			: state === "connecting"
				? "badge-warning"
				: "badge-ghost";
	const label =
		state === "connected" ? "Connected" : state === "connecting" ? "Connecting" : "Disconnected";
	return (
		<span className={`badge badge-sm ${badgeClass}`} role="status">
			{label}
		</span>
	);
}

/**
 * S4: Worker settings section component.
 *
 * Renders the appropriate content based on whether the bridge is available
 * and the current backend mode.
 */
export function SettingsWorker(): JSX.Element {
	const electron = isElectron();
	const sharedMode = isSharedMode();

	const [status, setStatus] = useState<WorkerStatus>(DEFAULT_STATUS);
	const [maxConcurrent, setMaxConcurrent] = useState(1);

	// Load initial status and subscribe to changes (shared mode only)
	useEffect(() => {
		if (!(electron && sharedMode)) return;

		const bridge = window.__HYPERIDLE__?.worker;
		if (!bridge) return;

		// Load initial status
		void bridge.status().then((s) => {
			setStatus(s);
			setMaxConcurrent(s.maxConcurrent);
		});

		// Subscribe to status changes
		const unsubscribe = bridge.onStatusChange((s) => {
			setStatus(s);
		});

		return unsubscribe;
	}, [electron, sharedMode]);

	// Non-electron: no bridge available
	if (!electron) {
		return (
			<div className="flex flex-col gap-3">
				<p className="text-sm text-[var(--text-mid)]">Worker mode requires the desktop app.</p>
				<p className="text-xs text-[var(--text-lo)]">
					Install HyperIdle on your machine to register it as a worker.
				</p>
			</div>
		);
	}

	// Electron, but not in shared mode
	if (!sharedMode) {
		return (
			<div className="flex flex-col gap-3">
				<p className="text-sm text-[var(--text-mid)]">
					Worker mode is only available in shared backend mode.
				</p>
				<p className="text-xs text-[var(--text-lo)]">
					Switch to a shared backend server to register this device as a worker.
				</p>
			</div>
		);
	}

	const bridge = window.__HYPERIDLE__?.worker;

	const handleToggle = async (): Promise<void> => {
		if (!bridge) return;
		if (status.enabled) {
			await bridge.disable();
			setStatus((s) => ({ ...s, enabled: false, connected: false }));
		} else {
			await bridge.enable(maxConcurrent);
			setStatus((s) => ({ ...s, enabled: true }));
		}
	};

	const handlePause = async (): Promise<void> => {
		if (!bridge) return;
		await bridge.pause();
		setStatus((s) => ({ ...s, paused: true }));
	};

	const handleResume = async (): Promise<void> => {
		if (!bridge) return;
		await bridge.resume();
		setStatus((s) => ({ ...s, paused: false }));
	};

	return (
		<div className="flex flex-col gap-4">
			{/* Toggle */}
			<div className="flex items-center gap-3">
				<label className="flex items-center gap-2 cursor-pointer">
					<input
						type="checkbox"
						className="toggle toggle-sm"
						checked={status.enabled}
						onChange={() => void handleToggle()}
						aria-label="Register this device as a worker"
					/>
					<span className="text-sm text-[var(--text-mid)]">Register this device as a worker</span>
				</label>
			</div>

			{/* Max concurrent sessions */}
			<div className="flex items-center gap-3">
				<span className="text-sm text-[var(--text-mid)]">Max concurrent sessions</span>
				<input
					type="number"
					className="input input-xs input-bordered w-16"
					min={1}
					max={8}
					value={maxConcurrent}
					onChange={(e) => setMaxConcurrent(Number(e.target.value))}
					aria-label="Max concurrent sessions"
				/>
			</div>

			{/* Status section — only shown when enabled */}
			{status.enabled && (
				<div className="flex flex-col gap-3 border-t border-base-300 pt-3">
					{/* Connection status */}
					<div className="flex items-center gap-3">
						<span className="text-sm text-[var(--text-mid)]">Status</span>
						<ConnectionBadge
							state={
								status.connected ? "connected" : status.enabled ? "connecting" : "disconnected"
							}
						/>
					</div>

					{/* Active sessions */}
					<div className="flex items-center gap-3">
						<span className="text-sm text-[var(--text-mid)]">Active sessions</span>
						<span className="text-sm font-mono text-[var(--text-hi)]">
							{status.activeSessions} / {status.maxConcurrent}
						</span>
					</div>

					{/* Pause / Resume */}
					<div className="flex items-center gap-2">
						{status.paused ? (
							<button
								type="button"
								className="btn btn-ghost btn-sm"
								onClick={() => void handleResume()}
								aria-label="Resume worker"
							>
								Resume
							</button>
						) : (
							<button
								type="button"
								className="btn btn-ghost btn-sm"
								onClick={() => void handlePause()}
								aria-label="Pause worker"
							>
								Pause
							</button>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
