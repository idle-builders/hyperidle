/**
 * The plugins that ship inside the app: one folder per plugin under the
 * bundled directory (the desktop build copies the repo's `plugins/` there).
 *
 * @lore A bundled install names a plugin; it never carries a path. The name
 * is matched exactly against the manifest names this listing read from the
 * server's own directory, and the path handed to the installer is the one
 * the listing built from that directory entry — so `../x`, an absolute path
 * or a folder that merely resembles a plugin can never be reached through
 * it. A missing or unreadable directory lists nothing; that is not an error.
 */

import { type Dirent, readdirSync } from "node:fs";
import { join } from "node:path";
import { type PluginManifest, parsePluginManifest } from "./plugin-manifest.js";

interface BundledPlugin {
	/** Absolute path of the plugin's folder inside the bundled directory. */
	readonly path: string;
	readonly manifest: PluginManifest;
}

export function listBundledPlugins(bundledPluginsDir: string | undefined): BundledPlugin[] {
	if (!bundledPluginsDir) return [];
	let entries: Dirent[];
	try {
		entries = readdirSync(bundledPluginsDir, { withFileTypes: true });
	} catch {
		return [];
	}
	const found: BundledPlugin[] = [];
	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		const path = join(bundledPluginsDir, entry.name);
		const parsed = parsePluginManifest(path);
		if (parsed.ok) found.push({ path, manifest: parsed.manifest });
	}
	return found.sort((a, b) => a.manifest.name.localeCompare(b.manifest.name));
}

/** The bundled plugin whose manifest name is exactly `name`, or undefined. */
export function findBundledPlugin(
	bundledPluginsDir: string | undefined,
	name: string,
): BundledPlugin | undefined {
	return listBundledPlugins(bundledPluginsDir).find((p) => p.manifest.name === name);
}
