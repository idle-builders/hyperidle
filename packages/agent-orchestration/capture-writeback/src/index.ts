/**
 * Barrel for @hyperidle/capture-writeback (agent-orchestration Layer Service).
 *
 * Typed functions only. Owns ZERO tables (confirmed this increment, matching
 * the architecture §4 roster's original `—`/`—` placeholder — same
 * "confirmed, not assumed" verification `agent-selection` (Increment 3e) and
 * `session-requests` (Increment 3b) already did for their own roster rows).
 * Every foreign-Service reach (`knowledge`) is an injected DI port
 * (`ports.ts`) — never a raw cross-package import. The `context-assembly`
 * edge is a pure-type structural mirror (no port method — see `ports.ts`'s
 * top `@lore`). The inbound `filesystems ⚠ capture-writeback` against-grain
 * edge inverts through the `EventBus` (`writeback-subscriber.ts`), not a
 * port at all.
 *
 * @lore AU19 Increment 3f: real cut-over — `writeback.ts` +
 * `session-activity-buffer.ts` (+ its test) moved here from
 * `packages/server/src/services/` (behavior-preserving move). `writeback.ts`'s
 * two raw `@hyperidle/knowledge` cross-Service imports (`create`/`update`/
 * `VersionConflictError`) and two raw `knowledgeConflicts` table inserts
 * became one injected `CaptureWritebackKnowledgeWriter` port (3 call sites —
 * a census correction, see `ports.ts`). `session-activity-buffer.ts` has no
 * outbound edges (pure EventBus subscriber, zero DB/Service dependency) —
 * moved unchanged.
 */

// -- ports (Mechanism C — DI-injected outbound edges) --
export type {
	CaptureWritebackCreateKnowledgeItemInput,
	CaptureWritebackDeps,
	CaptureWritebackKnowledgeItem,
	CaptureWritebackKnowledgeKind,
	CaptureWritebackKnowledgeLayer,
	CaptureWritebackKnowledgeWriter,
	CaptureWritebackManifest,
	CaptureWritebackManifestEntry,
	CaptureWritebackRecordConflictInput,
	CaptureWritebackUpdateResult,
} from "./ports.js";
// -- session-activity-buffer (Q1 §6.1 — in-memory ring buffer) --
export type { ActivityEntry, ToolCallData } from "./session-activity-buffer.js";
export { SessionActivityBuffer } from "./session-activity-buffer.js";
// -- writeback (batch knowledge/session-notes ingestion from the sandbox) --
export type { WritebackChange, WritebackConfig, WritebackResult } from "./writeback.js";
export {
	isKnowledgePath,
	isSessionNotesPath,
	processWriteback,
	readManifest,
	writeManifest,
} from "./writeback.js";
// -- writeback-subscriber (§10.3 EventBus inversion — filesystems ⚠ capture-writeback) --
export type { CaptureWritebackSubscriberDeps } from "./writeback-subscriber.js";
export { registerCaptureWriteback } from "./writeback-subscriber.js";
