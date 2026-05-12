/**
 * N4 — window-state tests
 *
 * AC coverage:
 *  - loadWindowState() returns defaults when file is missing
 *  - loadWindowState() returns defaults when file is corrupt JSON
 *  - loadWindowState() restores saved state when file is valid
 *  - loadWindowState() falls back to defaults when position is outside display bounds
 *  - saveWindowState() writes a JSON file with the correct shape
 *  - isWithinBounds() returns true when window position is within display bounds
 *  - isWithinBounds() returns false when window x/y is undefined (new window)
 *  - isWithinBounds() returns false when window is off-screen
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	DEFAULT_WINDOW_STATE,
	type DisplayBounds,
	isWithinBounds,
	loadWindowState,
	saveWindowState,
	type WindowState,
} from "../src/window-state.js";

let tmpDir: string;

beforeEach(() => {
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hyperidle-test-"));
});

afterEach(() => {
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

const MAIN_DISPLAY: DisplayBounds = { x: 0, y: 0, width: 2560, height: 1440 };

describe("loadWindowState", () => {
	it("returns defaults when state file does not exist", () => {
		const statePath = path.join(tmpDir, "window-state.json");
		const result = loadWindowState(statePath, MAIN_DISPLAY);
		expect(result.width).toBe(DEFAULT_WINDOW_STATE.width);
		expect(result.height).toBe(DEFAULT_WINDOW_STATE.height);
		expect(result.isMaximized).toBe(false);
		expect(result.isFullScreen).toBe(false);
	});

	it("returns defaults when state file contains invalid JSON", () => {
		const statePath = path.join(tmpDir, "window-state.json");
		fs.writeFileSync(statePath, "NOT_JSON{{{");
		const result = loadWindowState(statePath, MAIN_DISPLAY);
		expect(result.width).toBe(DEFAULT_WINDOW_STATE.width);
	});

	it("restores saved window state when the file is valid", () => {
		const statePath = path.join(tmpDir, "window-state.json");
		const saved: WindowState = {
			x: 100,
			y: 50,
			width: 1440,
			height: 900,
			isMaximized: false,
			isFullScreen: false,
		};
		fs.writeFileSync(statePath, JSON.stringify(saved));
		const result = loadWindowState(statePath, MAIN_DISPLAY);
		expect(result.x).toBe(100);
		expect(result.y).toBe(50);
		expect(result.width).toBe(1440);
		expect(result.height).toBe(900);
	});

	it("falls back to defaults when saved position is outside display bounds (disconnected monitor)", () => {
		const statePath = path.join(tmpDir, "window-state.json");
		// Position is on a second monitor at x=3000, which no longer exists
		const saved: WindowState = {
			x: 3000,
			y: 100,
			width: 1280,
			height: 800,
			isMaximized: false,
			isFullScreen: false,
		};
		fs.writeFileSync(statePath, JSON.stringify(saved));
		// Single display bounds: 2560x1440
		const result = loadWindowState(statePath, MAIN_DISPLAY);
		// Should fall back to defaults (x/y become undefined so Electron centers)
		expect(result.x).toBeUndefined();
		expect(result.y).toBeUndefined();
	});

	it("preserves isMaximized flag from saved state", () => {
		const statePath = path.join(tmpDir, "window-state.json");
		const saved: WindowState = {
			x: 0,
			y: 0,
			width: 1280,
			height: 800,
			isMaximized: true,
			isFullScreen: false,
		};
		fs.writeFileSync(statePath, JSON.stringify(saved));
		const result = loadWindowState(statePath, MAIN_DISPLAY);
		expect(result.isMaximized).toBe(true);
	});
});

describe("saveWindowState", () => {
	it("writes a JSON file with the correct WindowState shape", () => {
		const statePath = path.join(tmpDir, "window-state.json");
		const state: WindowState = {
			x: 200,
			y: 100,
			width: 1600,
			height: 900,
			isMaximized: false,
			isFullScreen: false,
		};
		saveWindowState(statePath, state);
		const raw = fs.readFileSync(statePath, "utf-8");
		const parsed = JSON.parse(raw) as WindowState;
		expect(parsed.x).toBe(200);
		expect(parsed.y).toBe(100);
		expect(parsed.width).toBe(1600);
		expect(parsed.height).toBe(900);
	});

	it("overwrites an existing state file", () => {
		const statePath = path.join(tmpDir, "window-state.json");
		saveWindowState(statePath, { ...DEFAULT_WINDOW_STATE, x: 10, y: 10 });
		saveWindowState(statePath, { ...DEFAULT_WINDOW_STATE, x: 999, y: 999 });
		const raw = fs.readFileSync(statePath, "utf-8");
		const parsed = JSON.parse(raw) as WindowState;
		expect(parsed.x).toBe(999);
	});

	it("creates the file in a directory that exists", () => {
		const statePath = path.join(tmpDir, "window-state.json");
		expect(fs.existsSync(statePath)).toBe(false);
		saveWindowState(statePath, DEFAULT_WINDOW_STATE);
		expect(fs.existsSync(statePath)).toBe(true);
	});
});

describe("isWithinBounds", () => {
	it("returns true when the window is fully within display bounds", () => {
		const state: WindowState = {
			x: 100,
			y: 100,
			width: 1280,
			height: 800,
			isMaximized: false,
			isFullScreen: false,
		};
		expect(isWithinBounds(state, MAIN_DISPLAY)).toBe(true);
	});

	it("returns false when x is undefined", () => {
		const state: WindowState = {
			x: undefined,
			y: undefined,
			width: 1280,
			height: 800,
			isMaximized: false,
			isFullScreen: false,
		};
		expect(isWithinBounds(state, MAIN_DISPLAY)).toBe(false);
	});

	it("returns false when the window is positioned beyond the right edge", () => {
		const state: WindowState = {
			x: 2000,
			y: 100,
			width: 1280,
			height: 800,
			isMaximized: false,
			isFullScreen: false,
		};
		// x + width = 3280 > displayWidth 2560
		expect(isWithinBounds(state, MAIN_DISPLAY)).toBe(false);
	});

	it("returns false when the window is positioned below the bottom edge", () => {
		const state: WindowState = {
			x: 100,
			y: 800,
			width: 1280,
			height: 800,
			isMaximized: false,
			isFullScreen: false,
		};
		// y + height = 1600 > displayHeight 1440
		expect(isWithinBounds(state, MAIN_DISPLAY)).toBe(false);
	});

	it("returns false when the window is to the left of the display", () => {
		const state: WindowState = {
			x: -100,
			y: 0,
			width: 1280,
			height: 800,
			isMaximized: false,
			isFullScreen: false,
		};
		expect(isWithinBounds(state, MAIN_DISPLAY)).toBe(false);
	});
});
