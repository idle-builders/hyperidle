import * as fs from "node:fs";
import * as path from "node:path";
import { type HyperIdleDb, type KnowledgeItem, tasks } from "@hyperidle/db";
import type { UserRole } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { list } from "./knowledge-repository.js";
import { rankAndBudget } from "./relevance-scoring.js";
import { communityForRole } from "./role-community-map.js";
import type { ScoringContext } from "./scoring-config.js";
import { DEFAULT_KNOWLEDGE_BUDGET, loadScoringWeights } from "./scoring-config.js";
import { buildSessionContext } from "./session-context.js";

export interface MaterializationConfig {
	workspacePath: string;
	sessionId: string;
	taskId: string;
	agentId: string;
	agentRole: UserRole;
	productId: string;
}

export interface ManifestEntry {
	version: number;
	// biome-ignore lint/style/useNamingConvention: manifest JSON schema uses snake_case keys
	source_path: string;
	format: string;
}

export interface Manifest {
	// biome-ignore lint/style/useNamingConvention: manifest JSON schema uses snake_case keys
	session_id: string;
	// biome-ignore lint/style/useNamingConvention: manifest JSON schema uses snake_case keys
	materialized_at: string;
	items: Record<string, ManifestEntry>;
}

export interface MaterializationResult {
	itemCount: number;
	manifest: Manifest;
	durationMs: number;
}

/**
 * Sanitize a title to a safe filename with an item ID suffix to prevent
 * title collisions.
 *
 * @lore I6: previously two items with the same title would overwrite each
 * other during materialization. The truncated ID suffix (first 8 chars of
 * the UUID) makes filenames unique while keeping them readable.
 */
function toFilename(title: string, itemId?: string): string {
	const suffix = itemId ? `_${itemId.slice(0, 8)}` : "";
	// If title already looks like a filename, keep it (with suffix before extension)
	if (/\.\w+$/.test(title)) {
		const sanitized = title.replace(/[/\\:*?"<>|]/g, "_");
		const dotIdx = sanitized.lastIndexOf(".");
		return `${sanitized.slice(0, dotIdx)}${suffix}${sanitized.slice(dotIdx)}`;
	}
	// Otherwise slugify and add .md
	const slug = title.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_");
	return `${slug}${suffix}.md`;
}

/** Remove directory recursively, handling read-only files. */
function cleanDirectory(dirPath: string): void {
	if (!fs.existsSync(dirPath)) return;

	// Make everything writable first so we can delete
	const entries = fs.readdirSync(dirPath, { withFileTypes: true, recursive: true });
	for (const entry of entries) {
		// @lore AF3 C10: Dirent.path was removed from @types/node on Node 26;
		// use parentPath (always defined for recursive reads). The `?? entry.path`
		// fallback was dead code referencing a nonexistent property — drop it.
		const fullPath = path.join(entry.parentPath, entry.name);
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
	const filename = toFilename(item.title, item.id);
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
async function fetchAllForLayer(
	db: HyperIdleDb,
	layer: "L0" | "L1" | "L2" | "L3" | "L4",
	scopeId?: string,
): Promise<KnowledgeItem[]> {
	const batchSize = 500;
	const allItems: KnowledgeItem[] = [];
	let offset = 0;

	while (true) {
		const batch = await list(db, {
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

	// Fetch all items by layer
	const community = communityForRole(config.agentRole);
	const [l4Items, l2Items, l3Items] = await Promise.all([
		fetchAllForLayer(db, "L4"),
		fetchAllForLayer(db, "L2", config.productId),
		fetchAllForLayer(db, "L3", community),
	]);

	// @lore I6: apply rankAndBudget() before writing items to workspace.
	// This ensures that the agent's context window is not overwhelmed by
	// low-relevance knowledge. Items are scored against the task context
	// and trimmed to fit the configured token budget.
	const weights = await loadScoringWeights(db);

	// Build a minimal scoring context from materialization config.
	// Task description is fetched from the DB if available.
	const [task] = await db.select().from(tasks).where(eq(tasks.id, config.taskId)).limit(1);
	const scoringContext: ScoringContext = {
		taskDescription: task?.description ?? task?.title ?? "",
		taskTags: [],
		agentRole: config.agentRole,
		productId: config.productId,
	};

	const allItems = [...l4Items, ...l2Items, ...l3Items];
	const budgetedItems = rankAndBudget(allItems, scoringContext, weights, DEFAULT_KNOWLEDGE_BUDGET);

	// Build a Set of budgeted item IDs for fast lookup
	const budgetedIds = new Set(budgetedItems.map((i) => i.id));

	// Write only budgeted items to their respective zones
	for (const item of l4Items) {
		if (!budgetedIds.has(item.id)) continue;
		const relativePath = writeItem(config.workspacePath, item, "context/factory");
		manifestItems[item.id] = {
			version: item.version,
			source_path: relativePath,
			format: item.format,
		};
	}

	for (const item of l2Items) {
		if (!budgetedIds.has(item.id)) continue;
		const relativePath = writeItem(config.workspacePath, item, "context/product");
		manifestItems[item.id] = {
			version: item.version,
			source_path: relativePath,
			format: item.format,
		};
	}

	for (const item of l3Items) {
		if (!budgetedIds.has(item.id)) continue;
		const relativePath = writeItem(config.workspacePath, item, "context/practices");
		manifestItems[item.id] = {
			version: item.version,
			source_path: relativePath,
			format: item.format,
		};
	}

	// Build session.toon -> context/session.toon
	const sessionToon = await buildSessionContext(db, {
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
