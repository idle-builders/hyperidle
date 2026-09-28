/**
 * useTheme — theme persistence hook.
 *
 * Reads/writes the user's theme preference (`light` | `dark` | `system`) from
 * `localStorage["hyperidle-theme"]`, applies the resolved theme as
 * `data-theme="hearth-light"` / `"hearth-dark"` on `<html>`, and subscribes to
 * `matchMedia("(prefers-color-scheme: dark)")` so `system` mode follows the OS
 * at runtime without a reload.
 *
 */

const STORAGE_KEY = "hyperidle-theme";

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

function isTheme(value: unknown): value is Theme {
	return value === "light" || value === "dark" || value === "system";
}

export function getInitialTheme(): Theme {
	if (typeof window === "undefined") return "system";
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		return isTheme(raw) ? raw : "system";
	} catch {
		return "system";
	}
}

function getSystemTheme(): ResolvedTheme {
	if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
		return "dark";
	}
	return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolveTheme(theme: Theme): ResolvedTheme {
	return theme === "system" ? getSystemTheme() : theme;
}

function applyTheme(resolved: ResolvedTheme): void {
	if (typeof document === "undefined") return;
	document.documentElement.setAttribute(
		"data-theme",
		resolved === "dark" ? "hearth-dark" : "hearth-light",
	);
}

import { useCallback, useEffect, useState } from "react";

export interface UseThemeResult {
	theme: Theme;
	resolvedTheme: ResolvedTheme;
	setTheme: (next: Theme) => void;
}

export function useTheme(): UseThemeResult {
	const [theme, setThemeState] = useState<Theme>(() => getInitialTheme());
	const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
		resolveTheme(getInitialTheme()),
	);

	// Re-assert data-theme on mount (idempotent with the boot script) and
	// whenever theme changes.
	useEffect(() => {
		const next = resolveTheme(theme);
		setResolvedTheme(next);
		applyTheme(next);
	}, [theme]);

	// Subscribe to OS color-scheme changes; only the resolved theme reacts when
	// the user is in `system` mode.
	useEffect(() => {
		if (theme !== "system") return;
		if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
		const mql = window.matchMedia("(prefers-color-scheme: dark)");
		const handler = (event: MediaQueryListEvent): void => {
			const next: ResolvedTheme = event.matches ? "dark" : "light";
			setResolvedTheme(next);
			applyTheme(next);
		};
		mql.addEventListener("change", handler);
		return () => mql.removeEventListener("change", handler);
	}, [theme]);

	// Cross-tab sync: when another tab writes the storage key, mirror the value.
	useEffect(() => {
		if (typeof window === "undefined") return;
		const handler = (event: StorageEvent): void => {
			if (event.key !== STORAGE_KEY) return;
			const next = isTheme(event.newValue) ? event.newValue : "system";
			setThemeState(next);
		};
		window.addEventListener("storage", handler);
		return () => window.removeEventListener("storage", handler);
	}, []);

	const setTheme = useCallback((next: Theme): void => {
		try {
			window.localStorage.setItem(STORAGE_KEY, next);
		} catch {
			/* localStorage may be disabled — proceed in-memory */
		}
		setThemeState(next);
		const resolved = resolveTheme(next);
		setResolvedTheme(resolved);
		applyTheme(resolved);
	}, []);

	return { theme, resolvedTheme, setTheme };
}
