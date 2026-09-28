// One folder per bundled plugin under the bundled directory.
// @lore: bundled install names a plugin, never carries a path — installer resolves path from directory listing; ../x or absolute paths can't reach through it

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
