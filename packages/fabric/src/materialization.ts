import * as fs from "node:fs";
import * as path from "node:path";
import type { HyperIdleDb, KnowledgeItem } from "@hyperidle/db";
import type { AgentRole } from "@hyperidle/shared";
import { list } from "./knowledge-repository.js";
import { buildSessionContext } from "./session-context.js";

/** Map agent roles to L3 practice community scope IDs. */
const ROLE_TO_COMMUNITY: Record<AgentRole, string> = {
	builder: "building",
	growth: "growth",
	product_manager: "product",
	practice_facilitator: "ops",
	chief_of_staff: "ops",
	brand_voice: "growth",
};

export interface MaterializationConfig {
	workspacePath: string;
	sessionId: string;
	taskId: string;
	agentId: string;
	agentRole: AgentRole;
	productId: string;
}

export interface ManifestEntry {
	version: number;
	source_path: string;
	format: string;
}

export interface Manifest {
	session_id: string;
	materialized_at: string;
	items: Record<string, ManifestEntry>;
}

export interface MaterializationResult {
	itemCount: number;
	manifest: Manifest;
	durationMs: number;
}

/** Sanitize a title to a safe filename. */
function toFilename(title: string): string {
	// If title already looks like a filename, keep it
	if (/\.\w+$/.test(title)) {
		return title.replace(/[/\\:*?"<>|]/g, "_");
	}
	// Otherwise slugify and add .md
	return `${title.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_")}.md`;
}

/** Remove directory recursively, handling read-only files. */
function cleanDirectory(dirPath: string): void {
	if (!fs.existsSync(dirPath)) return;

	// Make everything writable first so we can delete
	const entries = fs.readdirSync(dirPath, { withFileTypes: true, recursive: true });
	for (const entry of entries) {
		const fullPath = path.join(entry.parentPath ?? entry.path, entry.name);
		if (entry.isFile()) {
			fs.chmodSync(fullPath, 0o644);
		}
	}
	fs.rmSync(dirPath, { recursive: true, force: true });
}

/** Create the workspace directory structure. */
function createDirectoryStructure(workspacePath: string): void {
	const dirs = [
		".fabric",
		"context/product",
		"context/practices",
		"context/factory",
		"knowledge/practices",
		"knowledge/decisions",
		"knowledge/failures",
		"work/artifacts",
	];

	for (const dir of dirs) {
		fs.mkdirSync(path.join(workspacePath, dir), { recursive: true });
	}

	// Create default work/task-notes.md
	fs.writeFileSync(path.join(workspacePath, "work/task-notes.md"), "");
}

/** Write a knowledge item to the correct zone. Returns the relative path. */
function writeItem(workspacePath: string, item: KnowledgeItem, zone: string): string {
	const filename = toFilename(item.title);
	const relativePath = `${zone}/${filename}`;
	const fullPath = path.join(workspacePath, relativePath);

	fs.writeFileSync(fullPath, item.body);

	return relativePath;
}

/** Set all files in context/ to read-only (0o444). */
function setContextReadOnly(workspacePath: string): void {
	const contextDir = path.join(workspacePath, "context");
	if (!fs.existsSync(contextDir)) return;

	const setReadOnlyRecursive = (dir: string): void => {
		const entries = fs.readdirSync(dir, { withFileTypes: true });
		for (const entry of entries) {
			const fullPath = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				setReadOnlyRecursive(fullPath);
			} else if (entry.isFile()) {
				fs.chmodSync(fullPath, 0o444);
			}
		}
	};

	setReadOnlyRecursive(contextDir);
}

/** Fetch all items for a layer, handling pagination. */
function fetchAllForLayer(
	db: HyperIdleDb,
	layer: "L0" | "L1" | "L2" | "L3" | "L4",
	scopeId?: string,
): KnowledgeItem[] {
	const batchSize = 500;
	const allItems: KnowledgeItem[] = [];
	let offset = 0;

	while (true) {
		const batch = list(db, {
			layer,
			scopeId,
			limit: batchSize,
			offset,
		});
		allItems.push(...batch);
		if (batch.length < batchSize) break;
		offset += batchSize;
	}

	return allItems;
}

/** Materialize a workspace with knowledge items for an agent session. */
export async function materialize(
	db: HyperIdleDb,
	config: MaterializationConfig,
): Promise<MaterializationResult> {
	const start = performance.now();

	// Clean and recreate workspace structure
	cleanDirectory(path.join(config.workspacePath, "context"));
	cleanDirectory(path.join(config.workspacePath, "knowledge"));
	cleanDirectory(path.join(config.workspacePath, "work"));
	cleanDirectory(path.join(config.workspacePath, ".fabric"));
	createDirectoryStructure(config.workspacePath);

	const manifestItems: Record<string, ManifestEntry> = {};

	// L4 factory items -> context/factory/
	const l4Items = fetchAllForLayer(db, "L4");
	for (const item of l4Items) {
		const relativePath = writeItem(config.workspacePath, item, "context/factory");
		manifestItems[item.id] = {
			version: item.version,
			source_path: relativePath,
			format: item.format,
		};
	}

	// L2 product items -> context/product/
	const l2Items = fetchAllForLayer(db, "L2", config.productId);
	for (const item of l2Items) {
		const relativePath = writeItem(config.workspacePath, item, "context/product");
		manifestItems[item.id] = {
			version: item.version,
			source_path: relativePath,
			format: item.format,
		};
	}

	// L3 practices -> context/practices/ (role-filtered)
	const community = ROLE_TO_COMMUNITY[config.agentRole];
	const l3Items = fetchAllForLayer(db, "L3", community);
	for (const item of l3Items) {
		const relativePath = writeItem(config.workspacePath, item, "context/practices");
		manifestItems[item.id] = {
			version: item.version,
			source_path: relativePath,
			format: item.format,
		};
	}

	// Build session.toon -> context/session.toon
	const sessionToon = buildSessionContext(db, {
		sessionId: config.sessionId,
		taskId: config.taskId,
		agentId: config.agentId,
		agentRole: config.agentRole,
		productId: config.productId,
	});
	fs.writeFileSync(path.join(config.workspacePath, "context/session.toon"), sessionToon);

	// Set context/ to read-only
	setContextReadOnly(config.workspacePath);

	// Write manifest
	const manifest: Manifest = {
		session_id: config.sessionId,
		materialized_at: new Date().toISOString(),
		items: manifestItems,
	};

	fs.writeFileSync(
		path.join(config.workspacePath, ".fabric/manifest.json"),
		JSON.stringify(manifest, null, 2),
	);

	const durationMs = performance.now() - start;

	return {
		itemCount: Object.keys(manifestItems).length,
		manifest,
		durationMs,
	};
}
