/**
 * useDensity — read/write density preference to localStorage.
 *
 * @lore P4: Density persistence uses localStorage key 'hyperidle:density'.
 * In Electron, if window.__HYPERIDLE__ exposes a config API in the future,
 * it can be used; until then, localStorage is sufficient for both Electron
 * and web (per architecture Q2 decision).
 *
 * Returns { density, setDensity } where setDensity persists to localStorage.
 * AC-26: Density preference persists across page reload.
 *
 * @lore P4: Multiple instances of useDensity (e.g. AppShell + SettingsAppearance)
 * need to stay in sync when one calls setDensity. The hook listens to a custom
 * 'hyperidle:density-change' event dispatched on window for same-tab sync,
 * and to the 'storage' event for cross-tab sync. This avoids a shared context
 * while keeping AppShell's data-density attribute reactive.
 */

import { useCallback, useEffect, useState } from "react";
import type { Density } from "../components/SettingsPanel.js";

export const DENSITY_STORAGE_KEY = "hyperidle:density";
const DENSITY_CHANGE_EVENT = "hyperidle:density-change";

const VALID_DENSITIES: ReadonlySet<string> = new Set(["auto", "compact", "default", "comfortable"]);

function readDensityFromStorage(): Density {
	try {
		const stored = localStorage.getItem(DENSITY_STORAGE_KEY);
		if (stored && VALID_DENSITIES.has(stored)) {
			return stored as Density;
		}
	} catch {
		// localStorage unavailable (e.g. SSR, private browsing with strict settings)
	}
	return "auto";
}

function writeDensityToStorage(density: Density): void {
	try {
		localStorage.setItem(DENSITY_STORAGE_KEY, density);
	} catch {
		// localStorage unavailable — silently ignore
	}
}

export interface UseDensityResult {
	density: Density;
	setDensity: (density: Density) => void;
}

/**
 * Read/write density preference to localStorage.
 * Defaults to "auto" when no value is stored.
 * All instances sync via a custom window event so AppShell's data-density
 * stays in sync when SettingsAppearance calls setDensity.
 */
export function useDensity(): UseDensityResult {
	const [density, setDensityState] = useState<Density>(readDensityFromStorage);

	// Sync all instances when any instance calls setDensity (same-tab or cross-tab).
	useEffect(() => {
		const handleDensityChange = (e: Event): void => {
			const next = (e as CustomEvent<Density>).detail;
			if (VALID_DENSITIES.has(next)) {
				setDensityState(next as Density);
			}
		};
		const handleStorage = (e: StorageEvent): void => {
			if (e.key === DENSITY_STORAGE_KEY) {
				setDensityState(readDensityFromStorage());
			}
		};
		window.addEventListener(DENSITY_CHANGE_EVENT, handleDensityChange);
		window.addEventListener("storage", handleStorage);
		return () => {
			window.removeEventListener(DENSITY_CHANGE_EVENT, handleDensityChange);
			window.removeEventListener("storage", handleStorage);
		};
	}, []);

	const setDensity = useCallback((next: Density): void => {
		writeDensityToStorage(next);
		setDensityState(next);
		// Broadcast to other useDensity instances in the same tab.
		window.dispatchEvent(new CustomEvent(DENSITY_CHANGE_EVENT, { detail: next }));
	}, []);

	return { density, setDensity };
}
