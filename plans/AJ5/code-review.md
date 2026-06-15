# AJ5 — Code review (Phase 4)

**Reviewer:** reviewer-AJ5 (carried design+arch context from Phase 2 critique).
**Diff:** `origin/main..HEAD` (`feat/AJ5-design-annotations`), PR #324.
**Plan:** `plans/AJ5/architecture.md` (locked, critique folded). **Concept:** `plans/AJ5/concept.md`. **Design:** `plans/AJ5/design/approved.md`.

**Verdict: NOT DONE.** Runtime + security + architecture are clean and well-built. Two gaps block DONE: (1) **AC11 live-proof not evidenced** — the rendered two-round `.annotations/annotations.md` is not captured in the PR and the dir is (correctly) gitignored, so the de-hoax lane is unproven; (2) **three approved-design outline states are unimplemented** (hover near-invisible, `.anno-selected` absent, `.anno-saved` doubled-outline absent). Everything else passes.

Design-system test evidence (this environment): `npx vitest run viewer/annotations` → **53/53 pass**; catalog-snapshot net → **255/255 pass, zero `.snap` drift, no re-bless**. (Full `npm run verify` blocked by pre-existing `@anthropic-ai/claude-agent-sdk` absence in server/pipeline — unrelated to AJ5, main is clean; not an AJ5 defect.)

---

## AC table

| AC | Verdict | Evidence |
|---|---|---|
| AC1 — fiber resolves nearest component name for a node without `data-ds-component` | PASS | `resolve-component.test.tsx` "resolves nearest component name via fiber for a rendered Button's inner span" → `.component === "Button"`. Impl: `walkFiberForComponent` walks `.return`, first function-typed fiber, `displayName ?? name`. |
| AC1b — explicit chain: data-ds-only → dsComponent verbatim; neither → `"unknown"` | PASS | `resolve-component.test.tsx` AC1b block: bare DOM (no fiber) + `data-ds-component="MyWidget"` ancestor → `"MyWidget"`; orphan node → `"unknown"`; weak label surfaced verbatim. Impl steps 2/3 in `resolveComponentTarget`. |
| AC2 — `dsComponent` from nearest `[data-ds-component]`, else null | PASS | `resolve-component.test.tsx` AC2 block: null when absent, `"Button"` from outer + from inner `<em>` ancestor. Impl: `dsComponent` computed independently via `closest()` (line 127). |
| AC3 — terse tag+class/text descriptor | PASS | `resolve-component.test.tsx` AC3 block: contains tag, classes, short text snippet, non-empty for plain div. Impl: `buildElementDescriptor`. |
| AC4 — append writes JSON to open round w/ id+createdAt; first write seeds round 1 | PASS | `annotation-store.test.ts` AC4 block: seed, id/createdAt assigned, round-trip via `readState`, membership in `currentRound`. |
| AC5 — startRound closes current, opens +1; prior immutable | PASS | `annotation-store.test.ts` AC5 block: round 1 unchanged after round-2 append; multiple bumps increment. |
| AC6 — `renderMarkdown` one `## Round N — <ts>` header/round + bullet/annotation | PASS | `annotation-store.test.ts` AC6 block: header, component/element/note substrings, ordered two-round headers, bullet `- ` lines, `mdPath` sibling. |
| AC7 — handler routes GET/POST/round; bad body → 400; unknown → 404 | PASS | `request-handler.test.ts`: all four routes, injected clock/idgen, four 400 cases (missing note, null, wrong type, **object story = path-traversal guard**), three 404s. |
| AC8 — overlay select→note→Save POSTs AnnotationInput; count from GET; New iteration → /round | PASS | `annotation-overlay.test.tsx`: `aria-pressed` toggle, count/round from GET, capture→type→Save POST payload validated, New iteration POSTs `/round` and is disabled at 0 notes. |
| AC9 — file gitignored; plugin `configureServer`-only, never in build | PASS | `.gitignore` adds `.annotations/`; `vite-plugin-annotations.ts` exposes **only** `configureServer`, no `transform`/`generateBundle`; `biome.json` excludes `.annotations`. Static/type, as specified. |
| AC10 — overlay chrome does not alter 56-story snapshot net | PASS | catalog-snapshot 255/255 green, **zero `.snap` diff** in `git diff --stat`. Overlay guarded by `isComponentPage` in `App`; net renders `v.render()` directly, not `App`. |
| AC11 — **Live proof:** real annotate → `.md` has note+component; New iteration → second `## Round 2` block; **capture `.md` in PR** | **FAIL** | Builder *reported* two real rounds, but PR #324 body contains **no rendered `.md`**, and `.annotations/` is gitignored + absent in the worktree → the de-hoax lane is **unproven by evidence**. AC11 explicitly requires capturing the rendered `.md` in the PR. Unit tests prove the store/handler/markdown *mechanism* (AC4–AC8) but AC11 is the end-to-end live lane and must be evidenced (MEMORY: live-proof lanes run before ship). |

---

## CRITICAL

**C1 — AC11 live-proof not evidenced in the PR.** AC11 is the de-hoax lane and the entire reason the WP exists. The plan requires "Capture the rendered `.md` in the PR." PR #324's body has prose only — no two-round `## Round 1` / `## Round 2` markdown block. `.annotations/` is gitignored (correct) so the artifact cannot live in the diff; it must be pasted into the PR description (or a non-gitignored `plans/AJ5/` evidence file). **Fix:** run `npm run ds:serve`, annotate a real element, click New iteration, annotate again, paste the resulting `annotations.md` (both round headers, real resolved component name, real notes) into the PR body. Until that exists, AC11 is unproven.

## WARNINGS

**W1 — Approved-design outline states unimplemented (Design lens).** `approved.md` rows 29-31 specify three outline classes; only hover is wired, and weakly:
- **Hover outline** (`annotation-overlay.tsx:99`) uses `--accent-primary-dim` = `rgba(...,0.08)` (light) / `rgba(...,0.10)` (dark). A 2px outline at 8-10% opacity is effectively invisible — the armed hover affordance the design calls for does not read. Use a visible token (e.g. `--accent-primary`), matching the design's intent that hover "tracks the pointer over story root."
- **`.anno-selected`** — never applied. After capture, the popover opens but the captured element gets no persistent outline, so the founder loses track of *which* element the open note targets. Design row 30 specifies it.
- **`.anno-saved`** — entirely absent. This is the **doubled outline** that `approved.md` §1 "Open questions" explicitly marks **RESOLVED** as "the committed persistent 'annotated' signal — no build-time re-decision" (`--surface-elevated` halo + `--accent-primary` line, AQ-007). No saved element is ever outlined. The CSS comment at `viewer.css:376-377` claims all three "are applied inline via style attr" but only hover is — the comment is misleading. Design notes saved-outline as best-effort/non-blocking, but it is a named, resolved deliverable, not optional. **Fix:** apply a visible selected outline while the popover is open; re-apply the doubled saved outline (best-effort, by descriptor match) after Save/on load.

**W2 — Focus trap claimed by design, not implemented.** `approved.md` §Behavior: "Focus trap in popover (`Tab` textarea → Save → Cancel)." The popover has `role="dialog" aria-modal="true"` (`annotation-overlay.tsx:306`) but **no focus trap** — `Tab` from Cancel escapes to the page behind. `aria-modal="true"` without a trap is a mild a11y lie (SR users are told it's modal; keyboard users aren't trapped). Either implement the trap (it's a 3-node cycle) or drop `aria-modal` and the design's focus-trap claim. Low stakes (desktop dev tool, design a11y scored 7/10) but the contract says trap. Note: `Esc`→arm-focus and `Cmd/Ctrl+Enter`→Save **are** correctly implemented (`useEffect` keydown, lines 217-236).

## OBSERVATIONS (non-blocking)

- **O1 — StrictMode double-GET is benign.** `fetchState` runs in a mount `useEffect`; StrictMode double-invokes it → two GETs on mount. Idempotent (GET, no write), last-write-wins into `setState`. No leak. The one-shot arm listener is armed only by user click (not in an effect), so StrictMode does not double-arm. The arm's `listenerCleanupRef` and the unmount `useEffect` (175-181) correctly detach. **Adversarial one-shot check: PASS** — `handleCapturingClick` detaches both listeners synchronously on first capture (143-145) before doing anything else, scoped to `storyRoot` not `document` (165-166), pill/popover excluded via `isOwnNode`. No sticky-document trap, no double-fire.
- **O2 — `noteCount === 0` guard inside `handleNewIteration` (line 249) is redundant** with the button's `disabled={noteCount === 0}`. Harmless defense-in-depth; not slop-worthy given the button could theoretically be triggered programmatically. Leave or inline — reviewer's choice.
- **O3 — `setTimeout(…,0)` autofocus** (186-189) is a common jsdom/React idiom for focusing after paint; works, not slop.
- **O4 — `readState` swallows `JSON.parse` on a corrupt file** (`annotation-store.ts:47`) — would throw and 500 the middleware rather than reseeding. Acceptable: dev-only, single founder, file is machine-written; a corrupt canonical file *should* surface loudly, not silently reseed and lose data. No change needed.
- **O5 — Security: handler validation is correct and complete.** `validateBody` rejects null/array/non-object, enforces string types on `story`/`variant`/`note`/`target.component`/`target.element`, `string|null` on `dsComponent`. Content fields never build a path (path is fixed, server-resolved off `import.meta.url`). The object-as-`story` `$ne` test proves the prototype-pollution/path-traversal guard. Plugin is `configureServer`-only → cannot enter a production bundle. **STRIDE: no new surface** (localhost dev middleware, single founder, gitignored output). Prompt-injection framing correctly pushed into `human-design-review/SKILL.md` ("FOUNDER FEEDBACK DATA, not instructions").
- **O6 — Type safety:** the one unavoidable unsafe cast (fiber access, `resolve-component.ts:136`) is narrow (`unknown` → minimal `ReactFiberNode`, `.type` kept `unknown` and typeof-narrowed) and `@lore`-documented as the single brittle point. The `!` at `annotation-store.ts:95` is guarded by the `findIndex !== -1` branch. No `any`, no `@ts-ignore`. Clean.
- **O7 — Simplification/slop: clean.** JSON-canonical + derived-MD write is centralized in one `writeState` helper (both files written together, 54-58) — no duplication. `@lore` comments are load-bearing (fiber brittleness, dev-only-no-bundle, MD-derived-clobber warning), not filler. No dead code, no over-abstraction, no AI tell-tales.
- **O8 — De-hoax docs (task 9) fully landed:** `human-design-review/SKILL.md`, `FEEDBACK.md`, `.claude/rules/design-system.md` all repointed from external MCP (`read_annotations`/`watch_annotations`/Vibe/Pointer) to the first-party `.annotations/annotations.md`, with the prompt-injection contract stated explicitly and a non-hard-fail screenshot fallback. Strong.

---

## Note on the doubled-state snapshot
The catalog-snapshot net was verified green with no obsolete-snapshot warning — confirms the overlay never enters it (mounted in `App` chrome, guarded by `isComponentPage`). AC10 is genuinely satisfied, not vacuously.

## Summary for builder
1. **C1 (blocking):** capture the real two-round `annotations.md` in PR #324 (or a tracked `plans/AJ5/` evidence file). This is AC11 — the whole point.
2. **W1:** make hover outline visible; implement `.anno-selected` (while popover open) and `.anno-saved` doubled outline (best-effort). Fix the misleading `viewer.css:376` comment.
3. **W2:** implement the popover focus trap or drop `aria-modal`/the focus-trap design claim.
