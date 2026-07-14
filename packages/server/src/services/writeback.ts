import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { type HyperIdleDb, knowledgeConflicts, sessions } from "@hyperidle/db";
import * as repo from "@hyperidle/knowledge";
import { eq } from "drizzle-orm";
import type { Manifest, ManifestEntry } from "./context-assembly.js";

export interface WritebackConfig {
	db: HyperIdleDb;
	/**
	 * @lore AK1: Renamed per harness-vocab plan (AK1).
	 */
	sandboxPath: string;
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

/** Check if a path is in the knowledge/ zone. */
export function isKnowledgePath(relativePath: string): boolean {
	return relativePath.startsWith("knowledge/");
}

/** Check if a path is the session notes file. */
export function isSessionNotesPath(relativePath: string): boolean {
	return relativePath === "work/session-notes.md" || relativePath === "work/task-notes.md";
}

/** Extract a title from a filename. */
function titleFromFilename(filename: string): string {
	const base = path.basename(filename, path.extname(filename));
	return base.replace(/[_-]/g, " ");
}

/** Process a batch of writeback changes. */
export async function processWriteback(
	config: WritebackConfig,
	changes: WritebackChange[],
): Promise<WritebackResult> {
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
			await handleSessionNotes(config, change);
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
				await handleCreate(config, change, manifest);
				result.created++;
				break;
			case "modify":
				{
					const modifyResult = await handleModify(config, change, manifest);
					if (modifyResult === "conflict") {
						result.conflicts++;
						result.updated++;
					} else if (modifyResult === "created") {
						result.created++;
					} else {
						result.updated++;
					}
				}
				break;
			case "delete":
				{
					const deleted = await handleDelete(config, change, manifest);
					if (deleted) {
						result.deleted++;
					}
				}
				break;
		}
		result.processed++;
	}

	// Write manifest back
	writeManifest(config.manifestPath, manifest);

	return result;
}

/** Handle a new file in knowledge/. */
async function handleCreate(
	config: WritebackConfig,
	change: WritebackChange,
	manifest: Manifest,
): Promise<void> {
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

	const item = await repo.create(config.db, {
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

/** Handle a modified file in knowledge/. Returns outcome type. */
async function handleModify(
	config: WritebackConfig,
	change: WritebackChange,
	manifest: Manifest,
): Promise<"updated" | "created" | "conflict"> {
	const existing = findItemByPath(manifest, change.relativePath);

	if (!existing) {
		// File exists on disk but not in manifest — treat as create
		await handleCreate(config, change, manifest);
		return "created";
	}

	const body = fs.readFileSync(change.fullPath, "utf-8");

	try {
		const updated = await repo.update(
			config.db,
			existing.itemId,
			{
				body,
				updatedBy: `session:${config.sessionId}`,
			},
			existing.entry.version,
		);

		// Update manifest version
		// @lore AF3 C3: existing.itemId was resolved from this manifest so the entry
		// is guaranteed present; use a local ref to avoid repeated index access.
		const manifestEntry = manifest.items[existing.itemId];
		if (manifestEntry !== undefined) {
			manifestEntry.version = updated.version;
		}
		return "updated";
	} catch (err) {
		if (err instanceof repo.VersionConflictError) {
			// Create conflict record
			const conflictId = crypto.randomUUID();
			await config.db.insert(knowledgeConflicts).values({
				id: conflictId,
				itemId: existing.itemId,
				versionBase: existing.entry.version,
				versionCurrent: err.currentVersion,
				proposedBody: body,
				proposedBy: `session:${config.sessionId}`,
				status: "open",
				createdAt: new Date().toISOString(),
			});

			// Update manifest to current version so subsequent writes don't keep conflicting
			const conflictEntry = manifest.items[existing.itemId];
			if (conflictEntry !== undefined) {
				conflictEntry.version = err.currentVersion;
			}

			return "conflict";
		}
		throw err;
	}
}

/** Handle a deleted file — flag for facilitator review, don't auto-delete. Returns true if flagged. */
async function handleDelete(
	config: WritebackConfig,
	change: WritebackChange,
	manifest: Manifest,
): Promise<boolean> {
	const existing = findItemByPath(manifest, change.relativePath);

	if (!existing) {
		return false; // Not tracked, nothing to do
	}

	// Create a review item flagging the deletion for facilitator
	const conflictId = crypto.randomUUID();
	await config.db.insert(knowledgeConflicts).values({
		id: conflictId,
		itemId: existing.itemId,
		versionBase: existing.entry.version,
		versionCurrent: existing.entry.version,
		proposedBody: "[DELETED]",
		proposedBy: `session:${config.sessionId}`,
		status: "open",
		createdAt: new Date().toISOString(),
	});

	// Remove from manifest (file is gone)
	delete manifest.items[existing.itemId];

	return true;
}

/** Handle session notes update. */
async function handleSessionNotes(config: WritebackConfig, change: WritebackChange): Promise<void> {
	const body = fs.readFileSync(change.fullPath, "utf-8");

	await config.db.update(sessions).set({ notes: body }).where(eq(sessions.id, config.sessionId));
}
