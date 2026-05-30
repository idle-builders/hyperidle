# R3 Code Review: Block Rendering in Messages

VERDICT: **DONE** -- all 17 acceptance criteria pass. Zero critical findings. Five warnings for follow-up.

---

## AC Completeness Audit

| AC | Criterion | Status | Evidence |
|---|---|---|---|
| AC-1 | derivePayloads exists, returns BlockPayload[] | PASS | derive-payloads.ts:254; exported from blocks/index.ts:3 and shared/index.ts:24. Tests derive-payloads.test.ts:20-41. |
| AC-2 | Fenced code blocks -> code payloads | PASS | derive-payloads.ts:203-208. Tests lines 103-143. |
| AC-3 | Bold, italic, inline code, links -> correct inline nodes | PASS | inlineFromMd handles all four (lines 78-103). Tests lines 149-203. |
| AC-4 | Lists -> list payloads | PASS | mdNodeToPayload list case lines 188-194. Tests lines 209-242. |
| AC-5 | Headings -> heading payloads with correct level | PASS | mdNodeToPayload heading case lines 163-168. Tests lines 248-289. |
| AC-6 | Image -> downgraded to paragraph with alt text | PASS | paragraph case lines 170-185, image case lines 215-223. Tests lines 295-331. |
| AC-7 | Empty/whitespace -> [] | PASS | derivePayloads lines 255-257. Tests lines 81-97. |
| AC-8 | No BlockId, source, or anchor in output | PASS | Returns BlockPayload[] not Block[]. Tests lines 47-75 verify absence of identity fields. |
| AC-9 | CommentRow renders through payload pipeline | PASS | CommentRow.tsx:126 calls MessagePayloads. Tests lines 83-114. |
| AC-10 | Code blocks render with pre monospace | PASS | renderPayload dispatches to CodePayload. Tests lines 121-134. |
| AC-11 | Bold, italic, lists, headings render correctly | PASS | Tests lines 140-171. |
| AC-12 | Links as a with href | PASS | inline.tsx renders link nodes as a. Tests lines 177-204. |
| AC-13 | No-markdown messages render as single p (regression) | PASS | MessagePayloads fallback at line 82-84. Tests lines 210-229. |
| AC-14 | Existing message types unchanged | PASS | renderBody switch unchanged for verdict/review/questionnaire. Tests lines 235-245. |
| AC-15 | HTML sanitized via sanitizeHtml callback | PASS | Prop on CommentRowProps:61, threaded through renderBody. Tests lines 252-319. |
| AC-16 | javascript: URLs stripped | PASS | isLinkScheme uses LINK_URL_SAFE_SCHEMES allowlist. Tests lines 337-390. |
| AC-17 | Existing tests still pass | PASS | npm run verify: 5009 passed, 1 failed (pre-existing timeout in app-type.test.ts, unmodified by this branch). derive-blocks.ts not modified. |

---

## Findings

### Architecture

**A-1 (WARNING): Task 1 (extraction to md-to-payload.ts) was not performed.** Plan specified extracting shared parser internals into md-to-payload.ts. Builder duplicated ~160 lines into derive-payloads.ts instead. The two copies of mdNodeToPayload already diverge on image handling (intentional). No lore comment documents the duplication decision.

**A-2 (OBSERVATION): Layer integrity preserved.** design-system imports from shared (downward). sanitizeHtml threaded via props.

**A-3 (OBSERVATION): Concept boundary respected.** derivePayloads returns BlockPayload[] not Block[]. No Block identity computed.

**A-4 (OBSERVATION): sanitizeHtml threading completed per C-1.** ThreadShellProps and CommentRowProps both have the prop. CocOverlay.tsx does not pass it yet -- HTML blocks degrade to UnknownPayload (defense-in-depth, not a bug).

### Design

**D-1 (WARNING): Heading scale overrides from approved design missing.** approved.md specifies [&_h1]:text-[14px] child selectors on the wrapper div. Implementation omits them. All headings render at 13px (inherited from wrapper) instead of h1 at 14px. Cosmetic only.

**D-2 (WARNING): CommentRow stories not updated with markdown variant.** Stories file still uses payload: { text: "hello world" }. No story demonstrates markdown rendering (code blocks, bold, lists, headings).

**D-3 (OBSERVATION): Wrapper div styling matches approved design.** flex flex-col gap-[8px] text-[13px] text-[var(--text-mid)]. Token-only. Grid-aligned.

**D-4 (OBSERVATION): Text color cascade correct per W-1.** var(--text) undefined -> inherit -> wrapper's --text-mid cascades through. Builder correctly did NOT add [&_p] override.

### Security

**S-1 (PASS): javascript: URL stripping.** LINK_URL_SAFE_SCHEMES allowlist rejects hostile schemes. Tests verify.

**S-2 (PASS): HTML injection defense-in-depth.** Without sanitizeHtml, HTML degrades to UnknownPayload (raw source text, no DOM injection). Tests verify.

**S-3 (PASS): Image URL defense.** Images unconditionally downgraded. No img tags rendered from message content.

**S-4 (PASS): MAX_BODY_BYTES gate.** Oversized input returns [].

### Adversarial

**V-1 (WARNING): Three `as` casts in derive-payloads.ts.** Lines 164, 206, 263. All inherited from derive-blocks.ts (pre-existing pattern). Line 206 cast is unnecessary (the ?? null already narrows the type).

**V-2 (OBSERVATION): try-catch around processor.parse() is harmless defense-in-depth.** remark-parse never throws in practice. Comment documents this.

**V-3 (OBSERVATION): Test quality solid.** Structural assertions, not shallow toBeDefined(). AC-8 tests verify field absence. AC-15 uses vi.fn() to verify callback invocation.

### Simplification

**P-1 (WARNING): ~160 lines duplicated between derive-blocks.ts and derive-payloads.ts.** Functions: MdNode, MdRoot, isUrlInAllowlist, isLinkScheme, inlineFromMd, inlineToText, listItems, tableFromMd, plus partially-divergent mdNodeToPayload. Plan specified extraction; builder chose duplication for safety.

### AI Slop

No AI slop detected. Code is clean: no verbose naming, no filler, no over-engineering. @lore comments are substantive. biome-ignore suppression is justified with inline rationale.

---

## Verification

- `npm run check`: 0 type errors
- `npm run lint`: 0 lint errors
- `npm run verify`: 5009 passed, 1 failed (pre-existing), 40 skipped
- R3-specific tests: all 67 tests pass (derive-payloads.test.ts + CommentRow.markdown.test.tsx)
