/**
 * Fetch a plugin from a source (folder path, git URL, or zip file) and
 * resolve it to a local directory containing plugin.json at its root.
 *
 * @lore BA9a: git URL is the primary source (works on shared backends).
 * Zip and folder path also work per D6.
 *
 * Temp directories are returned with a cleanup function — callers MUST
 * always call cleanup() to avoid leaking temp dirs on disk.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export type PluginSource =
	| { readonly kind: "folder"; readonly path: string }
	| { readonly kind: "git"; readonly url: string; readonly ref?: string }
	| { readonly kind: "zip"; readonly path: string };

export interface FetchedPlugin {
	/** Absolute path to the plugin root directory (contains plugin.json). */
	readonly rootDir: string;
	/** Call after the plugin has been processed. Removes any temp dirs. */
	readonly cleanup: () => void;
}

/**
 * Resolve a plugin source to a local directory.
 *
 * - folder: use as-is (resolved to absolute path, no cleanup needed)
 * - git: git clone --depth 1 into a temp dir
 * - zip: unzip into a temp dir; plugin.json must be at the zip root
 *
 * @throws if the source cannot be resolved or the plugin.json is missing.
 */
export function fetchPlugin(source: PluginSource): FetchedPlugin {
	switch (source.kind) {
		case "folder":
			return fetchFolder(source.path);
		case "git":
			return fetchGit(source.url, source.ref);
		case "zip":
			return fetchZip(source.path);
	}
}

function noopCleanup(): void {}

function fetchFolder(folderPath: string): FetchedPlugin {
	const rootDir = resolve(folderPath);
	if (!existsSync(join(rootDir, "plugin.json"))) {
		throw new Error(`No plugin.json found in folder: ${rootDir}`);
	}
	return { rootDir, cleanup: noopCleanup };
}

function makeTempBase(): string {
	return mkdtempSync(join(tmpdir(), "hi-plugin-"));
}

function cleanupDir(dir: string): void {
	try {
		rmSync(dir, { recursive: true, force: true });
	} catch {
		// best-effort cleanup
	}
}

function fetchGit(url: string, ref?: string): FetchedPlugin {
	const tempBase = makeTempBase();
	const rootDir = join(tempBase, "repo");
	try {
		const args = ["clone", "--depth", "1"];
		if (ref) args.push("--branch", ref);
		args.push(url, rootDir);
		execFileSync("git", args, { stdio: "pipe" });
	} catch (err) {
		cleanupDir(tempBase);
		const msg = err instanceof Error ? err.message : String(err);
		throw new Error(`Failed to clone git repository ${url}: ${msg}`);
	}
	if (!existsSync(join(rootDir, "plugin.json"))) {
		cleanupDir(tempBase);
		throw new Error(`No plugin.json found at the root of the cloned repository: ${url}`);
	}
	return {
		rootDir,
		cleanup: () => cleanupDir(tempBase),
	};
}

function fetchZip(zipPath: string): FetchedPlugin {
	const resolvedZip = resolve(zipPath);
	if (!existsSync(resolvedZip)) {
		throw new Error(`Zip file not found: ${resolvedZip}`);
	}
	const tempBase = makeTempBase();
	const destDir = join(tempBase, "extracted");
	try {
		execFileSync("unzip", [resolvedZip, "-d", destDir], { stdio: "pipe" });
	} catch (err) {
		cleanupDir(tempBase);
		const msg = err instanceof Error ? err.message : String(err);
		throw new Error(`Failed to extract zip ${resolvedZip}: ${msg}. Is 'unzip' installed?`);
	}

	// plugin.json must be at the zip root
	const rootDir = destDir;
	if (!existsSync(join(rootDir, "plugin.json"))) {
		cleanupDir(tempBase);
		throw new Error(
			`No plugin.json found at the root of the zip. The zip must contain plugin.json at its top level, not inside a subdirectory.`,
		);
	}
	return {
		rootDir,
		cleanup: () => cleanupDir(tempBase),
	};
}
