/**
 * SettingsBackend — Backend settings section.
 *
 * P4 Task 10: Settings section (AC-12, AC-19)
 * Shows current backend mode and switch button with restart warning.
 *
 * - In web/browser mode: shows info that switching requires the desktop app.
 * - In desktop (Electron) mode: shows current mode badge, description, switch button,
 *   and restart warning.
 *
 * @lore P4: Backend mode switching requires the Electron bridge (window.__HYPERIDLE__).
 * In pure web mode the desktop-only message is shown. This avoids dangling UI that
 * would be non-functional without the bridge.
 */

import type { JSX } from "react";

function isElectron(): boolean {
	return typeof window !== "undefined" && window.__HYPERIDLE__ !== undefined;
}

export function SettingsBackend(): JSX.Element {
	const electron = isElectron();

	if (!electron) {
		return (
			<div className="flex flex-col gap-3">
				<p className="text-sm text-[var(--text-mid)]">
					Backend mode can only be changed in the desktop app.
				</p>
				<p className="text-xs text-[var(--text-lo)]">
					The web version always connects to the embedded local server.
				</p>
			</div>
		);
	}

	// Electron mode — expose mode badge + switch button
	// @lore P4: In Electron, platform is exposed via window.__HYPERIDLE__.platform.
	// Mode is "local" (embedded server) or "shared" (remote). We default to "local"
	// if not set; the actual mode switching is handled by the main process restart.
	const platform = window.__HYPERIDLE__?.platform ?? "electron";
	const isLocal = platform !== "shared";
	const modeLabel = isLocal ? "Local" : "Shared";
	const modeDescription = isLocal
		? "The app is running an embedded server on this machine."
		: "Connected to a shared backend server.";
	const switchLabel = isLocal ? "Switch to Shared Backend" : "Switch to Local";

	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center gap-3">
				<span className="text-sm text-[var(--text-mid)]">Current mode</span>
				<span className="badge badge-sm badge-ghost font-mono">{modeLabel}</span>
			</div>

			<p className="text-sm text-[var(--text-mid)]">{modeDescription}</p>

			<div className="flex items-center gap-3">
				<button
					type="button"
					className="btn btn-ghost btn-sm"
					disabled
					title="Switching requires an app restart — support coming soon"
				>
					{switchLabel}
				</button>
			</div>

			<p className="text-xs text-[var(--text-lo)]">Switching requires a restart.</p>
		</div>
	);
}
