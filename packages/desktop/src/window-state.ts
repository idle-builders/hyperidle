/**
 * Persist and restore BrowserWindow bounds across launches.
 *
 * N4 stub — implementation pending.
 */

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
 * Read window state from a JSON file. Returns defaults if the file is missing
 * or corrupt, and validates that the saved position is within the provided
 * display bounds.
 */
export function loadWindowState(_statePath: string, _displayBounds: DisplayBounds): WindowState {
	throw new Error("not implemented");
}

/**
 * Write window state to a JSON file synchronously.
 */
export function saveWindowState(_statePath: string, _state: WindowState): void {
	throw new Error("not implemented");
}

/**
 * Return true if the saved window position is within the given display bounds.
 */
export function isWithinBounds(_state: WindowState, _displayBounds: DisplayBounds): boolean {
	throw new Error("not implemented");
}
