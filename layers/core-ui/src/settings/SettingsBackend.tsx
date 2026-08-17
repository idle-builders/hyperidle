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
 *
 * @lore AF15: Fixed to read backendMode from window.__HYPERIDLE__.backendMode instead
 * of the dead-code `isLocal = true` constant. Three states:
 *   - no bridge (web)              → "Web" / "Running in a browser against a remote server."
 *   - bridge, backendMode="shared" → "Shared (remote)" / "Connected to a shared backend server."
 *   - bridge, backendMode="local"|null/undefined → "Local (laptop)" / "Agent sessions run locally on this machine."
 * backendMode is already declared on the bridge type (window.d.ts line 26) — no type change needed.
 */

import type { JSX } from "react";

type BackendState = "web" | "local" | "shared";

function resolveBackendState(): BackendState {
	if (typeof window === "undefined" || window.__HYPERIDLE__ === undefined) {
		return "web";
	}
	return window.__HYPERIDLE__.backendMode === "shared" ? "shared" : "local";
}

const LABELS: Record<BackendState, { mode: string; hint: string }> = {
	web: {
		mode: "Web",
		hint: "Running in a browser against a remote server.",
	},
	local: {
		mode: "Local (laptop)",
		hint: "Agent sessions run locally on this machine.",
	},
	shared: {
		mode: "Shared (remote)",
		hint: "Connected to a shared backend server.",
	},
};

export function SettingsBackend(): JSX.Element {
	const state = resolveBackendState();
	const { mode: modeLabel, hint: modeHint } = LABELS[state];

	/* @lore FR-17: Backend uses flat section layout per settings-consistency.md.
	 * Mode is displayed as a labeled key–value pair so it reads as structured data
	 * rather than a loose list of spans. */
	return (
		<div className="flex flex-col gap-[18px]">
			<div className="flex flex-col gap-[6px]">
				<span className="type-label uppercase text-[var(--text-tertiary)]">Mode</span>
				<span className="type-small text-[var(--text-primary)]">{modeLabel}</span>
				<span className="type-metadata text-[var(--text-tertiary)]">{modeHint}</span>
			</div>
		</div>
	);
}
