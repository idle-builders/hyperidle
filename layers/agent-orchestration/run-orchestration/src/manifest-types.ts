/** Shared manifest shape between writer (context.ts) and reader (writeback-processor.ts) — both sides import this; drift fails at compile time. */

export interface ManifestEntry {
	version: number;
	source_path: string;
	format: string;
	// @lore: scopeKind — carried on every entry (dirs included); directory scope known from manifest alone; child inherits without a knowledgeItems read
	scopeKind: string;
}

export interface Manifest {
	session_id: string;
	assembled_at: string;
	items: Record<string, ManifestEntry>;
}
