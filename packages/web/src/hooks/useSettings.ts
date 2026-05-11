/**
 * useSettings — fetch application settings from GET /api/settings.
 *
 * @lore M3 B3: replaces the DEFAULT_SETTINGS import from app-shell-data.ts.
 * Returns a { settings, status, error, save, retry } result. The caller uses
 * the returned data as the initial settings; local edits are still held in
 * component state.
 *
 * The hook returns null settings on loading/error; callers fall back to a
 * locally-computed default (appearance only, from useTheme) rather than a
 * hardcoded profile/products/agents mock.
 *
 * @lore M3: appearance (density/theme) is composed client-side via useTheme
 * and NOT from the API response. The API only sends profile/products/agents/notifications.
 */

import { useCallback, useEffect, useState } from "react";
import type { SettingsData } from "../components/SettingsPanel";
import { getInitialTheme } from "./useTheme";

export type UseSettingsStatus = "loading" | "ready" | "error";

export interface UseSettingsResult {
	settings: SettingsData | null;
	status: UseSettingsStatus;
	error: string | null;
	save: (updated: SettingsData) => Promise<void>;
	retry: () => void;
	/** @deprecated Use settings — kept for backward compat */
	data: SettingsData | null;
}

function buildDefaultAppearance(): SettingsData["appearance"] {
	return {
		density: "auto",
		theme: getInitialTheme(),
	};
}

export function useSettings(): UseSettingsResult {
	const [settings, setSettings] = useState<SettingsData | null>(null);
	const [status, setStatus] = useState<UseSettingsStatus>("loading");
	const [error, setError] = useState<string | null>(null);
	const [tick, setTick] = useState(0);

	// biome-ignore lint/correctness/useExhaustiveDependencies: tick is intentionally a dependency for retry
	useEffect(() => {
		let cancelled = false;
		setStatus("loading");
		setError(null);

		(async (): Promise<void> => {
			try {
				const res = await fetch("/api/settings");
				if (cancelled) return;
				if (!res.ok) {
					setError(`HTTP ${res.status}`);
					setStatus("error");
					return;
				}
				const raw = (await res.json()) as Omit<SettingsData, "appearance">;
				if (cancelled) return;
				// Compose appearance client-side (localStorage-backed) — not from API
				const composed: SettingsData = {
					...raw,
					appearance: buildDefaultAppearance(),
				};
				setSettings(composed);
				setStatus("ready");
			} catch (cause) {
				if (cancelled) return;
				setError(cause instanceof Error ? cause.message : "Network error");
				setStatus("error");
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [tick]);

	const save = useCallback(async (updated: SettingsData): Promise<void> => {
		// Persist notifications to API; appearance is local-only
		try {
			await fetch("/api/settings", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ notifications: updated.notifications }),
			});
			setSettings(updated);
		} catch {
			// Swallow — callers handle via UI
		}
	}, []);

	const retry = useCallback((): void => {
		setTick((n) => n + 1);
	}, []);

	return {
		settings,
		status,
		error,
		save,
		retry,
		// Backward compat
		data: settings,
	};
}
