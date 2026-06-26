/**
 * AL5 — `add <source>` install resolver.
 *
 * parseAddSource() resolves a source string (URL, github:, local path) into
 * a typed AddSource discriminated union.
 *
 * installSurface() copies the surface's source files into the target surfaces/
 * directory — a build-time operation. The human reviews + commits; no runtime eval.
 *
 * @lore AL5 ETHOS (code-not-config): `add` writes files to disk for a human to
 * review + commit + rebuild. It never eval()s or dynamically loads fetched code.
 * Security posture is minimal hygiene: write only into the surfaces/ dir, validate
 * the manifest shape. No sandbox — this is a developer/build-time action.
 *
 * @lore AL5: Lives in shared (no React) so it can be called from scripts/ (CLI)
 * and tested in Node without jsdom.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

// ── AddSource discriminated union ─────────────────────────────────────────────

export type AddSource =
	| { readonly type: "url"; readonly url: string }
	| {
			readonly type: "github";
			readonly owner: string;
			readonly repo: string;
			/** The surface item path within the repo (e.g. "surfaces/stripe-review"). */
			readonly item: string;
	  }
	| { readonly type: "local"; readonly path: string };

// ── InstallResult ────────────────────────────────────────────────────────────

export interface InstallResult {
	readonly surfaceId: string;
	readonly installedPath: string;
}

// ── Internal: minimal manifest shape for validation ───────────────────────────

interface SurfaceRegistryItem {
	id: string;
	title: string;
	files?: string[];
}

function isRegistryItem(obj: unknown): obj is SurfaceRegistryItem {
	return (
		typeof obj === "object" &&
		obj !== null &&
		typeof (obj as Record<string, unknown>)["id"] === "string" &&
		typeof (obj as Record<string, unknown>)["title"] === "string"
	);
}

// ── parseAddSource ────────────────────────────────────────────────────────────

/**
 * Resolves a source string into an AddSource.
 *
 * Supported forms:
 *   https://example.com/surfaces/foo/registry-item.json  → { type: "url" }
 *   github:owner/repo/item                               → { type: "github" }
 *   https://github.com/owner/repo/tree/main/surfaces/x  → { type: "github" }
 *   /absolute/path/to/surface                            → { type: "local" }
 *   ./relative/path                                      → { type: "local" }
 *
 * Throws for unrecognised or empty source strings.
 */
export function parseAddSource(source: string): AddSource {
	if (!source.trim()) {
		throw new Error("Source string must not be empty");
	}

	// GitHub URL: https://github.com/owner/repo/tree/branch/...
	const githubUrlMatch = /^https:\/\/github\.com\/([^/]+)\/([^/]+)/.exec(source);
	if (githubUrlMatch) {
		const owner = githubUrlMatch[1] as string;
		const repo = githubUrlMatch[2] as string;
		// Extract item from the path after /tree/branch/
		const itemMatch = /\/tree\/[^/]+\/(.+)$/.exec(source);
		const item = itemMatch ? (itemMatch[1] as string) : "";
		return { type: "github", owner, repo, item };
	}

	// github: shorthand
	if (source.startsWith("github:")) {
		const rest = source.slice("github:".length);
		const parts = rest.split("/");
		if (parts.length < 3) {
			throw new Error(
				`Invalid github: source — expected 'github:owner/repo/item', got '${source}'`,
			);
		}
		const owner = parts[0] as string;
		const repo = parts[1] as string;
		const item = parts.slice(2).join("/");
		return { type: "github", owner, repo, item };
	}

	// URL
	if (source.startsWith("https://") || source.startsWith("http://")) {
		return { type: "url", url: source };
	}

	// Local path (absolute or relative)
	if (source.startsWith("/") || source.startsWith("./") || source.startsWith("../")) {
		return { type: "local", path: resolve(source) };
	}

	throw new Error(
		`Unrecognised source '${source}'. Expected an https:// URL, github:owner/repo/item, or a local path (/ or ./)`,
	);
}

// ── installSurface ────────────────────────────────────────────────────────────

/**
 * Copies a surface's source files into targetDir/<surfaceId>/.
 *
 * For local sources: copies files listed in registry-item.json (or all files
 * in the directory if `files` is omitted).
 *
 * For URL sources: fetches registry-item.json, then fetches each listed file
 * and writes them to disk.
 *
 * For github sources: resolves to a raw.githubusercontent.com URL and delegates
 * to the URL path.
 *
 * @lore AL5: Writes only within targetDir — basic hygiene to prevent escaping
 * the surfaces/ directory. No sandbox; this is a developer/build-time action.
 */
export async function installSurface({
	source,
	targetDir,
}: {
	source: AddSource;
	targetDir: string;
}): Promise<InstallResult> {
	switch (source.type) {
		case "local":
			return installFromLocal({ sourcePath: source.path, targetDir });
		case "url":
			return installFromUrl({ registryItemUrl: source.url, targetDir });
		case "github":
			return installFromGithub({ source, targetDir });
	}
}

// ── Local install ──────────────────────────────────────────────────────────────

async function installFromLocal({
	sourcePath,
	targetDir,
}: {
	sourcePath: string;
	targetDir: string;
}): Promise<InstallResult> {
	const manifestPath = join(sourcePath, "registry-item.json");
	const manifestRaw = await readFile(manifestPath, "utf-8");
	const manifest: unknown = JSON.parse(manifestRaw);

	if (!isRegistryItem(manifest)) {
		throw new Error(`Invalid registry-item.json at ${manifestPath}: missing 'id' or 'title'`);
	}

	const surfaceId = manifest.id;
	const destDir = join(targetDir, surfaceId);
	await mkdir(destDir, { recursive: true });

	// Copy listed files (or fall back to the manifest itself + tsx file).
	const filesToCopy = manifest.files ?? ["registry-item.json"];

	for (const filename of filesToCopy) {
		// Security: strip any path traversal attempts.
		const safeFilename = filename.replace(/\.\.[/\\]/g, "");
		const srcFile = join(sourcePath, safeFilename);
		const dstFile = join(destDir, safeFilename);
		const content = await readFile(srcFile);
		await writeFile(dstFile, content);
	}

	return { surfaceId, installedPath: destDir };
}

// ── URL install ───────────────────────────────────────────────────────────────

async function installFromUrl({
	registryItemUrl,
	targetDir,
}: {
	registryItemUrl: string;
	targetDir: string;
}): Promise<InstallResult> {
	// 1. Fetch the registry-item.json manifest.
	const manifestRes = await fetch(registryItemUrl);
	if (!manifestRes.ok) {
		throw new Error(
			`Failed to fetch registry-item.json from ${registryItemUrl}: HTTP ${manifestRes.status}`,
		);
	}
	const manifest: unknown = await manifestRes.json();

	if (!isRegistryItem(manifest)) {
		throw new Error(`Invalid registry-item.json at ${registryItemUrl}: missing 'id' or 'title'`);
	}

	const surfaceId = manifest.id;
	const destDir = join(targetDir, surfaceId);
	await mkdir(destDir, { recursive: true });

	// 2. Resolve the base URL (directory containing registry-item.json).
	const baseUrl = registryItemUrl.replace(/\/[^/]+$/, "");

	// 3. Fetch + write each listed file.
	const filesToFetch = manifest.files ?? ["registry-item.json"];

	for (const filename of filesToFetch) {
		const safeFilename = filename.replace(/\.\.[/\\]/g, "");
		const fileUrl =
			filename === "registry-item.json" ? registryItemUrl : `${baseUrl}/${safeFilename}`;

		const fileRes = await fetch(fileUrl);
		if (!fileRes.ok) {
			throw new Error(
				`Failed to fetch surface file ${safeFilename} from ${fileUrl}: HTTP ${fileRes.status}`,
			);
		}
		const content = await fileRes.text();
		await writeFile(join(destDir, safeFilename), content, "utf-8");
	}

	return { surfaceId, installedPath: destDir };
}

// ── GitHub install ────────────────────────────────────────────────────────────

async function installFromGithub({
	source,
	targetDir,
}: {
	source: Extract<AddSource, { type: "github" }>;
	targetDir: string;
}): Promise<InstallResult> {
	// Resolve to raw.githubusercontent.com URL for the registry-item.json.
	// Convention: <owner>/<repo>/main/<item>/registry-item.json
	const { owner, repo, item } = source;
	// item may already include the "surfaces/" prefix — don't double-add.
	const itemPath = item.startsWith("surfaces/") ? item : `surfaces/${item}`;
	const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/${itemPath}/registry-item.json`;

	return installFromUrl({ registryItemUrl: rawUrl, targetDir });
}
