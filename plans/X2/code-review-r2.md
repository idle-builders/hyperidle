# X2 Code Review — Round 2

**Reviewer:** Reviewer agent (Phase 4 re-review)
**Scope:** Targeted re-review of W1, S1, S2 fixes from Round 1
**Files reviewed:**
- `packages/server/src/mcp/mcp-bridge-registry.ts`
- `packages/server/src/services/session-provisioning.ts`

---

## Finding Resolution

### W1 (was blocking): `unregister` can crash teardown

**Status: RESOLVED.**

`mcpServer.close()` is now wrapped in try-catch (lines 64-70 of `mcp-bridge-registry.ts`). The Map entry is deleted *before* the close call (line 53), so the bridge is removed from the registry regardless of whether close succeeds. The catch block logs via `console.warn` with the token for traceability. The `@lore` comment (lines 59-63) documents the rationale: teardown must always complete, and the orphaned subprocess will be GC'd on process restart. This matches the architecture critique requirement.

### S1 (was suggestion): Silent bridge creation failure

**Status: RESOLVED.**

The catch block in `session-provisioning.ts` (lines 397-405) now logs via `console.warn` with the session ID and the error object. The message identifies the component (`[session-provisioning]`), the failure context (`MCP bridge creation failed for session ${sessionId}`), and the fallback behavior (`falling back to event-stream mode`). The biome-ignore annotation is appropriate given the observability adapter is not yet available.

### S2 (was suggestion): Misleading "Fire-and-forget" comment

**Status: RESOLVED.**

The comment at lines 535-536 of `session-provisioning.ts` now reads: "Await unregister to ensure cleanup is complete before teardown continues. unregister() swallows close() errors internally -- this call never throws." This accurately describes the `await mcpBridgeRegistry.unregister(mcpBridgeToken)` call on line 538. No misleading language remains.

---

## Verdict: DONE

All three findings from Round 1 are addressed. No new issues identified in the changed code.
