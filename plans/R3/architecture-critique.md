# R3 Architecture Critique: Block Rendering in Messages

ARCHITECTURE-SCORE: 8/10 rounds=1 score-line: SA:8 LI:9 AC:9 DM:9 N:9 MD:9 FMC:7 S:8 V:8

---

## Dimension Scores

| Dimension | Score | Notes |
|---|---|---|
| Spec Alignment | 8/10 | 17 ACs map to 7 tasks. All spec ACs covered. Derived ACs (image downgrade, empty input, no Block identity, javascript: URL) are legitimate constraints. Minor gap: "no syntax highlighting" has no explicit AC. |
| Layer Integrity | 9/10 | derivePayloads in shared (accessible to all). CommentRow in design-system imports from shared (downward dep). sanitizeHtml injected via prop. One error: Task 5 misidentifies the consumer package (see C-1). |
| API Contracts | 9/10 | No new routes. Function signatures fully typed. Closed union types reused. |
| Data Model | 9/10 | No schema changes. Payloads derived at render time, not persisted. |
| Naming | 9/10 | derivePayloads signals BlockPayload[] output. md-to-payload.ts honest. No collisions. |
| Module Depth | 9/10 | One new export (derivePayloads), one new optional prop (sanitizeHtml). Extraction adds internal-only exports. |
| Failure-Mode Coverage | 7/10 | Trust boundary identified. Four XSS layers. But sanitizeHtml threading gap (C-1) means html payloads degrade to UnknownPayload in practice. Risk #4 cascade analysis is wrong (W-1). |
| Simplicity | 8/10 | Design-it-twice is genuine. No unnecessary abstractions. Component tests justified for wiring verification. |
| Verifiability | 8/10 | Every AC has named test and assertion. Protected tests listed. Test file path inconsistent with convention (W-2). |

---

## CRITICAL

**C-1. [Phase 0 Q2 + Task 5] sanitizeHtml consumer identification is wrong.** The plan says consumers in `packages/web/src/` render CommentRow and need to pass sanitizeHtml. The actual consumer is `ThreadShell.tsx` at `packages/design-system/src/ThreadShell.tsx` (lines 423, 440). ThreadShell is in the design-system package, not web. This means either:

- (a) ThreadShell needs a sanitizeHtml prop threaded from its consumer (Conversations.tsx in web), or
- (b) ThreadShell imports a sanitizer directly (violates design-system's framework-agnostic constraint).

Option (a) requires adding sanitizeHtml to ThreadShellProps and threading from Conversations.tsx. Without this, sanitizeHtml never reaches CommentRow and all HTML blocks in messages silently degrade to UnknownPayload.

Task 5 must be updated to specify this prop threading path: Conversations.tsx -> ThreadShell -> CommentRow.

## WARNING

**W-1. [Risk #4] Incorrect cascade analysis.** The plan states ParagraphPayload's `color: var(--text)` overrides the wrapper's cascade and proposes `[&_p]:text-[var(--text-mid)]` as a fix. This is wrong. `--text` is not defined in tokens.css. When an undefined custom property is used via var() with no fallback, the CSS color property resolves to `initial` (which means `inherit`). ParagraphPayload inherits from the parent. The wrapper's text-[var(--text-mid)] cascades through correctly. Same applies to ListPayload. The builder must NOT add `[&_p]:text-[var(--text-mid)]`.

**W-2. [Task 3] Test file path inconsistent with convention.** Plan places derive-payloads.test.ts at `packages/shared/src/__tests__/derive-payloads.test.ts`. All block-related tests are under `packages/shared/src/__tests__/blocks/` (derive-blocks.test.ts, edge-cases.test.ts, round-trip.test.ts, etc.). Should be `packages/shared/src/__tests__/blocks/derive-payloads.test.ts`.

**W-3. [Task 4] renderBody signature change narrative is confusing.** renderBody is a standalone function (not a component), so it cannot use hooks. The plan correctly puts useMemo inside the MessagePayloads component (which IS a component), but the surrounding text about passing sanitizeHtml "as a parameter to renderBody" conflates two different concerns. The builder should follow the code example, not the narrative.

**W-4. [Protected tests] List may be incomplete.** Plan lists 5 files but omits `packages/shared/src/__tests__/blocks/round-trip.test.ts`, `fuzz.test.ts`, and `golden-ids.test.ts`. These import from derive-blocks.ts which is refactored in Task 1.

## SUGGESTION

**S-1.** Consider whether sanitizeHtml should be threaded via React context rather than props, to avoid modifying ThreadShellProps for a cross-cutting concern. Context adds complexity but avoids prop drilling.

**S-2.** The try-catch around `processor.parse()` in derivePayloads is harmless defense-in-depth. remark-parse in practice never throws on malformed input. A comment noting this would prevent future devs from adding unnecessary error handling layers.

**S-3.** key={i} on payloads in the map is safe (payloads derived from immutable text, order stable) but a brief comment prevents future flagging.

## What is working well

- Extraction strategy (factor shared internals to md-to-payload.ts) is the correct choice over calling deriveBlocks and stripping. Clean module boundary. Design-it-twice comparison is genuine.
- Concept boundary maintained throughout: derivePayloads returns BlockPayload[] not Block[], CommentRow uses renderPayload not Block component, no changes to Block primitive types.

---

**Verdict: PASS at 8/10.** C-1 requires updating Task 5 to specify the ThreadShell prop threading path but does not require a plan rewrite. W-1 is important for the builder to avoid dead CSS. Architecture is sound.
