/**
 * @lore AU19 Increment 3i: `IngestionHandle` moved here (behavior-preserving)
 * from `packages/server/src/services/contracts.ts` — that file's own top
 * comment already flagged it as "owned by the not-yet-migrated
 * session-lifecycle/context-assembly/tool-handlers domains — stays here
 * until its own owning Service migrates." `session-lifecycle` is the primary
 * owner (constructs/disposes it in `endSession`/`crashSession`); the two
 * still-flat `context-assembly`/`tools` consumers (`agent-context/assemble-context.ts`,
 * `tools/tool-registry.ts`) now import it from `@hyperidle/session-lifecycle`
 * — a legitimate composition-root-to-Service edge (neither file lives inside
 * a Service package yet), not a Service-to-Service import.
 */

export interface IngestionHandle {
	dispose(): void;
}
