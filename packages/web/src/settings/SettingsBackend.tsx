/**
 * SettingsBackend — Backend settings section.
 *
 * P4 Task 10: Settings section (AC-12, AC-19)
 * Shows current backend mode label + hint. Matches settings.html mockup.
 *
 * @lore P4: Backend mode switching requires the Electron bridge (window.__HYPERIDLE__).
 * In pure web mode the desktop-only message is shown. This avoids dangling UI that
 * would be non-functional without the bridge.
 * @lore visual-parity: Simplified to match HTML mockup which shows mode as a plain
 * text label (13px, text-secondary) with a hint below — no badge or switch button.
 */

import type { JSX } from "react";

function isElectron(): boolean {
	return typeof window !== "undefined" && window.__HYPERIDLE__ !== undefined;
}

export function SettingsBackend(): JSX.Element {
	const electron = isElectron();

	const platform = electron ? (window.__HYPERIDLE__?.platform ?? "electron") : null;
	const isLocal = !platform || platform !== "shared";
	const modeLabel = isLocal ? "Local (laptop)" : "Shared (remote)";
	const modeHint = isLocal
		? "Agent sessions run locally on this machine."
		: "Connected to a shared backend server.";

	return (
		<div className="flex flex-col gap-[6px] max-w-[400px]">
			<span className="text-[13px] font-[500] text-[var(--text-primary)]">Mode</span>
			<span className="text-[13px] text-[var(--text-secondary)]">{modeLabel}</span>
			<span className="text-[12px] text-[var(--text-tertiary)]">{modeHint}</span>
		</div>
	);
}
