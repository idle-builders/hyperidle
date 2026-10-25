import * as path from "node:path";

/**
 * Where a server keeps the plugins its teams install: `installed-plugins` beside its database.
 * Not `plugins`: beside a dev checkout's database that is the repo's own plugin source folder, and
 * an install empties its destination before copying, so it would delete the sources it copies from.
 */
export function installedPluginsDir(dbPath: string): string {
	return path.join(path.dirname(dbPath), "installed-plugins");
}
