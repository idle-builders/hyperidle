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

// @lore: ConnectionStatusChip — disconnected=amber(behind) not blue; connecting=blue(paused); transitional must read calmer than degraded; do not invert
function ConnectionStatusChip({ state }: { state: ConnectionState }): JSX.Element {
	const status = state === "connected" ? "healthy" : state === "connecting" ? "paused" : "behind";
	const label =
		state === "connected" ? "Connected" : state === "connecting" ? "Connecting" : "Disconnected";
	return <StatusChip status={status} label={label} />;
}

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

	// @lore: shared key field — write-only; never read back; worker reads encrypted file directly on next enable
	const handleSaveSharedKey = async (): Promise<void> => {
		const credentials = window.__HYPERIDLE__?.credentials;
		if (!credentials) return;
		const result = await credentials.set(SHARED_BACKEND_KEY_NAME, sharedKeyInput);
		setSharedKeyResult(result);
	};

	return (
		<div className="flex flex-col gap-[18px]">
			{/* shared backend key */}
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

			{/* toggle */}
			<Toggle
				on={status.enabled}
				label="Register this device as a worker"
				onChange={() => void handleToggle()}
			/>

			{/* max concurrent sessions */}
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

			{/* status section — only shown when enabled */}
			{status.enabled && (
				<div className="border-width-thin-t flex flex-col gap-[12px]  border-[var(--border-subtle)] pt-[12px]">
					{/* connection status */}
					<div className="flex items-center gap-[12px]">
						<span className="type-small  text-[var(--text-secondary)]">Status</span>
						<ConnectionStatusChip
							state={
								status.connected ? "connected" : status.enabled ? "connecting" : "disconnected"
							}
						/>
					</div>

					{/* active sessions */}
					<div className="flex items-center gap-[12px]">
						<span className="type-small  text-[var(--text-secondary)]">Active sessions</span>
						<span className="type-data   text-[var(--text-primary)]">
							{status.activeSessions} / {status.maxConcurrent}
						</span>
					</div>

					{/* pause / resume */}
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
