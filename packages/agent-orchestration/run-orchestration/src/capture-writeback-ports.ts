/**
 * `capture-writeback` Service (agent-orchestration) — outbound Mechanism-C
 * DI ports, per architecture §10.2's census (as refined during this
 * migration — the census is "a floor, refinable during migration", §14).
 *
 * @lore AU19 Increment 3f: `writeback.ts` (pre-migration) imported
 * `@hyperidle/knowledge`'s `create`/`update`/`VersionConflictError` directly
 * — legal while it lived in the unguarded `packages/server` composition
 * root, a Mechanism-C violation the moment it becomes its own Service
 * package. `update`'s conflict signal (`throw VersionConflictError`) cannot
 * cross a port boundary as an `instanceof` check — importing the error class
 * itself would be exactly the banned cross-Service reference Mechanism C
 * forbids. Instead the port's `update` returns a discriminated
 * `CaptureWritebackUpdateResult`; the composition root (`packages/server`,
 * the one place that legally imports both `@hyperidle/knowledge` and this
 * port) does the try/catch → result translation when wiring the concrete
 * implementation. Zero behavior change: the real `knowledge.update()` still
 * throws internally, only the port's return shape differs.
 *
 * The migration also surfaced that `writeback.ts` wrote directly to
 * `knowledgeConflicts` (`knowledge`'s `TABLE_OWNER`) via raw
 * `db.insert(...)` TWICE (the modify-conflict branch, the delete-flag
 * branch) — legal in the unguarded composition root, a Table ACL violation
 * now. Both call sites converted to `recordConflict`, wired to a new
 * `@hyperidle/knowledge` export, `recordWritebackConflict`
 * (`writeback-conflict-store.ts`). Real `capture-writeback → knowledge` edge
 * count: 3 call sites (`create`, `update`, `recordConflict`), not the
 * originally-census'd 2 — §10.1/§10.2 updated.
 *
 * `capture-writeback → context-assembly` (1 call site, `Manifest`/
 * `ManifestEntry`) is a PURE-TYPE edge — `writeback.ts` never calls a
 * `context-assembly` function, it only shares the on-disk manifest JSON
 * shape. `context-assembly.ts` (the producer) is not yet a real migrated
 * package (still `packages/server/src/services/context-assembly.ts`,
 * scheduled for its own later "finalize context-assembly" item), and even a
 * real target's types are never imported cross-Service (Mechanism C) — so
 * the shape is declared locally here, a structural mirror, same idiom
 * `agent-selection`'s `TeamMember` mirror already established (`ports.ts`).
 *
 * @lore AU20 B2c: folded from `@hyperidle/capture-writeback` into
 * `@hyperidle/run-orchestration`. Renamed from `ports.ts` to
 * `capture-writeback-ports.ts` to avoid collision with run-orchestration's
 * own `ports.ts`.
 */
import type { HyperIdleDb } from "@hyperidle/db";

// ---------------------------------------------------------------------------
// knowledge — CaptureWritebackKnowledgeWriter (ordinary downward edge, real target)
// ---------------------------------------------------------------------------

export type CaptureWritebackKnowledgeLayer = "L1" | "L2" | "L3";
export type CaptureWritebackKnowledgeKind = "pattern" | "decision" | "failure" | "reflection";

export interface CaptureWritebackCreateKnowledgeItemInput {
	readonly layer: CaptureWritebackKnowledgeLayer;
	readonly kind: CaptureWritebackKnowledgeKind;
	readonly title: string;
	readonly body: string;
	readonly format: string;
	/** `writeback.ts` always creates items in "captured" state — narrowed to the one literal it uses. */
	readonly status: "captured";
	readonly updatedBy: string;
}

/** Narrowed to the three fields `writeback.ts` actually reads off a created/updated item. */
export interface CaptureWritebackKnowledgeItem {
	readonly id: string;
	readonly version: number;
	readonly format: string;
}

export type CaptureWritebackUpdateResult =
	| { readonly ok: true; readonly item: CaptureWritebackKnowledgeItem }
	| { readonly ok: false; readonly currentVersion: number };

export interface CaptureWritebackRecordConflictInput {
	readonly itemId: string;
	readonly versionBase: number;
	readonly versionCurrent: number;
	readonly proposedBody: string;
	readonly proposedBy: string;
}

/** Port for `knowledge`'s create/update/conflict-record surface `writeback.ts` calls directly today. */
export interface CaptureWritebackKnowledgeWriter {
	create(
		db: HyperIdleDb,
		input: CaptureWritebackCreateKnowledgeItemInput,
	): Promise<CaptureWritebackKnowledgeItem>;
	update(
		db: HyperIdleDb,
		id: string,
		patch: { readonly body: string; readonly updatedBy: string },
		expectedVersion: number,
	): Promise<CaptureWritebackUpdateResult>;
	recordConflict(db: HyperIdleDb, input: CaptureWritebackRecordConflictInput): Promise<void>;
}

/** Aggregate deps this Service's DB-touching functions need. */
export interface CaptureWritebackDeps {
	readonly knowledge: CaptureWritebackKnowledgeWriter;
}

// ---------------------------------------------------------------------------
// context-assembly — Manifest/ManifestEntry (pure-type structural mirror;
// see this file's top `@lore` for why this isn't a port method)
// ---------------------------------------------------------------------------

export interface CaptureWritebackManifestEntry {
	version: number;
	// biome-ignore lint/style/useNamingConvention: manifest JSON schema uses snake_case keys
	source_path: string;
	format: string;
}

export interface CaptureWritebackManifest {
	// biome-ignore lint/style/useNamingConvention: manifest JSON schema uses snake_case keys
	session_id: string;
	// biome-ignore lint/style/useNamingConvention: manifest JSON schema uses snake_case keys
	assembled_at: string;
	items: Record<string, CaptureWritebackManifestEntry>;
}
