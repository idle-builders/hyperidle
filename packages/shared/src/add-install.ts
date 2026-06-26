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
import { basename, join, resolve } from "node:path";

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
 * For local sources: copies files listed in registry-item.json's `files` array
 * (falls back to ["registry-item.json"] if `files` is omitted — NOT all files
 * in the directory; only explicitly listed files are copied).
 *
 * For URL sources: fetches registry-item.json, then fetches each listed file
 * and writes them to disk.
 *
 * For github sources: resolves to a raw.githubusercontent.com URL and delegates
 * to the URL path.
 *
 * @lore AL5 SECURITY: manifest.id is sanitized (basename) before use as a dir name
 * so a manifest with id: "../.." cannot escape the targetDir. File paths in `files`
 * are also sanitized (strip ../ segments). No sandbox — build-time action.
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

	// Security: sanitize manifest id before using it as a directory name.
	// A manifest with id: "../.." must not escape the surfaces dir.
	// @lore AL5 SECURITY: basename() strips all directory components; a dot-segment
	// id like "../evil" becomes "evil". We also reject empty ids after sanitization.
	const surfaceId = basename(manifest.id.replace(/[/\\]/g, "-"));
	if (!surfaceId) {
		throw new Error(`Invalid surface id '${manifest.id}': must not be empty after sanitization`);
	}
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

	// Security: sanitize manifest id before using it as a directory name.
	// @lore AL5 SECURITY: same guard as installFromLocal — basename() strips path traversal.
	const surfaceId = basename(manifest.id.replace(/[/\\]/g, "-"));
	if (!surfaceId) {
		throw new Error(`Invalid surface id '${manifest.id}': must not be empty after sanitization`);
	}
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

// ── Registration file generator ───────────────────────────────────────────────

/**
 * GenerateRegistrationFileOptions: the manifest from the installed surface + the
 * component file name within the installed dir.
 */
export interface GenerateRegistrationFileOptions {
	/** The installed surface's manifest (parsed from registry-item.json). */
	readonly manifest: SurfaceRegistryItem & { readonly [k: string]: unknown };
	/**
	 * The primary component file name within the installed dir
	 * (e.g. "StripeRefundReview.tsx"). Must be one of the manifest.files entries.
	 * If omitted, the generator looks for the first .tsx file in manifest.files.
	 */
	readonly componentFile?: string;
	/** Absolute path to the installed surface dir (targetDir/<surfaceId>/). */
	readonly installedPath: string;
	/**
	 * Path to write the generated register.ts file (default: installedPath/register.ts).
	 * Exposed for testing.
	 */
	readonly outputPath?: string;
}

/**
 * Generates a `register.ts` file in the installed surface directory.
 *
 * The generated file imports the surface component, builds a minimal manifest
 * constant, and calls registerSurface() from the web surface-registry module.
 *
 * When surface-registry.ts (or a generated index) imports this file, the surface
 * is wired into the registry at module-load time — no runtime eval, no Vite magic.
 *
 * @lore AL5 INSTALL-LOOP: The generated file is the bridge between the file-copy
 * (installSurface) and the registry (registerSurface). The human reviews + commits
 * both the surface source and the generated register.ts. After rebuild the surface
 * appears in listSurfaces() and becomes adoptable.
 *
 * @lore AL5: Lives in shared (no React) so the CLI (scripts/) can call it without
 * jsdom. The generated file itself imports React (via the surface component) but
 * that's only evaluated in the web/jsdom context.
 */
export async function generateRegistrationFile(
	opts: GenerateRegistrationFileOptions,
): Promise<string> {
	const { manifest, installedPath } = opts;
	const files: readonly string[] = Array.isArray((manifest as { files?: string[] }).files)
		? ((manifest as { files?: string[] }).files ?? [])
		: [];

	// Find the primary component file: explicit > first .tsx in files > fallback name.
	const componentFile =
		opts.componentFile ??
		files.find((f) => f.endsWith(".tsx") && !f.endsWith(".stories.tsx")) ??
		`${manifest.id}.tsx`;

	// Strip .tsx extension to get the component name.
	const componentName = componentFile.replace(/\.tsx$/, "");

	// The generated register.ts imports registerSurface from surface-registry-api.ts
	// (NOT surface-registry.ts) to avoid a circular-import TDZ crash.
	// @lore AL5 TDZ-FIX: surface-registry.ts imports surface-registry.generated.ts which
	// imports this file. If this file imported from surface-registry.ts, the ESM cycle would
	// cause a ReferenceError (registerSurface in TDZ when this module-side-effect runs).
	// surface-registry-api.ts is a leaf: it has no imports from surface-registry.ts.
	// Relative path from surfaces/<id>/register.ts to surfaces/surface-registry-api.ts is "../".
	const generated = `/**
 * AUTO-GENERATED by surface:add — do not edit manually.
 * Review this file, commit it together with the surface source, then rebuild.
 *
 * Imports the installed surface component and registers it so it appears in
 * getSurfaceEntry() / listSurfaces() at module-load time.
 *
 * @lore AL5 INSTALL-LOOP: This file is the registration bridge. surface-registry.ts
 * imports it (via surfaces/surface-registry.generated.ts) so the surface is active
 * after rebuild without any manual wiring.
 *
 * @lore AL5 TDZ-FIX: Imports registerSurface from surface-registry-api.js (not
 * surface-registry.js) to avoid the ESM circular-import TDZ crash. See
 * surface-registry-api.ts for the full explanation.
 */

import type { ReviewCanvasComponent } from "../../review-artifact.js";
import { registerSurface } from "../surface-registry-api.js";
import { ${componentName} } from "./${componentFile.replace(/\.tsx$/, ".js")}";

const manifest = ${JSON.stringify(manifest, null, 2)} as const;

// Register the surface — called once at module-load time.
registerSurface(
  // Cast needed: manifest is typed as const (literal types), registerSurface expects SurfaceManifest.
  manifest as Parameters<typeof registerSurface>[0],
  ${componentName} as ReviewCanvasComponent,
);
`;

	const outputPath = opts.outputPath ?? join(installedPath, "register.ts");
	await writeFile(outputPath, generated, "utf-8");
	return outputPath;
}

// ── Surfaces registry index updater ──────────────────────────────────────────

/**
 * Updates (or creates) the generated surface registry index file at
 * `packages/web/src/pages/review/surfaces/surface-registry.generated.ts`.
 *
 * The generated file imports and re-exports all installed surface registration
 * files. surface-registry.ts imports this file so all installed surfaces are
 * registered at module-load time.
 *
 * @lore AL5 INSTALL-LOOP: This is the index half of the registration bridge.
 * When a new surface is installed, its register.ts is appended to this index.
 * When surface-registry.ts imports the index, all registered surfaces are active.
 */
export async function updateRegistryGeneratedIndex(opts: {
	/** Absolute path to the surfaces/ dir (packages/web/src/pages/review/surfaces/). */
	readonly surfacesDir: string;
	/** Surface id to add (its register.ts will be imported). */
	readonly surfaceId: string;
}): Promise<void> {
	const { surfacesDir, surfaceId } = opts;
	const indexPath = join(surfacesDir, "surface-registry.generated.ts");

	// Read existing content (or start fresh).
	let existing: string;
	try {
		existing = await readFile(indexPath, "utf-8");
	} catch {
		existing = `/**
 * AUTO-GENERATED by surface:add — do not edit manually.
 * Imports all installed surface registration files so they are wired into
 * the registry at module-load time.
 */
`;
	}

	// Append the new import if not already present.
	const importLine = `import "./${surfaceId}/register.js";\n`;
	if (!existing.includes(importLine)) {
		await writeFile(indexPath, existing + importLine, "utf-8");
	}
}
