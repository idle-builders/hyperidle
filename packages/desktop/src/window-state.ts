/**
 * Persist and restore BrowserWindow bounds across launches.
 */

import * as fs from "node:fs";

export interface WindowState {
	x: number | undefined;
	y: number | undefined;
	width: number;
	height: number;
	isMaximized: boolean;
	isFullScreen: boolean;
}

export const DEFAULT_WINDOW_STATE: WindowState = {
	x: undefined,
	y: undefined,
	width: 1280,
	height: 800,
	isMaximized: false,
	isFullScreen: false,
};

export interface DisplayBounds {
	x: number;
	y: number;
	width: number;
	height: number;
}

/**
 * Return true if the saved window position is within the given display bounds.
 */
export function isWithinBounds(state: WindowState, displayBounds: DisplayBounds): boolean {
	if (state.x === undefined || state.y === undefined) {
		return false;
	}

	const withinLeft = state.x >= displayBounds.x;
	const withinTop = state.y >= displayBounds.y;
	const withinRight = state.x + state.width <= displayBounds.x + displayBounds.width;
	const withinBottom = state.y + state.height <= displayBounds.y + displayBounds.height;

	return withinLeft && withinTop && withinRight && withinBottom;
}

/**
 * Read window state from a JSON file. Returns defaults if the file is missing
 * or corrupt, and validates that the saved position is within the provided
 * display bounds.
 */
export function loadWindowState(statePath: string, displayBounds: DisplayBounds): WindowState {
	try {
		const raw = fs.readFileSync(statePath, "utf-8");
		const parsed = JSON.parse(raw) as WindowState;

		// Validate bounds against display; fall back to defaults if off-screen
		if (!isWithinBounds(parsed, displayBounds)) {
			return {
				...DEFAULT_WINDOW_STATE,
				// Preserve size if it was valid, but let Electron center the window
				width: parsed.width ?? DEFAULT_WINDOW_STATE.width,
				height: parsed.height ?? DEFAULT_WINDOW_STATE.height,
				isMaximized: parsed.isMaximized ?? false,
				isFullScreen: parsed.isFullScreen ?? false,
			};
		}

		return parsed;
	} catch {
		// File missing or corrupt JSON — return defaults
		return { ...DEFAULT_WINDOW_STATE };
	}
}

/**
 * Write window state to a JSON file synchronously.
 */
export function saveWindowState(statePath: string, state: WindowState): void {
	fs.writeFileSync(statePath, JSON.stringify(state), "utf-8");
}
