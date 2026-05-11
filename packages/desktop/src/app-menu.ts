/**
 * Five-menu application menu builder.
 */

import { app, Menu, shell } from "electron";

export interface AppMenuOptions {
	isDev: boolean;
	logDir: string;
	dataDir: string;
	onOpenSettings: () => void;
}

export interface MenuTemplate {
	label?: string;
	role?: string;
	accelerator?: string;
	type?: "separator" | "submenu" | "normal" | "checkbox" | "radio";
	submenu?: MenuTemplate[];
	click?: () => void;
}

/**
 * Build and return the five-menu application menu template.
 * Menus: HyperIdle, Edit, View, Window, Help.
 *
 * In dev mode, the View menu includes Reload and Toggle DevTools items.
 */
export function buildAppMenuTemplate(options: AppMenuOptions): MenuTemplate[] {
	const { isDev, logDir, dataDir, onOpenSettings } = options;

	const viewSubmenu: MenuTemplate[] = [
		...(isDev
			? [{ role: "reload" } as MenuTemplate, { role: "toggleDevTools" } as MenuTemplate]
			: []),
		{ type: "separator" },
		{ role: "resetZoom" },
		{ role: "zoomIn" },
		{ role: "zoomOut" },
		{ type: "separator" },
		{ role: "togglefullscreen" },
	];

	const template: MenuTemplate[] = [
		{
			label: app.name,
			submenu: [
				{ role: "about" },
				{ type: "separator" },
				{
					label: "Settings...",
					accelerator: "CmdOrCtrl+,",
					click: onOpenSettings,
				},
				{ type: "separator" },
				{ role: "hide" },
				{ role: "hideOthers" },
				{ role: "unhide" },
				{ type: "separator" },
				{ role: "quit" },
			],
		},
		{
			label: "Edit",
			submenu: [
				{ role: "undo" },
				{ role: "redo" },
				{ type: "separator" },
				{ role: "cut" },
				{ role: "copy" },
				{ role: "paste" },
				{ role: "selectAll" },
			],
		},
		{
			label: "View",
			submenu: viewSubmenu,
		},
		{
			label: "Window",
			submenu: [{ role: "minimize" }, { role: "zoom" }, { role: "close" }],
		},
		{
			label: "Help",
			submenu: [
				{
					label: "Open Logs Folder",
					click: (): void => {
						void shell.openPath(logDir);
					},
				},
				{
					label: "Open Data Folder",
					click: (): void => {
						void shell.openPath(dataDir);
					},
				},
			],
		},
	];

	// @lore N4: buildFromTemplate is called here to allow tests to mock Menu.buildFromTemplate
	// and intercept the template. The return value from buildFromTemplate in tests
	// is the template itself (see the vi.mock in app-menu.test.ts).
	return Menu.buildFromTemplate(template) as unknown as MenuTemplate[];
}
