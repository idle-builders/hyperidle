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
