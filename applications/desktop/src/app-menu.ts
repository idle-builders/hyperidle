import type { MenuItemConstructorOptions } from "electron";
import { app, shell } from "electron";

export interface AppMenuOptions {
	isDev: boolean;
	logDir: string;
	dataDir: string;
}

export function buildAppMenuTemplate(options: AppMenuOptions): MenuItemConstructorOptions[] {
	const { isDev, logDir, dataDir } = options;

	const viewSubmenu: MenuItemConstructorOptions[] = [
		...(isDev ? [{ role: "reload" as const }, { role: "toggleDevTools" as const }] : []),
		{ type: "separator" },
		{ role: "resetZoom" as const },
		{ role: "zoomIn" as const },
		{ role: "zoomOut" as const },
		{ type: "separator" },
		{ role: "togglefullscreen" as const },
	];

	const template: MenuItemConstructorOptions[] = [
		{
			label: app.name,
			submenu: [
				{ role: "about" as const },
				{ type: "separator" },
				{ role: "hide" as const },
				{ role: "hideOthers" as const },
				{ role: "unhide" as const },
				{ type: "separator" },
				{ role: "quit" as const },
			],
		},
		{
			label: "Edit",
			submenu: [
				{ role: "undo" as const },
				{ role: "redo" as const },
				{ type: "separator" },
				{ role: "cut" as const },
				{ role: "copy" as const },
				{ role: "paste" as const },
				{ role: "selectAll" as const },
			],
		},
		{
			label: "View",
			submenu: viewSubmenu,
		},
		{
			label: "Window",
			submenu: [
				{ role: "minimize" as const },
				{ role: "zoom" as const },
				{ role: "close" as const },
			],
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

	return template;
}
