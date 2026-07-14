/**
 * `git-export` Service (core-api) — outbound composition-boundary (Mechanism C)
 * DI ports, per architecture §10.2's census: `git-export`'s one CENSUS-listed
 * outbound edge is `settings` (`git-export-config.ts`'s
 * `readServerConfig`/`updateServerConfig` calls, scoped to the
 * `server_config.gitExport` section), PLUS a genuinely NEW `-> knowledge`
 * edge the census missed entirely (`git-export.ts`'s `computeExportPlan`
 * queried `knowledgeItems`/`knowledgeAppProjection` directly — legal while
 * still inside the unguarded `packages/server` composition root, a Table ACL
 * violation the moment it becomes its own Service package; see
 * `@hyperidle/knowledge`'s `git-export-store.ts` top `@lore`).
 *
 * BOTH are ORDINARY downward core-api→core-api edges (NOT §10.3
 * against-grain) — `settings` and `knowledge` are already real migrated
 * packages, so both ports are wired directly to their real exported
 * functions by the composition root (`packages/server`, still unguarded),
 * same idiom as `notifications`' `NotificationsServerConfigPort`
 * (Increment 1g).
 *
 * Structural ports, same idiom as every prior Service's `ports.ts`: mirror
 * the real target function's signature so the concrete caller can pass its
 * existing function references unchanged — zero behavior change. Types are
 * declared locally (structural mirrors of the target Service's own types)
 * rather than imported from the target package — a Service NEVER imports
 * another Service, even for a type-only reference.
 */

import type { HyperIdleDb } from "@hyperidle/db";

export interface GitExportConfigSection {
	enabled: boolean;
	repoPath: string;
	remoteUrl: string | null;
	branch: string;
	authorName: string;
	authorEmail: string;
	debounceMs: number;
	allowFileRemote: boolean;
	repoRoot: string[];
	lastCommitAt: string | null;
	lastCommitSha: string | null;
	lastPushAt: string | null;
}

export interface GitExportConfigSectionPatch {
	enabled?: boolean;
	repoPath?: string;
	remoteUrl?: string | null;
	branch?: string;
	authorName?: string;
	authorEmail?: string;
	debounceMs?: number;
	lastCommitAt?: string;
	lastCommitSha?: string;
	lastPushAt?: string;
}

/** Port for `settings`' read/write surface `git-export-config.ts` calls directly today. */
export interface GitExportServerConfigPort {
	read(db: HyperIdleDb): Promise<{ gitExport: GitExportConfigSection }>;
	update(db: HyperIdleDb, patch: { gitExport: GitExportConfigSectionPatch }): Promise<unknown>;
}

export interface GitExportConfigDeps {
	readonly serverConfig: GitExportServerConfigPort;
}

// ---------------------------------------------------------------------------
// knowledge — GitExportKnowledgeReader (ordinary downward edge, `knowledge`
// is a REAL migrated package — census-missed edge, see this file's top `@lore`)
// ---------------------------------------------------------------------------

/** Structural mirror of `@hyperidle/knowledge`'s `ExportableKnowledgeItemRow`. */
export interface GitExportKnowledgeItemRow {
	readonly id: string;
	readonly topic: string | null;
	readonly title: string;
	readonly body: string;
	readonly version: number;
	readonly layer: string | null;
	readonly kind: string | null;
	readonly scopeId: string | null;
}

/** Structural mirror of `@hyperidle/knowledge`'s `KnowledgeItemProjectionRow`. */
export interface GitExportKnowledgeItemProjection {
	readonly layer: string | null;
	readonly kind: string | null;
}

/** Port for `knowledge`'s read surface `computeExportPlan`/the event handler call directly today. */
export interface GitExportKnowledgeReader {
	listExportableItems(
		db: HyperIdleDb,
		filters: { readonly layers: readonly string[]; readonly statuses: readonly string[] },
	): Promise<readonly GitExportKnowledgeItemRow[]>;
	getProjectionByItemId(
		db: HyperIdleDb,
		itemId: string,
	): Promise<GitExportKnowledgeItemProjection | null>;
}

/** Combined outbound-edge deps every `git-export` entry point needs. */
export interface GitExportDeps extends GitExportConfigDeps {
	readonly knowledge: GitExportKnowledgeReader;
}
