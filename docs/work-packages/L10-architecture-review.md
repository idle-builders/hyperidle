# L10 — Architecture Review (post-implementation)

**Branch:** `feat/L10-conversations-filter`
**Diff under review:** `git diff main..HEAD` (1 commit, `ba3831d`).
**Spec under audit:** `docs/work-packages/L10-plan.md`.
**Reviewer phase:** post-`/write-code`, pre-merge. Read-only — no code changes.
**Files inspected:**
- `packages/web/src/shell/Submenu.tsx`
- `packages/web/src/components/ThreadSections.tsx`
- `packages/web/src/layouts/AppShell.tsx`
- `packages/web/src/hooks/useConversationsThreads.ts`
- `packages/web/e2e/l10-conversations-filter.spec.ts`
- `packages/web/src/shell/Submenu.stories.tsx`
- Test suites listed in plan §4
- Protected tests per plan §11 (verified untouched on disk)

---

## Verdict

**APPROVED with one CRITICAL scope-leak finding to address before merge.** The L10 implementation matches the plan's contracts (§3.1–§3.7) field-for-field. Layer integrity is preserved. The only blocking issue is a set of unrelated, out-of-scope file edits that ride along in this branch and should be removed or split out.

---

## Findings by severity

### CRITICAL — 1

#### C1. Scope leak — branch carries unrelated edits to skill manifests and design-system Vitest config

The diff `git diff main..HEAD --stat` lists three files that are NOT in the L10 plan, NOT mentioned in §2 reconciliation, and have nothing to do with the conversations filter:

1. `.claude/skills/design/SKILL.md` — frontmatter mangled. The original file opens with:
   ```
   ---
   name: design
   ```
   The diff collapses it to a single line:
   ```
   --- name: design
   ```
   This breaks YAML frontmatter parsing for the skill manifest and is almost certainly an accidental edit (probably an editor save-format glitch). Plan §12 rollback references nothing in `.claude/skills/`.

2. `.claude/skills/pipeline/SKILL.md` — pipeline stage role assignments rewritten (`developer` → `qa` for `/write-tests`, `qa` → `developer` for `/apply-review` 14b, role removed from `/check-definition-of-done`). This is a process-design change. It belongs in its own commit/PR with `/retro` justification, not bundled with an L10 feature.

3. `packages/design-system/vitest.config.ts` — adds `**/dist/**` to the Vitest exclude list with the comment "keeps compiled-output `.test.js` copies from racing the source `.test.ts` files (serve.test starts a Bun server on a fixed port — running both copies in parallel causes ECONNRESET)". This is a real fix, but it is in `packages/design-system`, which L10 does not touch (plan §2 last line: "**No DB migration. No API change. No new endpoint. No new custom component.** All work is in the web package."). Test-infrastructure fixes that affect another package's CI behaviour should land separately so they can be reverted independently and so the rollback plan in §12 stays correct.

**Fix:** Split these three changes into a separate commit / branch before merging L10. The L10 PR should only carry the web-package work the plan describes. The skill-manifest yaml damage in (1) is also a regression — the `name: design` frontmatter must remain on its own line.

**Trace:** plan §2 promise of "All work is in the web package"; plan §12 rollback contract.

---

### WARNINGS — 3

#### W1. Plan §4 verification matrix promises a Vitest `Submenu.touch-target.test.tsx`; only the Playwright equivalent exists

Plan §4, AC row "Touch target ≥ 44 CSS px (AQ-015)" prescribes:

> **Vitest** `Submenu.touch-target.test.tsx` (resolves adversary W6) … escalate to the existing Playwright spec by adding a per-element bbox assertion.

Reality: `find packages/web -name "Submenu.touch-target*"` returns nothing. The escalation path (Playwright bbox check) IS implemented in `packages/web/e2e/l10-conversations-filter.spec.ts:123-158`, so the AC has coverage — but the plan's stated intent to land a Vitest measurement first AND escalate is only half-honoured.

This is a WARNING (not CRITICAL) because the AC is verified end-to-end via Playwright. The risk is that the next agent reads the plan, expects the Vitest file to exist, and is confused.

**Fix:** Either add the promised Vitest file (with the computed-style fallback the plan describes), OR amend the plan post-hoc to record that we went straight to Playwright because jsdom layout was indeed unreliable. Capturing this as a `@lore` next to the bbox loop in the e2e spec would close the loop.

**Trace:** plan §4 line 208; e2e spec lines 123–158.

---

#### W2. `Submenu` clear-button affordance applies `ml-auto` while sitting in a `flex items-center gap-1` row — no `flex-1` consumer to push it

`Submenu.tsx:142-183`:

```
<div className="flex items-center gap-1 ${disabledClass}">
  <div role="tablist" ... className="flex flex-wrap gap-1">
    ... chip buttons ...
  </div>
  {showClearButton && (
    <button className="... ml-auto ...">× Clear</button>
  )}
</div>
```

`ml-auto` only pushes the clear button right if there is unconsumed horizontal space in the parent flex row. With `gap-1` and no `flex-1` on the tablist, the tablist hugs its content. At a 240 px Submenu width with three short chip labels, the clear button sits immediately after Async with a tight gap, NOT at the right edge as approved §1 visualises. The plan §3.7 explicitly says "The clear button stays on the right edge via `ml-auto`."

This works as intended only when the chip row's natural width plus the clear button's width is *less than* the inner width of the Submenu, AND the tablist is allowed to grow. Today neither side has `flex-1`. The behaviour is currently "clear button hugs the chips" — not "clear button on the right edge."

**Severity is WARNING** because the visual contract approved.md §1 has been validated by T13 screenshots per the DoD checklist; if the screenshots passed, the design call is fine. But the implementation does not match the *plan's prose* for §3.7, and the post-merge maintainer will be surprised.

**Fix:** add `flex-1` (or `grow`) to the inner `role="tablist"` div, OR change the plan §3.7 prose to say "clear button sits immediately after the last chip with the row's `gap-1` separator, not pushed to the right edge." Either is acceptable; both should not silently disagree.

**Trace:** plan §3.7 lines 149-184; Submenu.tsx:142-183.

---

#### W3. `filtersDisabled` is calculated only when `activeView === "conversations"`, but `Submenu` consumes the prop unconditionally

`AppShell.tsx:418`:

```ts
const filtersDisabled = activeView === "conversations" && conversationsThreads.status === "error";
```

…and the prop is then passed to *every* Submenu render (line 509), including Knowledge and Work views. For Work this is harmless (no chips). For Knowledge this means: if a future story makes the Knowledge submenu fetch and that fetch errors, Knowledge chips will NOT disable, because the gating is `activeView === "conversations"` only.

Today this matches plan T10's stated intent ("only the conversations submenu carries this signal — other views ignore it (they don't fetch threads)"). The risk is silent breakage when Knowledge gains a fetch.

**Fix:** Either keep as-is and add an `@lore` next to the filtersDisabled assignment ("@lore L10 T10: Knowledge has no fetch today; if it gains one, route its error state through this same prop with a per-view derivation."), OR refactor to a per-view computed object. Recording the intent in code is the cheap option.

**Trace:** plan §5 T10 (line 246); AppShell.tsx:418.

---

### OBSERVATIONS / SUGGESTIONS — 5

#### O1. Plan §3.1 union order vs implementation union order — match

Plan §3.1: `'all' | 'blocking' | 'async' | 'needs-review'`.
Submenu.tsx:11: `"all" | "blocking" | "async" | "needs-review"`. **Identical.**

#### O2. `predicateFor` exhaustive switch — match

Plan §3.4 prescribes a switch over `ConversationsFilter`. ThreadSections.tsx:48-57 implements it with a switch and no `default` clause. A future addition to the union will fail typecheck via `noFallthroughCasesInSwitch` / `noImplicitReturns`. **Correct.**

#### O3. Filter × sectioning interaction (plan §3.5) — verified

ThreadSections.tsx:240-308 sections AFTER filtering. The "Active section absent under `blocking` filter" rule is implemented at line 251 (`if (activeFilter === "blocking") return null;`). The "Active section silent-when-empty fallthrough under `async` and `all`" path at line 250 reaches the Quiet line. Matches plan §3.5 table row-for-row.

#### O4. Web-only `blocking` plumbing (plan §6) — verified

`useConversationsThreads.ts:35` declares `blocking?: boolean` on `ThreadListRow`. The guard at line 82 accepts `undefined OR boolean`. The mapper at line 121 honours the wire value when present. **No `packages/server` change in the diff.** Plan §6's "all work in the web package" promise (modulo the C1 scope-leak files) is preserved for the L10 mechanism itself.

#### O5. Protected tests (plan §11) — verified untouched

`git diff main..HEAD` against the five protected paths in plan §11 returns:

- `Submenu.test.tsx` — empty diff
- `Submenu.filters.test.tsx` — empty diff
- `AppShell.knowledge-submenu.test.tsx` — empty diff
- `ThreadSections.conversations.test.tsx` — empty diff
- `useConversationsThreads.test.tsx` — additive only (one new `it` block at lines 179-205, type-import addition for `blocking?: boolean`, helper extension to forward the field). The plan's reclassification ("protected against assertion deletion or modification, but additive new assertions are allowed and expected") is honoured: no existing assertion changed.

`AppShell.filter-reset.test.tsx` is correctly NOT on the protected list and was modified by T9 with a literal-string swap (`/needs review/i` → `/^blocking$/i`). The assertion semantics (filter resets on view change) are preserved. **Match.**

---

### What's working well

- **Single source of truth for the predicate:** `predicateFor()` is exported once from `ThreadSections.tsx` and consumed by both the rendered list and the AppShell badge count (AppShell.tsx:408). The "two derivations of filtered length" anti-pattern called out in plan §7.1 is prevented by construction.
- **Closed `ConversationsFilter` narrowing at the boundary:** `AppShell.tsx:397-398` narrows the wider `SubmenuFilter` union to the `ConversationsFilter` subset before passing it to `ThreadSections`, with a fallback to `'all'` for the `'needs-review'` case that cannot occur (because of view-change reset). The runtime narrowing matches the type narrowing — no `as` cast.
- **`@lore` density is high in modified hot paths:** AppShell.tsx:399-410, Submenu.tsx:81-96 + 132-141, useConversationsThreads.ts:27-35 + 118-122. Future agents reading these files will not have to reverse-engineer the L10 design choices.
- **Layer integrity intact:** No new server-side code. No DB schema change. The only API-shape change (`blocking?: boolean` on the wire row) is additive on the *client guard* and the server is unchanged — backwards-compatible if the server later starts emitting `blocking`.

---

## Recommended action before merge

1. **C1:** Remove the three out-of-scope files from this branch; re-land them as separate commits/PRs. Repair the YAML frontmatter on `.claude/skills/design/SKILL.md` (the `--- name: design` regression).
2. **W1:** Add the promised Vitest `Submenu.touch-target.test.tsx`, OR amend `docs/work-packages/L10-plan.md` to record that the Vitest path was infeasible and the Playwright bbox check is the verified harness.
3. **W2:** Either add `flex-1` to the inner tablist div in `Submenu.tsx`, OR amend the plan §3.7 prose to match the implemented "hugs after chips" layout.
4. **W3:** Add a one-line `@lore` next to AppShell.tsx:418 documenting the intentional view-gating.

Findings O1–O5 are observations only — no action needed.

---

## Severity tally

- CRITICAL: **1** (scope leak)
- WARNING: **3** (missing Vitest file, ml-auto layout, view-gated filtersDisabled)
- OBSERVATION/SUGGESTION: **5**
