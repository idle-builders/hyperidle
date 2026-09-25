/**
 * S4: Worker settings section.
 *
 * Conditional rendering per architecture-critique Warning 3:
 * - Non-electron (no bridge): show "requires desktop app"
 * - Electron, local mode (backendMode != "shared"): show "requires shared backend mode"
 * - Electron, shared mode: show worker toggle, status, pause/resume
 *
 * Mounted unconditionally in SettingsPage's Backend section; these three guards
 * are the only gate.
 */

import { type JSX, useEffect, useState } from "react";
import { Button, Input, StatusChip, Toggle } from "../ds";

interface WorkerStatus {
	enabled: boolean;
	connected: boolean;
	paused: boolean;
	activeSessions: number;
	maxConcurrent: number;
	deviceId: string | null;
	modelProviders: string[];
}

/** The one credential name the desktop bridge accepts. */
const SHARED_BACKEND_KEY_NAME = "shared_backend_key";

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
 * StatusChip for the worker connection state.
 * Pinned color map (design §1.9):
 * - connected → healthy (green): steady state
 * - connecting → paused (blue/info): transitional, calmer than disconnected
 * - disconnected → behind (amber): attention-needed, device should be connected
 *
 * @lore AG7: color=meaning: disconnected is amber (behind) NOT blue, connecting
 * is blue (paused/in-progress). Never invert: transitional must read calmer than degraded.
 */
function ConnectionStatusChip({ state }: { state: ConnectionState }): JSX.Element {
	const status = state === "connected" ? "healthy" : state === "connecting" ? "paused" : "behind";
	const label =
		state === "connected" ? "Connected" : state === "connecting" ? "Connecting" : "Disconnected";
	return <StatusChip status={status} label={label} />;
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
	const [sharedKeyInput, setSharedKeyInput] = useState("");
	const [sharedKeyResult, setSharedKeyResult] = useState<{
		stored: boolean;
		warning?: string;
	} | null>(null);

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
			<div className="flex flex-col gap-[12px]">
				<p className="type-small  text-[var(--text-secondary)]">
					Worker mode requires the desktop app.
				</p>
				<p className="type-metadata  text-[var(--text-tertiary)]">
					Install HyperIdle on your machine to register it as a worker.
				</p>
			</div>
		);
	}

	// Electron, but not in shared mode
	if (!sharedMode) {
		return (
			<div className="flex flex-col gap-[12px]">
				<p className="type-small  text-[var(--text-secondary)]">
					Worker mode is only available in shared backend mode.
				</p>
				<p className="type-metadata  text-[var(--text-tertiary)]">
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

	// @lore The field is write-only: it calls credentials.set and shows the
	// {stored, warning} result, and never reads the key back. The worker
	// reads the same encrypted file directly (main.ts's readCredentialFromStore)
	// on the next worker:enable, so this is the only place the key is entered.
	const handleSaveSharedKey = async (): Promise<void> => {
		const credentials = window.__HYPERIDLE__?.credentials;
		if (!credentials) return;
		const result = await credentials.set(SHARED_BACKEND_KEY_NAME, sharedKeyInput);
		setSharedKeyResult(result);
	};

	return (
		<div className="flex flex-col gap-[18px]">
			{/* Shared backend key */}
			<div className="flex flex-col gap-[9px]">
				<div className="flex items-end gap-[9px]">
					<div className="w-[240px]">
						<Input
							type="password"
							label="Shared backend key"
							value={sharedKeyInput}
							onChange={(e) => setSharedKeyInput(e.target.value)}
						/>
					</div>
					<Button
						variant="ghost"
						size="sm"
						onClick={() => void handleSaveSharedKey()}
						disabled={!sharedKeyInput}
					>
						Save key
					</Button>
				</div>
				{sharedKeyResult && (
					<p
						className={`type-metadata  ${
							sharedKeyResult.stored
								? "text-[var(--status-success)]"
								: "text-[var(--status-warning)]"
						}`}
					>
						{sharedKeyResult.warning ?? "Key stored."}
					</p>
				)}
			</div>

			{/* Toggle */}
			<Toggle
				on={status.enabled}
				label="Register this device as a worker"
				onChange={() => void handleToggle()}
			/>

			{/* Max concurrent sessions */}
			<div className="flex items-center gap-[12px]">
				<span className="type-small  text-[var(--text-secondary)]">Max concurrent sessions</span>
				<div className="w-[88px]">
					<Input
						type="number"
						min={1}
						max={8}
						value={String(maxConcurrent)}
						onChange={(e) => setMaxConcurrent(Number(e.target.value))}
						aria-label="Max concurrent sessions"
					/>
				</div>
			</div>

			{/* Status section — only shown when enabled */}
			{status.enabled && (
				<div className="border-width-thin-t flex flex-col gap-[12px]  border-[var(--border-subtle)] pt-[12px]">
					{/* Connection status */}
					<div className="flex items-center gap-[12px]">
						<span className="type-small  text-[var(--text-secondary)]">Status</span>
						<ConnectionStatusChip
							state={
								status.connected ? "connected" : status.enabled ? "connecting" : "disconnected"
							}
						/>
					</div>

					{/* Active sessions */}
					<div className="flex items-center gap-[12px]">
						<span className="type-small  text-[var(--text-secondary)]">Active sessions</span>
						<span className="type-data   text-[var(--text-primary)]">
							{status.activeSessions} / {status.maxConcurrent}
						</span>
					</div>

					{/* Pause / Resume */}
					<div className="flex items-center gap-[9px]">
						{status.paused ? (
							<Button
								variant="ghost"
								size="sm"
								onClick={() => void handleResume()}
								aria-label="Resume worker"
							>
								Resume
							</Button>
						) : (
							<Button
								variant="ghost"
								size="sm"
								onClick={() => void handlePause()}
								aria-label="Pause worker"
							>
								Pause
							</Button>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
