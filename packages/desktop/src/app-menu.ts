/**
 * Five-menu application menu builder.
 *
 * N4 stub — implementation pending.
 */

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
export function buildAppMenuTemplate(_options: AppMenuOptions): MenuTemplate[] {
	throw new Error("not implemented");
}
