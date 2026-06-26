#!/usr/bin/env tsx
/**
 * AL5 — `add <source>` CLI: install a community surface into the build.
 *
 * Usage:
 *   npm run surface:add -- <source>
 *
 * where <source> is one of:
 *   https://example.com/surfaces/foo/registry-item.json   (URL)
 *   github:owner/repo/item                                (GitHub shorthand)
 *   /absolute/path/to/surface                             (local path)
 *   ./relative/path/to/surface                            (local relative)
 *
 * The command:
 *   1. Copies the surface's source files into
 *        packages/web/src/pages/review/surfaces/<surfaceId>/
 *      — the directory the app resolves surfaces from.
 *   2. Generates a register.ts in that directory that calls registerSurface()
 *      so the surface is wired into the registry at module-load time after rebuild.
 *   3. Appends an import line to surface-registry.generated.ts so surface-registry.ts
 *      picks it up automatically.
 *   4. Appends the manifest to REGISTERED_SURFACE_MANIFESTS in shared so the
 *      server registry accepts adoption POSTs for this surface (POST 201).
 *
 * The human reviews all generated/modified files, commits, and rebuilds.
 *
 * This is a BUILD-TIME action — no runtime eval of fetched code.
 *
 * @lore AL5 INSTALL-LOOP: Previously `add` installed into repo-root `surfaces/`
 * (nothing built/resolved from there) and never registered the surface, so
 * getSurfaceEntry returned undefined and adoption POST 400'd. Now:
 *   - Target dir = packages/web/src/pages/review/surfaces/<id>/ (app resolves from here)
 *   - Registration = generated register.ts calls registerSurface() on import
 *   - Index = surface-registry.generated.ts imports all register.ts files
 *   - Server = REGISTERED_SURFACE_MANIFESTS in shared updated so POST 201s
 *
 * @lore AL5 ETHOS (code-not-config): `add` writes files to disk for a human
 * to review + commit + rebuild. It never eval()s or dynamically loads fetched code.
 * Security: sanitize manifest id (basename) + sanitize file paths (strip ../).
 */

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	generateRegistrationFile,
	installSurface,
	parseAddSource,
	updateRegistryGeneratedIndex,
} from "../packages/shared/src/add-install.js";
// @lore AL5: CLI imports directly from the source file (not @hyperidle/shared/add)
// because this script runs via tsx (no build) and workspace imports resolve at build time.

// Repo root = dirname of this script's parent.
const __filename = fileURLToPath(import.meta.url);
const repoRoot = join(__filename, "..", "..");

// Target dir: the directory the app actually resolves surfaces from.
// @lore AL5 INSTALL-LOOP: Previously "surfaces/" (repo root) — nothing imported
// from there. Now the web package's surfaces directory.
const DEFAULT_SURFACES_DIR = join(
	repoRoot,
	"packages",
	"web",
	"src",
	"pages",
	"review",
	"surfaces",
);

// Shared review-surface.ts — REGISTERED_SURFACE_MANIFESTS lives here.
const SHARED_REVIEW_SURFACE_PATH = join(
	repoRoot,
	"packages",
	"shared",
	"src",
	"review-surface.ts",
);

async function main(): Promise<void> {
	const args = process.argv.slice(2);

	if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
		process.stdout.write(
			[
				"Usage: npm run surface:add -- <source>",
				"",
				"Installs a surface into packages/web/src/pages/review/surfaces/<surfaceId>/",
				"and wires it into the registry for review + commit + rebuild.",
				"",
				"Source forms:",
				"  https://example.com/surfaces/foo/registry-item.json",
				"  github:owner/repo/item",
				"  /absolute/path/to/surface",
				"  ./relative/path",
				"",
				"After install: review the changed files, commit, and rebuild (npm run build).",
				"After rebuild: the surface appears in Settings › Review surfaces and can be adopted.",
				"",
			].join("\n"),
		);
		process.exit(0);
	}

	const sourceStr = args[0];
	if (!sourceStr) {
		process.stderr.write("Error: no source provided.\n");
		process.exit(1);
	}

	let source: ReturnType<typeof parseAddSource>;
	try {
		source = parseAddSource(sourceStr);
	} catch (err) {
		process.stderr.write(
			`Error: ${err instanceof Error ? err.message : String(err)}\n`,
		);
		process.exit(1);
	}

	process.stdout.write(`Installing surface from ${source.type} source…\n`);

	let result: Awaited<ReturnType<typeof installSurface>>;
	try {
		result = await installSurface({ source, targetDir: DEFAULT_SURFACES_DIR });
	} catch (err) {
		process.stderr.write(
			`Error: install failed — ${err instanceof Error ? err.message : String(err)}\n`,
		);
		process.exit(1);
	}

	process.stdout.write(`Installed surface files: ${result.installedPath}\n`);

	// ── Step 2: Read the installed manifest for codegen ────────────────────────
	let manifest: Record<string, unknown>;
	try {
		const raw = await readFile(
			join(result.installedPath, "registry-item.json"),
			"utf-8",
		);
		manifest = JSON.parse(raw) as Record<string, unknown>;
	} catch (err) {
		process.stderr.write(
			`Warning: could not read installed registry-item.json for codegen — ${err instanceof Error ? err.message : String(err)}\n`,
		);
		manifest = { id: result.surfaceId, title: result.surfaceId };
	}

	// ── Step 3: Generate register.ts in the installed surface dir ──────────────
	try {
		const registerPath = await generateRegistrationFile({
			manifest: manifest as Parameters<typeof generateRegistrationFile>[0]["manifest"],
			installedPath: result.installedPath,
		});
		process.stdout.write(`Generated registration file: ${registerPath}\n`);
	} catch (err) {
		process.stderr.write(
			`Warning: could not generate register.ts — ${err instanceof Error ? err.message : String(err)}\n`,
		);
	}

	// ── Step 4: Append to surface-registry.generated.ts ───────────────────────
	try {
		await updateRegistryGeneratedIndex({
			surfacesDir: DEFAULT_SURFACES_DIR,
			surfaceId: result.surfaceId,
		});
		process.stdout.write(
			`Updated surface-registry.generated.ts with import for ${result.surfaceId}\n`,
		);
	} catch (err) {
		process.stderr.write(
			`Warning: could not update surface-registry.generated.ts — ${err instanceof Error ? err.message : String(err)}\n`,
		);
	}

	// ── Step 5: Append manifest to REGISTERED_SURFACE_MANIFESTS in shared ─────
	// This ensures the server registry accepts adoption POSTs for this surface.
	// @lore AL5 INSTALL-LOOP: The server builds SERVER_REGISTRY from
	// OFFICIAL_REGISTRY_INDEX.surfaces which derives from REGISTERED_SURFACE_MANIFESTS.
	// Without this step, POST /api/surface-adoptions → 400 (surface not in registry).
	try {
		await appendManifestToShared(manifest, SHARED_REVIEW_SURFACE_PATH);
		process.stdout.write(
			`Appended manifest to REGISTERED_SURFACE_MANIFESTS in packages/shared/src/review-surface.ts\n`,
		);
	} catch (err) {
		process.stderr.write(
			`Warning: could not update shared review-surface.ts — ${err instanceof Error ? err.message : String(err)}\n`,
		);
	}

	process.stdout.write(
		[
			"",
			`Surface '${result.surfaceId}' installed successfully.`,
			"",
			"Next steps:",
			`  1. Review ALL changed files:`,
			`       ${result.installedPath}`,
			`       packages/web/src/pages/review/surfaces/surface-registry.generated.ts`,
			`       packages/shared/src/review-surface.ts`,
			`  2. Commit (git add packages/ && git commit)`,
			"  3. Rebuild (npm run build)",
			`  4. Adopt in Settings › Review surfaces (surface '${result.surfaceId}' will appear)`,
			"",
		].join("\n"),
	);
}

/**
 * Appends the installed surface manifest to REGISTERED_SURFACE_MANIFESTS
 * in packages/shared/src/review-surface.ts so the server registry accepts it.
 *
 * Inserts the new manifest entry immediately BEFORE the sentinel comment
 * `/* surface:add inserts above *\/` — deterministic, not positional.
 * Idempotent: no-op if the surface id is already present.
 *
 * @lore AL5 CODEGEN-FIX: Previously used `lastIndexOf("];")` which matched 7
 * different `];` occurrences in the file and was fragile under edits. The sentinel
 * comment is explicit and unique — it marks exactly where new entries go.
 */
async function appendManifestToShared(
	manifest: Record<string, unknown>,
	filePath: string,
): Promise<void> {
	const content = await readFile(filePath, "utf-8");

	// Idempotency check: if the id is already referenced, skip.
	const id = String(manifest["id"] ?? "");
	if (!id) throw new Error("Manifest has no id");
	if (content.includes(`id: "${id}"`)) {
		// Already present — no-op.
		return;
	}

	// Build the manifest entry as a TypeScript object literal.
	const situations = Array.isArray(manifest["situations"])
		? (manifest["situations"] as Array<Record<string, unknown>>)
		: [];
	const situationsStr = situations
		.map(
			(s) =>
				`{ tool: ${JSON.stringify(s["tool"])}, kind: ${JSON.stringify(s["kind"])} as import("./review-surface.js").ReviewCanvasKind }`,
		)
		.join(", ");

	const entry = `\t{
\t\tid: ${JSON.stringify(manifest["id"])},
\t\ttitle: ${JSON.stringify(manifest["title"])},
\t\tdescription: ${JSON.stringify(manifest["description"] ?? "")},
\t\tauthor: ${JSON.stringify(manifest["author"] ?? "")},
\t\tversion: ${JSON.stringify(manifest["version"] ?? "1.0.0")},
\t\tbaseCanvas: ${JSON.stringify(manifest["baseCanvas"] ?? "action_operation")} as import("./review-surface.js").ReviewCanvasKind,
\t\tlayering: ${JSON.stringify(manifest["layering"] ?? "wrap")} as import("./review-surface.js").LayeringMode,
\t\tprovenance: "community" as import("./review-surface.js").SurfaceProvenance,
\t\tsituations: [${situationsStr}],
\t\tsampleFixture: ${JSON.stringify(manifest["sampleFixture"] ?? "")},
\t},\n`;

	// Insert before the sentinel marker (deterministic, unique — not positional).
	const SENTINEL = "/* surface:add inserts above */";
	const idx = content.indexOf(SENTINEL);
	if (idx === -1) {
		throw new Error(
			`Could not find sentinel '${SENTINEL}' in ${filePath} — cannot append manifest. ` +
				`Ensure REGISTERED_SURFACE_MANIFESTS array contains '${SENTINEL}' on a line by itself.`,
		);
	}

	// Insert the entry text right before the sentinel (with a tab for indentation).
	const updated = content.slice(0, idx) + entry + "\t" + content.slice(idx);
	await writeFile(filePath, updated, "utf-8");
}

main().catch((err: unknown) => {
	process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
	process.exit(1);
});
