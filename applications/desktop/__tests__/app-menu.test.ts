/**
 * buildAppMenuTemplate() builds the 5 top-level menus (HyperIdle, Edit, View, Window, Help), with
 * dev-mode-only reload/toggleDevTools items on View, and onOpenSettings wired to the Settings... item.
 */

import type { MenuItemConstructorOptions } from "electron";
import { describe, expect, it, vi } from "vitest";
import { buildAppMenuTemplate } from "../src/app-menu.js";

// ---------------------------------------------------------------------------
// Mock electron — app.name and shell are needed for the template builder.
// buildAppMenuTemplate returns the raw template array without calling
// Menu.buildFromTemplate, so no Menu mock is needed here.
// ---------------------------------------------------------------------------
vi.mock("electron", () => ({
	app: {
		name: "HyperIdle",
	},
	shell: {
		openPath: vi.fn(),
	},
}));

const BASE_OPTIONS = {
	isDev: false,
	logDir: "/tmp/logs",
	dataDir: "/tmp/data",
	onOpenSettings: vi.fn(),
};

function findMenu(
	template: MenuItemConstructorOptions[],
	label: string,
): MenuItemConstructorOptions | undefined {
	return template.find((m) => m.label === label);
}

describe("buildAppMenuTemplate — structure", () => {
	it("returns exactly 5 top-level menus", () => {
		const template = buildAppMenuTemplate(BASE_OPTIONS);
		expect(template).toHaveLength(5);
	});

	it("has HyperIdle as the first menu label", () => {
		const template = buildAppMenuTemplate(BASE_OPTIONS);
		// First menu uses app.name which is "HyperIdle" in our mock
		expect(template.at(0)?.label).toBe("HyperIdle");
	});

	it("has Edit, View, Window, Help as the remaining menus in order", () => {
		const template = buildAppMenuTemplate(BASE_OPTIONS);
		const labels = template.slice(1).map((m) => m.label);
		expect(labels).toEqual(["Edit", "View", "Window", "Help"]);
	});
});

describe("buildAppMenuTemplate — HyperIdle menu", () => {
	it("contains Settings... item with CmdOrCtrl+, accelerator", () => {
		const template = buildAppMenuTemplate(BASE_OPTIONS);
		const appMenu = findMenu(template, "HyperIdle");
		const settingsItem = appMenu?.submenu?.find((item) => item.label === "Settings...");
		expect(settingsItem).toBeDefined();
		expect(settingsItem?.accelerator).toBe("CmdOrCtrl+,");
	});

	it("wires Settings... click to onOpenSettings callback", () => {
		const onOpenSettings = vi.fn();
		const template = buildAppMenuTemplate({ ...BASE_OPTIONS, onOpenSettings });
		const appMenu = findMenu(template, "HyperIdle");
		const settingsItem = appMenu?.submenu?.find((item) => item.label === "Settings...");
		settingsItem?.click?.();
		expect(onOpenSettings).toHaveBeenCalledOnce();
	});

	it("contains about, hide, hideOthers, unhide, quit roles", () => {
		const template = buildAppMenuTemplate(BASE_OPTIONS);
		const appMenu = findMenu(template, "HyperIdle");
		const roles = appMenu?.submenu?.map((item) => item.role).filter(Boolean) ?? [];
		expect(roles).toContain("about");
		expect(roles).toContain("hide");
		expect(roles).toContain("hideOthers");
		expect(roles).toContain("unhide");
		expect(roles).toContain("quit");
	});
});

describe("buildAppMenuTemplate — Edit menu", () => {
	it("contains undo, redo, cut, copy, paste, selectAll roles", () => {
		const template = buildAppMenuTemplate(BASE_OPTIONS);
		const editMenu = findMenu(template, "Edit");
		const roles = editMenu?.submenu?.map((item) => item.role).filter(Boolean) ?? [];
		expect(roles).toContain("undo");
		expect(roles).toContain("redo");
		expect(roles).toContain("cut");
		expect(roles).toContain("copy");
		expect(roles).toContain("paste");
		expect(roles).toContain("selectAll");
	});
});

describe("buildAppMenuTemplate — View menu", () => {
	it("contains togglefullscreen role in production mode", () => {
		const template = buildAppMenuTemplate({ ...BASE_OPTIONS, isDev: false });
		const viewMenu = findMenu(template, "View");
		const roles = viewMenu?.submenu?.map((item) => item.role).filter(Boolean) ?? [];
		expect(roles).toContain("togglefullscreen");
	});

	it("contains resetZoom, zoomIn, zoomOut roles", () => {
		const template = buildAppMenuTemplate(BASE_OPTIONS);
		const viewMenu = findMenu(template, "View");
		const roles = viewMenu?.submenu?.map((item) => item.role).filter(Boolean) ?? [];
		expect(roles).toContain("resetZoom");
		expect(roles).toContain("zoomIn");
		expect(roles).toContain("zoomOut");
	});

	it("includes reload and toggleDevTools in dev mode", () => {
		const template = buildAppMenuTemplate({ ...BASE_OPTIONS, isDev: true });
		const viewMenu = findMenu(template, "View");
		const roles = viewMenu?.submenu?.map((item) => item.role).filter(Boolean) ?? [];
		expect(roles).toContain("reload");
		expect(roles).toContain("toggleDevTools");
	});

	it("does NOT include reload or toggleDevTools in production mode", () => {
		const template = buildAppMenuTemplate({ ...BASE_OPTIONS, isDev: false });
		const viewMenu = findMenu(template, "View");
		const roles = viewMenu?.submenu?.map((item) => item.role).filter(Boolean) ?? [];
		expect(roles).not.toContain("reload");
		expect(roles).not.toContain("toggleDevTools");
	});
});

describe("buildAppMenuTemplate — Window menu", () => {
	it("contains minimize, zoom, close roles", () => {
		const template = buildAppMenuTemplate(BASE_OPTIONS);
		const windowMenu = findMenu(template, "Window");
		const roles = windowMenu?.submenu?.map((item) => item.role).filter(Boolean) ?? [];
		expect(roles).toContain("minimize");
		expect(roles).toContain("zoom");
		expect(roles).toContain("close");
	});
});

describe("buildAppMenuTemplate — Help menu", () => {
	it("contains Open Logs Folder item", () => {
		const template = buildAppMenuTemplate(BASE_OPTIONS);
		const helpMenu = findMenu(template, "Help");
		const logsItem = helpMenu?.submenu?.find((item) => item.label === "Open Logs Folder");
		expect(logsItem?.label).toBe("Open Logs Folder");
	});

	it("contains Open Data Folder item", () => {
		const template = buildAppMenuTemplate(BASE_OPTIONS);
		const helpMenu = findMenu(template, "Help");
		const dataItem = helpMenu?.submenu?.find((item) => item.label === "Open Data Folder");
		expect(dataItem?.label).toBe("Open Data Folder");
	});

	it("Open Logs Folder click opens the logDir path", async () => {
		const { shell } = await import("electron");
		const template = buildAppMenuTemplate({ ...BASE_OPTIONS, logDir: "/tmp/logs" });
		const helpMenu = findMenu(template, "Help");
		const logsItem = helpMenu?.submenu?.find((item) => item.label === "Open Logs Folder");
		logsItem?.click?.();
		expect(shell.openPath).toHaveBeenCalledWith("/tmp/logs");
	});

	it("Open Data Folder click opens the dataDir path", async () => {
		const { shell } = await import("electron");
		const template = buildAppMenuTemplate({ ...BASE_OPTIONS, dataDir: "/tmp/data" });
		const helpMenu = findMenu(template, "Help");
		const dataItem = helpMenu?.submenu?.find((item) => item.label === "Open Data Folder");
		dataItem?.click?.();
		expect(shell.openPath).toHaveBeenCalledWith("/tmp/data");
	});
});
