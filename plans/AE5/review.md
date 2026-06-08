# AE5 Code Review — Communication Refinements

**Reviewer:** Phase 4 (code against plan + concept + design)
**Verdict:** DONE (with warnings)

---

## AC Completeness

| AC | Status | Evidence |
|---|---|---|
| 1. Users can @mention a specific participant, and the mentioned user receives a notification (= added to thread.participants) | PASS | Integration test `threads.mention.integration.test.ts`: "message with @Aria adds Aria to thread participants" confirms participant addition. Server code in `resolveMentionsForMessage` (threads.ts:246-285) computes `newParticipantIds` and the transaction at line 822-830 atomically updates `threads.participants`. Initial thread creation also handled (threads.ts:581-601). |
| 2. @mentions are a recognized inline element within the block primitive (= MentionRef in InlineRef union) | PASS | `MentionRef` interface added to `thread.ts:127-132` with `kind: "mention"`. `InlineRefKind` updated at line 96-103 to include `"mention"` as 7th kind. `InlineRef` union updated at line 134. Type narrowing tests in `thread-mention-ref.test.ts` confirm discriminant works. Zod schema `mentionRefSchema` added to `threads-schema.ts:58-63` and integrated into `inlineRefSchema` union. |
| 3. Within conversations, user can see and navigate to thread's host context (bet, task, session) | PASS | `resolveHostRoute` in `host-route.ts` maps all 8 HostKind values to routes (null for user/factory). `resolveHostTitle` in `threads.ts:294-327` resolves bet/task/knowledge_item titles server-side. `useThreadDetail.ts` extended with `hostTitle` field. `Conversations.tsx:458-469` renders `<Tag>` + `<Link>` in the header. Integration test confirms `hostTitle: "Test task"` in response. Component test confirms link renders with correct href. |
| 4. Agent presence is visible — whether currently in an active session or idle | PASS | `buildThreadIdentities` in `threads.ts:130-172` extended with `isAgent` and `operationalStatus` derived from `sessions` table. `PresenceDot` component in `ThreadHostBanner.tsx:51-66` renders 6px dot (green for active, red for error, null for idle). `ThreadRow.tsx:18-33` has `ThreadRowPresenceDot` with same treatment. Stories added for both components. Integration test confirms `isAgent: true` and `operationalStatus: "idle"` in response. Component tests confirm dot rendering per status. |

---

## Phase 2 Critique Findings — Addressed?

| Critique Finding | Addressed? | Evidence |
|---|---|---|
| CRITICAL: MentionRef missing `sourceText` | YES | `MentionRef` in `thread.ts:131` includes `readonly sourceText: string`. The `@lore` comment at line 122-126 explicitly cites the arch-critique finding. |
| WARNING: No cap on mentions per message | YES | `MAX_MENTIONS_PER_MESSAGE = 20` in `mention.ts:19`. Enforced in `extractMentionCandidates` at line 80. `@lore` comment cites arch-critique. Integration test at mention.test.ts:88-94 verifies the cap. |
| WARNING: No protected-tests list | PARTIAL | The `@lore` comment at `thread.ts:91-93` lists known switch sites. No formal protected-tests block was added, but existing tests pass (3809/3809 unit, 2469/2471 integration — 2 failures are pre-existing X6 issues). |
| SUGGESTION: Extract PresenceDot to shared component | PARTIAL | ThreadHostBanner has `PresenceDot` (line 51-66). ThreadRow has `ThreadRowPresenceDot` (line 18-33). The `@lore` comments in both files note the arch-critique suggestion and document the choice. Not extracted to a shared file, but kept conceptually in sync. The duplication is 10 lines — acceptable per the plan's own assessment, though the critique recommended extraction. |
| SUGGESTION: Punctuation stripping on @name tokens | YES | `TRAILING_PUNCTUATION_RE` in `mention.ts:25` strips `.,!?;:'")\]` from @name tokens. Tests at `mention.test.ts:68-79` verify both comma and period stripping. |

---

## Findings by Lens

### Architecture (positive)

No findings. Layer discipline is clean throughout:
- `packages/shared/src/mention.ts` contains pure functions only (no DB, no HTTP, no React).
- `packages/server/src/routes/threads.ts` handles all DB queries and mention resolution.
- `packages/design-system/src/` components accept data props, no fetch logic.
- `packages/web/src/` wires data from hooks to design-system components.

The API contract extension is backward-compatible: `hostTitle`, `identities[id].isAgent`, and `identities[id].operationalStatus` are all optional fields added to existing response shapes.

### Design (positive)

**Stories delivered.** All three components (CommentRow, ThreadHostBanner, ThreadRow) have stories with AE5 variants:
- `CommentRow.stories.tsx:82-106` — `WithMention` story with two MentionRef entries.
- `ThreadHostBanner.stories.tsx:53-83` — `WithAgentPresence` story showing active/error/idle agents.
- `ThreadRow.stories.tsx:159-191` — `WithAgentPresence` story showing active/error/idle in avatar group.

**Design token compliance.** MentionToken uses `var(--accent-primary)` and `var(--r-pill)` — correct per spec. PresenceDot uses `var(--accent-primary)` for active and `var(--status-error)` for error — correct per spec. Context link uses `var(--text-secondary)` with hover to `var(--accent-primary)` — correct per spec.

**Accessibility.** PresenceDot carries `aria-label={name} - {status}` for screen reader access. MentionToken is not interactive (v1), so no tab stop — correct per design spec.

### Security (positive)

No new vulnerabilities introduced:
- @name parsing uses a regex that matches `\S+` after `@`. Injection attempts like `@<script>` resolve against the name map and are silently dropped (no match). React's JSX escaping prevents XSS in rendered text.
- `MAX_MENTIONS_PER_MESSAGE = 20` caps extraction, bounding both name-lookup queries and participant-addition operations per message.
- `buildMentionLookup` is scoped to team members (not all users in the system), limiting information disclosure.
- `hostTitle` resolution in `resolveHostTitle` queries by entity ID with `.limit(1)` — no injection vector.
- No new endpoints; existing auth middleware (`X-API-Key` + `X-Identity`) continues to apply.

---

### Adversarial (negative)

**WARNING — Zod schema/TS type mismatch on `sourceText`.** The `MentionRef` TypeScript interface (`thread.ts:131`) declares `sourceText: string` as required. But `mentionRefSchema` in `threads-schema.ts:62` declares `sourceText: z.string().optional()`. The `messageRowSchema` uses `inlineRefSchema` which includes `mentionRefSchema`, so when reading a stored message back from the DB, a MentionRef without `sourceText` would pass Zod validation but the TypeScript type says `sourceText` is always present. The `@lore` comment explains the rationale (server constructs MentionRefs with sourceText; clients don't send them), but on the read path this creates a soundness gap: `rowToMessage` at threads.ts:350-375 trusts the Zod-validated payload as matching the TS type, but Zod would accept a MentionRef without `sourceText`. In practice this is safe because the server always writes `sourceText` (see `resolveMentionsForMessage` at line 268-273), but the Zod schema should be `z.string().min(1)` (not `.optional()`) on the read path to enforce the invariant.

**WARNING — N+1 query in `buildThreadIdentities` for agent sessions.** For each AI user in the sender list, the function issues a separate `SELECT ... FROM sessions WHERE agentId = :id` query (threads.ts:155-161). With 5 agent senders, this is 5 serial queries inside a loop. The plan's trade-off analysis (section 10.3) says "batched query for all senders" but the implementation does per-agent queries. For the thread detail endpoint (typically 2-5 senders) this is acceptable, but it diverges from the plan's stated approach.

**WARNING — MentionToken `py-[3px]` diverges from design spec `py-[1px]`.** The design spec (`approved.md` line 177) specifies `py-[1px]` for the MentionToken padding. The implementation in `CommentRow.tsx:89` uses `py-[3px]`. Both values are on the Hearth 6px grid (3px is `--space-1`; 1px is exempt as internal padding), but the implementation does not match the approved design. This produces a taller token than specified.

### Simplification (negative)

**SUGGESTION — `resolveMentionsForMessage` intermediate function.** The function at threads.ts:246-285 wraps `extractMentionCandidates` + `buildMentionLookup` + `resolveMentions` + participant diffing. It is called from two places (POST /api/threads and POST /api/threads/:id/messages). This is a legitimate extraction — calling the same 3-function pipeline twice would be worse than extracting it. No simplification needed here.

**SUGGESTION — PresenceDot duplication.** ThreadHostBanner and ThreadRow each define their own PresenceDot component (~10 lines each). The implementations differ slightly: ThreadHostBanner's version uses `border-[var(--surface-container)]` while ThreadRow's uses `border-[var(--surface-elevated)]`. This is intentional (different background contexts), but a shared component with a `borderColor` prop would be cleaner. Low priority.

### AI Slop (negative)

**SUGGESTION — `_senderId` unused parameter.** In `resolveMentions` (mention.ts:123), the `senderId` parameter is prefixed with underscore (`_senderId`) and never referenced in the function body. The plan states "senderId parameter enables self-mention suppression" but the implementation does not use it — self-mention suppression is handled in `resolveMentionsForMessage` at the server layer (threads.ts:277-279). The parameter should either be used or removed. Currently it is dead code that misleads readers into thinking self-mention is handled in the shared layer.

No other slop detected. Comments are purposeful (mostly `@lore` annotations citing specific decisions). No `=== true` filler, no unnecessary async, no AI tell-tales.

---

## Summary

The implementation delivers all four ACs with clean architecture, proper test coverage, and good adherence to the Phase 2 critique findings. The three warnings (Zod optional vs required sourceText, N+1 session queries, MentionToken py value) are non-blocking but should be tracked for follow-up.

### Findings ranked by severity

| Severity | Finding | File | Line |
|---|---|---|---|
| WARNING | Zod `sourceText: z.string().optional()` vs TS `sourceText: string` — schema should be `.min(1)` not `.optional()` on the read path | `packages/server/src/routes/threads-schema.ts` | 62 |
| WARNING | N+1 session queries in `buildThreadIdentities` — per-agent query loop instead of batched | `packages/server/src/routes/threads.ts` | 155-161 |
| WARNING | MentionToken `py-[3px]` diverges from design spec `py-[1px]` | `packages/design-system/src/CommentRow.tsx` | 89 |
| SUGGESTION | `_senderId` parameter in `resolveMentions` is unused dead code | `packages/shared/src/mention.ts` | 123 |
| SUGGESTION | PresenceDot duplication between ThreadHostBanner and ThreadRow — borderColor differs by context | `packages/design-system/src/ThreadHostBanner.tsx` + `ThreadRow.tsx` | 51-66, 18-33 |
