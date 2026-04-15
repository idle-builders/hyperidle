import * as fs from "node:fs";
import * as path from "node:path";
import { type HyperIdleDb, knowledgeConflicts, sessions } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { VersionConflictError } from "./errors.js";
import * as repo from "./knowledge-repository.js";
import type { Manifest, ManifestEntry } from "./materialization.js";

export interface WritebackConfig {
	db: HyperIdleDb;
	workspacePath: string;
	sessionId: string;
	manifestPath: string;
}

export interface WritebackChange {
	type: "create" | "modify" | "delete";
	relativePath: string;
	fullPath: string;
}

export interface WritebackResult {
	processed: number;
	created: number;
	updated: number;
	deleted: number;
	conflicts: number;
}

/** Read the manifest from disk. */
export function readManifest(manifestPath: string): Manifest {
	const raw = fs.readFileSync(manifestPath, "utf-8");
	return JSON.parse(raw) as Manifest;
}

/** Write the manifest back to disk. */
export function writeManifest(manifestPath: string, manifest: Manifest): void {
	fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

/** Find the item ID for a given relative path in the manifest. */
function findItemByPath(
	manifest: Manifest,
	relativePath: string,
): { itemId: string; entry: ManifestEntry } | null {
	for (const [itemId, entry] of Object.entries(manifest.items)) {
		if (entry.source_path === relativePath) {
			return { itemId, entry };
		}
	}
	return null;
}

/** Determine the relative path of a file within the workspace. */
export function getRelativePath(workspacePath: string, fullPath: string): string {
	return path.relative(workspacePath, fullPath);
}

/** Check if a path is in the knowledge/ zone. */
export function isKnowledgePath(relativePath: string): boolean {
	return relativePath.startsWith("knowledge/");
}

/** Check if a path is the session notes file. */
export function isSessionNotesPath(relativePath: string): boolean {
	return relativePath === "work/session-notes.md" || relativePath === "work/task-notes.md";
}

/** Check if a path is in a watched zone (knowledge/ or work/). */
export function isWatchedPath(relativePath: string): boolean {
	return relativePath.startsWith("knowledge/") || relativePath.startsWith("work/");
}

/** Extract a title from a filename. */
function titleFromFilename(filename: string): string {
	const base = path.basename(filename, path.extname(filename));
	return base.replace(/[_-]/g, " ");
}

/** Process a batch of writeback changes. */
export function processWriteback(
	config: WritebackConfig,
	changes: WritebackChange[],
): WritebackResult {
	const result: WritebackResult = {
		processed: 0,
		created: 0,
		updated: 0,
		deleted: 0,
		conflicts: 0,
	};

	const manifest = readManifest(config.manifestPath);

	for (const change of changes) {
		const relativePath = change.relativePath;

		// Handle session notes specially
		if (isSessionNotesPath(relativePath) && change.type !== "delete") {
			handleSessionNotes(config, change);
			result.processed++;
			result.updated++;
			continue;
		}

		// Only knowledge/ files create/update knowledge_items
		if (!isKnowledgePath(relativePath)) {
			result.processed++;
			continue;
		}

		switch (change.type) {
			case "create":
				handleCreate(config, change, manifest);
				result.created++;
				break;
			case "modify":
				{
					const conflicted = handleModify(config, change, manifest);
					if (conflicted) {
						result.conflicts++;
					}
					result.updated++;
				}
				break;
			case "delete":
				handleDelete(config, change, manifest);
				result.deleted++;
				break;
		}
		result.processed++;
	}

	// Write manifest back
	writeManifest(config.manifestPath, manifest);

	return result;
}

/** Handle a new file in knowledge/. */
function handleCreate(config: WritebackConfig, change: WritebackChange, manifest: Manifest): void {
	const body = fs.readFileSync(change.fullPath, "utf-8");
	const title = titleFromFilename(change.relativePath);

	// Determine kind from subdirectory
	const parts = change.relativePath.split("/");
	let kind: "pattern" | "decision" | "failure" | "reflection" = "pattern";
	if (parts.length > 1) {
		const subdir = parts[1];
		if (subdir === "decisions") kind = "decision";
		else if (subdir === "failures") kind = "failure";
		else if (subdir === "practices") kind = "pattern";
	}

	const item = repo.create(config.db, {
		layer: "L1",
		kind,
		title,
		body,
		format: "markdown",
		status: "captured",
		updatedBy: `session:${config.sessionId}`,
	});

	// Add to manifest
	manifest.items[item.id] = {
		version: item.version,
		source_path: change.relativePath,
		format: item.format,
	};
}

/** Handle a modified file in knowledge/. Returns true if conflict detected. */
function handleModify(
	config: WritebackConfig,
	change: WritebackChange,
	manifest: Manifest,
): boolean {
	const existing = findItemByPath(manifest, change.relativePath);

	if (!existing) {
		// File exists on disk but not in manifest — treat as create
		handleCreate(config, change, manifest);
		return false;
	}

	const body = fs.readFileSync(change.fullPath, "utf-8");

	try {
		const updated = repo.update(
			config.db,
			existing.itemId,
			{
				body,
				updatedBy: `session:${config.sessionId}`,
			},
			existing.entry.version,
		);

		// Update manifest version
		manifest.items[existing.itemId].version = updated.version;
		return false;
	} catch (err) {
		if (err instanceof VersionConflictError) {
			// Create conflict record
			const conflictId = crypto.randomUUID();
			config.db
				.insert(knowledgeConflicts)
				.values({
					id: conflictId,
					itemId: existing.itemId,
					versionBase: existing.entry.version,
					versionCurrent: err.currentVersion,
					proposedBody: body,
					proposedBy: `session:${config.sessionId}`,
					status: "open",
					createdAt: new Date().toISOString(),
				})
				.run();

			// Update manifest to current version so subsequent writes don't keep conflicting
			manifest.items[existing.itemId].version = err.currentVersion;

			return true;
		}
		throw err;
	}
}

/** Handle a deleted file — flag for facilitator review, don't auto-delete. */
function handleDelete(config: WritebackConfig, change: WritebackChange, manifest: Manifest): void {
	const existing = findItemByPath(manifest, change.relativePath);

	if (!existing) {
		return; // Not tracked, nothing to do
	}

	// Create a review item flagging the deletion for facilitator
	const conflictId = crypto.randomUUID();
	config.db
		.insert(knowledgeConflicts)
		.values({
			id: conflictId,
			itemId: existing.itemId,
			versionBase: existing.entry.version,
			versionCurrent: existing.entry.version,
			proposedBody: "[DELETED]",
			proposedBy: `session:${config.sessionId}`,
			status: "open",
			createdAt: new Date().toISOString(),
		})
		.run();

	// Remove from manifest (file is gone)
	delete manifest.items[existing.itemId];
}

/** Handle session notes update. */
function handleSessionNotes(config: WritebackConfig, change: WritebackChange): void {
	const body = fs.readFileSync(change.fullPath, "utf-8");

	config.db.update(sessions).set({ notes: body }).where(eq(sessions.id, config.sessionId)).run();
}
