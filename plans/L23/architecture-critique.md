# L23 — Architecture critique (Phase 2 reviewer)

Critiquing `plans/L23/architecture.md`. Round 1 of up to 3. Threshold: every dimension ≥ 7.

## Scoring

| Dim | Score | Rationale |
|---|---|---|
| Surface-area discipline | 9 | One new component (`KnowledgeBody.tsx`), one CSS scope, three test files, one Playwright spec. Zero new types, zero API endpoints, zero schema columns, zero workspace deps. The diff matches the spec. |
| Contract clarity | 8 | Imports `deriveBlocks` and `Block` from existing workspace packages; calls them with their already-shipped APIs. The L2 `BlockHostKind` enum is honoured (`"knowledge_item"` is a member of `BLOCK_HOST_KINDS` at `packages/shared/src/blocks/types.ts:20`). One soft spot: § 2 says the props are "a 3-field local interface" but `KnowledgeBodyProps` in `approved.md` declares `body | hostId | testId` — the props don't expose `sanitizeHtml` even though the architecture passes `DOMPurify.sanitize` to every `Block`. That's fine for now (one host, one sanitiser) but should be called out as an intentional encapsulation, not an oversight. |
| Type safety | 8 | No new `any`. No `as` casts proposed. `BlockId` is branded — the plan correctly uses `block.id` as the React key (a branded string is still a `string`, so `key={b.id}` typechecks). |
| Error handling | 7 | Empty body → empty-state branch. >256 KB body → L2 emits a single `unknown` block; `KnowledgeBody` does no special handling (R4). Malformed markdown → `deriveBlocks` is total over `string` per L2's design (no thrown errors documented in `derive-blocks.ts`). Sanitiser errors — `DOMPurify.sanitize` swallows internally and returns a stripped string, won't throw. **Gap:** there is no test for "raw HTML body containing `<script>` tag is sanitised" — T4 only asserts that `kind: "html"` renders a `<div>`, not that `<script>` is stripped. Add an explicit security test (see Security below). |
| Test plan completeness | 7 | T1–T10 + E1–E3 cover the AC matrix in § 9. **Gaps:** (a) no test asserts `LEGACY_DETAILS` import is removed from the production bundle (T10's "grep test or import-graph assertion" is hand-wavy — pick one); (b) no test exercises the markdown-on-disk invariant ("bodies in persistence stay text, never JSON") — see Architecture below; (c) T7 says "confirm the `block.kind` set covers the supported kinds in a fixture body" but the kind enum has 10 members and authoring a single body with all 10 (incl. `image`, `html`, `unknown`) is awkward. Acceptable as written but the fixture body should be specified, not left as "a fixture body". |
| Performance | 8 | Sub-millisecond `deriveBlocks` per call; `useMemo` keyed `[body, hostId]` re-derives only on body change. **Concern:** edit-mode preview re-derives on every keystroke. For a 256 KB body that is still <1 ms; for typical Knowledge bodies (< 10 KB) it is negligible. No need to debounce. The plan does not measure this — adding a single Vitest performance assertion (e.g. < 50 ms p95 over 100 derive calls) would make the claim defensible. Optional. |
| Security (sanitisation, XSS) | 6 | `Block` requires `sanitizeHtml` for `kind: "html"` rendering. Plan correctly passes `DOMPurify.sanitize`. **But:** (a) `DOMPurify.sanitize` defaults are permissive — `<a href="javascript:…">` is stripped, but `target=_blank` without `rel="noopener"` is preserved. State the call: "default DOMPurify config" or "strict allowlist". (b) The `kind: "html"` payload in `deriveBlocks` (line 268) preserves `node.value ?? ""` raw from `mdast`. Any user-authored `<script>`, `<iframe>`, `<style>`, `<object>`, `data:` URL must be stripped at the renderer boundary. Add a security test: body containing `<script>alert(1)</script>` rendered through `KnowledgeBody` produces no `<script>` element in the DOM and no `eval`-able payload. Required, not optional. (c) Markdown can also embed `[click](javascript:alert(1))` link payloads; `ParagraphPayload`/`ListPayload` render inline links via `renderInline`. The plan does not address whether `renderInline` strips `javascript:` URIs. This is L2's responsibility but L23 inherits the surface — flag as a pre-merge confirm-via-grep, not a re-architect. |
| Simplicity | 9 | Two-step pipeline: `deriveBlocks` → `Block.map`. No intermediate model, no caching layer, no abstraction. Designer correctly rejected Variant C's server-side derivation. The architect did not invent a `KnowledgeBodyModel`, `BlockTree`, or `useKnowledgeBody` hook — straight render. |
| Observability | 7 | No new logging surface. No tracing. Re-render counts are observable through React DevTools but not asserted. Acceptable for a render-only component with no I/O, but a single `data-knowledge-body-block-count={blocks.length}` attribute on the wrapper would help E2E debugging. Optional. |

**Lowest dim:** Security at **6**. Below threshold.

## Security blocker (REVISE-driving)

A renderer that calls `DOMPurify.sanitize` on `kind: "html"` payloads cannot ship without an explicit security test that proves XSS is closed. The architecture plan § 5 lists T4 as the only `kind: "html"` test, and T4 only asserts the rendered `<div>` payload "renders the sanitised HTML, not the UnknownPayload fallback". That asserts function-pass-through, not safety. **Required addition:**

> **T-SEC-1.** `KnowledgeBody.test.tsx`. Body containing `<script>window.__pwn = true</script><img src=x onerror=alert(1)>`. After render, `document.querySelectorAll('script').length === 0` AND no `onerror` handler attribute survives. Body containing `[link](javascript:alert(1))` renders an `<a>` with `href="about:blank"` or no `href` (per `renderInline`'s contract, which the test will reveal — if it leaves `javascript:` intact, that is an L2 bug to file as a follow-up; L23 still must not regress vs today's `<pre>`).

Also restate § 2 to specify the DOMPurify config (default vs `RETURN_TRUSTED_TYPE`, `ALLOWED_URI_REGEXP`, etc.) — one line is enough.

## Other findings

### A — Where the deriver runs

The plan defends client-side render-time `useMemo` against `where-derivation-attaches-in-the-pipeline.md`. The defence is **correct and on-contract.** The doc says: "Both client and server may derive Blocks from the same body" and "the cache is a pure optimisation that never gates correctness". Client-side derivation honours that. **Reviewer concurs.**

### B — `<pre>` removal proof

T8 asserts `data-testid="knowledge-body"` resolves to `[data-knowledge-body]` div, not `<pre>`. **Strict enough.** A grep of source would not be — the test exercises rendered DOM. Good.

### C — Block-id stability test design

T6 builds two bodies that differ in one section's body and asserts unaffected blocks' ids are byte-identical. The architecture says it does this both as a pure `deriveBlocks` exercise (`KnowledgeBody.id-stability.test.ts`) AND as an RTL-rendered `data-block-id` snapshot (`KnowledgeBody.test.tsx`). **Specific enough.** Two layers of evidence.

### D — Markdown-on-disk invariant

The spec says "bodies in persistence stay text, never JSON". The architecture verifies this by reading `packages/db/src/schema/` for "no schema change" and `packages/server/src/routes/knowledge.ts` for "no API change". **That's structural absence of change, not a positive assertion.** A passing test that POSTs/PATCHes a body and reads back the same string would prove the invariant. L25 will add the persisted-save path; L23 doesn't add or change persistence. Acceptable: file as a pre-existing guarantee, restate the verification as "no diff against `routes/knowledge.ts` under `git diff main..feat/L23`". A one-line CI assertion (`! git diff --name-only origin/main HEAD | grep -q routes/knowledge.ts`) closes it; otherwise the AC is honoured by-construction.

### E — L6 inventory rows

Architecture § 7 correctly notes `hardcoded-data-inventory.md` does not exist yet and treats L23's deletions as forward-closing rows. Reviewer concurs. Acceptable.

### F — L2-FU-1 / FU-2 dependency

Architecture § 8 R2 claims L23 does not invoke `BlockHandle` or `BlockActionsPopover` — therefore FU-1 (floating-ui wiring) and FU-2 (mobile sheet) are not blockers.

**Verified by reviewer:** `Block.tsx:120` renders `slots?.gutterLeading` only when the prop is provided. The `approved.md` `KnowledgeBody` implementation passes no `slots` prop → `BlockHandle` never renders → `BlockActionsPopover` never opens. **No hidden invocation.** FU-1 and FU-2 stay open as L26 prereqs. **Reviewer concurs.**

### G — Edit flow (re-derive on every keystroke)

The architecture reuses `KnowledgeBody` for the edit-mode preview keyed on `[body, hostId]` where `body = draft`. Every keystroke re-runs `deriveBlocks`. Sub-millisecond per call on bodies < 256 KB. **Reviewer concurs**, no debounce needed. Block ids re-derive on each call but for unchanged sections they remain byte-identical (L2 contract), so React reconciliation is minimal — exactly what T6 proves.

### H — Builder task list quality

T-RED-1..5 + T-GREEN-1..5 + T-VERIFY + T-LORE + T-COMMIT + T-PUSH. Each is < 30 min, each is verifiable by `bun run test` or `bun run e2e`. **Acceptable.** Two notes:

1. T-LORE: the existing `@lore J7` comment at `KnowledgeDetail.tsx:13-15` references the `<pre>` shell; T-GREEN-3 deletes the `<pre>`, so T-LORE is mandatory not conditional. Move it to a Required step, not a "replace if necessary".
2. T-GREEN-4 is gated on R1 (the protected k1/k2 test contract). The protected test file is at `packages/web/src/__tests__/KnowledgeDetail.test.tsx` (verified by reviewer); it asserts `getByText("company")` and `getByText("belief")`. Those strings come from rendered `<Tag>` chips driven by `item.layer`/`item.kind`, not from `LEGACY_DETAILS.content`. So `LEGACY_DETAILS` body strings can be deleted without breaking the protected test. The architecture's hedging on R1 is over-cautious — likely safe to commit to full deletion. State "deletion is the path; revert to carve-out only if a test breaks" rather than "decision-gate".

### I — Risks

R1–R5 are reasonable. **Missing risk: cascade specificity for the scoped heading CSS.** `HeadingPayload` already sets `font-heading text-[var(--text-strong)] leading-[1.2] tracking-[-0.005em] m-0` as Tailwind utilities. The proposed `[data-knowledge-body] :is(h1) { font-size: var(--density-text-h1); line-height: 1.2; ... }` rule, when placed in `@layer components` (Tailwind layer order is `@tailwind base; @tailwind components; @tailwind utilities;` per `packages/web/src/index.css:4-6`), will **lose** to HeadingPayload's `leading-[1.2]` utility for line-height. For h2/h3/h4–6 where the plan specifies `1.3`/`1.4`, `leading-[1.2]` will win and the override never applies. Add **R6** to the architecture plan: "Cascade — scoped CSS must either omit the `line-height` override (consistent 1.2 from L2 wins) OR be placed outside `@layer components` so attribute-selector specificity beats utility classes. Builder picks; preferred is omit the override."

### J — Visual proof step

T-VERIFY says "capture a screenshot of /knowledge/k1 and /knowledge/<multi-section-playbook-id>". Multi-section playbook id is **not** specified — does any fixture currently have a 5-section markdown body? `packages/web/src/fixtures/knowledge-data.ts` is the source. The builder must verify a multi-section fixture exists or add one. Add this as a sub-step under T-RED-5 / T-GREEN-3.

## Verdict

**REVISE** — single security blocker (Security score 6 < 7).

**Minimum delta required to APPROVE:**

1. **(Security blocker)** Add `T-SEC-1` to § 5 covering script-tag stripping and `javascript:` URL handling. Specify DOMPurify config in § 2.
2. **(Hard)** Add R6 to § 8 (cascade specificity) with the chosen resolution (omit line-height override OR place rule outside `@layer components`).
3. **(Hard)** T-LORE moved to Required (not conditional). T-GREEN-4 commits to deletion path; carve-out is fallback not default.
4. **(Soft)** Specify the multi-section-playbook fixture id used by E1/E2 — verify or add.
5. **(Soft)** Restate T7's "fixture body" with the specific markdown payload.

Once 1–3 land, all dims clear 7. Reviewer expects a single round-2 pass with no further design changes.

## Headline numbers (round 1)

- Lowest dim: **Security 6/10** (one blocker).
- Other near-threshold: Test plan 7, Error handling 7, Observability 7 — all acceptable as-is.
- Where-deriver-runs: **client-side `useMemo` — reviewer concurs.**
- L2-FU-1/FU-2: **confirmed irrelevant for L23.** No hidden `BlockHandle` / `BlockActionsPopover` invocation; `slots` prop is not passed.

---

## Round 2 — re-score (commit `ea60794`)

Designer landed all three required addenda. Re-scoring the changed dimensions and re-checking the unchanged ones for regressions.

### Re-scored dimensions

| Dim | R1 | R2 | Δ | Rationale |
|---|---|---|---|---|
| Security | 6 | **9** | +3 | T-SEC-1 added with six concrete cases (a–f): `<script>` strip, `<img onerror>` attribute strip, `<iframe>` block, raw `<a href="javascript:…">` strip, `<div onclick onmouseover>` event-handler strip, markdown `[click](javascript:…)` regression guard. DOMPurify config is now explicit: default profile, no overrides, with cited rationale ("audited defaults > hand-rolled allowlist") and the existing two call sites referenced (`ArtifactView.tsx:141`, `KnowledgeDetail.tsx:143`). The encapsulation choice (no `sanitizeHtml` prop on `KnowledgeBodyProps`) is now explicitly stated as intentional. The case-(f) regression test correctly notes that a failure indicates an L2 `renderInline` bug to file as a follow-up — not an L23 blocker. Score remains under 10 only because `data:` URIs on `<img>` are kept by DOMPurify default (acknowledged in the plan as "acceptable for Knowledge bodies"); a paranoid host would tighten that. For L23 it is on-contract. |
| Error handling | 7 | **8** | +1 | The DOMPurify config statement closes one of the original gaps (sanitiser-error semantics now explicit). Other gaps unchanged. |
| Test plan | 7 | **8** | +1 | T-RED-2 expanded to "eleven failures (5 prior + 6 new XSS cases)" — atomic and verifiable. Six concrete `it(...)` cases is a stronger test plan than R1 carried. Remaining soft gaps from R1 (multi-section-playbook fixture id, T7 fixture body specification) are unaddressed but were filed as soft, not blockers. |

### Unchanged dimensions (regression check)

| Dim | Score | Status |
|---|---|---|
| Surface-area discipline | 9 | No new files introduced by R2 changes; the diff is doc-only. |
| Contract clarity | 8 | DOMPurify call shape is now spelled out, slight strengthening but not enough to bump. |
| Type safety | 8 | No type changes. |
| Performance | 8 | T-SEC-1's six cases run in well under a second. No perf regression. |
| Simplicity | 9 | Six XSS cases are six `it(...)` blocks calling the same render path — no new abstraction. |
| Observability | 7 | Unchanged. |

### Cascade resolution (R6) — concur

Designer chose **drop the `line-height` override** (the safer of the two options I offered). `approved.md` patched to remove `line-height` lines from all four `[data-knowledge-body] :is(...)` rules. Builder note in R6 explicitly forbids `!important` or layer escape hatches as a workaround. **Reviewer concurs** — fighting Tailwind's utility cascade for a 0.1 line-height delta is exactly the kind of fragile override that causes silent regressions later.

### Empty-state departure (design-side) — concur

`approved.md` § Empty state now carries the one-sentence rationale: "Wrapping the empty case in an `EmptyState` card would re-introduce the very container (border, padding, centred icon slot) that L23 is removing." That is precisely the framing — chrome-forbidden for "some body" must mean chrome-forbidden for "no body". Approved as written.

### Soft items still open (not blockers)

These remained from round 1 and are not blockers for APPROVE:

- E1/E2's "multi-section-playbook" fixture id is unspecified. Builder must verify a multi-section fixture exists in `packages/web/src/fixtures/knowledge-data.ts` or add one. Track in `plans/L23/follow-ups.md` if absent.
- T7's "fixture body covering supported kinds" should specify the markdown payload. Builder picks at write-tests time.

These are tractable at builder time and do not require another designer round.

### Round 2 verdict

**APPROVE.** All dims now ≥ 7. Lowest is **Test plan / Error handling / Observability at 8** (Security jumped to 9). The architecture plan is ready for Phase 3 builder hand-off.

## Round 2 headline numbers

- Lowest dim: **Observability 7/10** (acceptable, no blocker).
- **Security: 9/10** (was 6 — fully addressed).
- Where-deriver-runs: client-side `useMemo` — concur.
- L2-FU-1/FU-2: confirmed irrelevant for L23.
- Cascade resolution: drop `line-height` override, defer to L2's utility — concur.
- Empty-state departure: explicitly justified in `approved.md` — concur.

Reviewer ready to hand off to builder for Phase 3 (`/write-tests` then `/write-code`). Phase 4 review will be performed by this same persona against the contracts established here.
