DESIGN-CLASS: routine  ref=KnowledgeList/KnowledgeDetail/ScopeChangeDialog/KnowledgeCreate  pattern=packages/design-system/html (knowledge-list.html, knowledge-detail.html, knowledge-edit.html)

# AF13 — Design brief (interrogated)

All four surfaces already exist and ship. AF13 repairs broken wiring inside them; it introduces **zero new shapes** and **zero new components**. The design job is to specify the corrected *behavior* of controls that already render, so the build doesn't drift into a redesign.

## User task

A person building the knowledge base wants to: create an item and edit it immediately; sort the list and see it reorder; change scope after editing without a spurious conflict; validate a triage item and still find it; and trust the metadata shown.

## Settled by concept / existing code (no probe needed)

- **Scope vocabulary** — locked by `scope-labels.ts` (AD6/AE1): Shared / Team / Private only. Raw enums never shown.
- **Component budget** — untouched. Repairs live in `KnowledgeList.tsx`, `KnowledgeDetail.tsx`, `KnowledgeCreate.tsx`, `ScopeChangeDialog.tsx` + their hooks. No design-system primitive changes.
- **Primary state** — populated list + populated detail. The defects only manifest with data.
- **Triage grammar** — Y4 keyboard + inline validate/reject already exist; the verdict set (validate→active, reject→archived) is unchanged.

## Unsettled UX decisions this design must make

1. **Default-create scope → editability.** Today: create defaults to "Shared"→`factory`; `factory` hides Edit (line 689 `isFactory`). So a freshly-created item is read-only to its author. **Decision needed:** which lever moves — the default scope, the editability rule, or both?
2. **Triage post-action visibility.** Today: validate removes item from triage optimistically but the cached list still has it as `draft`, so it appears in *no* tab until reload. **Decision needed:** where the validated item lands and how the user confirms it.
3. **Sort pills.** Today: clicking a pill writes `?sort=` but nothing reads it to reorder. **Decision needed:** what each of the three orders means, and tie-breaks.
4. **Scope-change dialog vocabulary + version.** Today: the `<select>` lists 7 raw enums (vocabulary leak) and sends a frozen version (409 after autosave). **Decision needed:** the corrected select options and the version-source rule.
5. **Detail metadata.** Today: Access count always 0, Backlinks always empty — the route omits the fields the UI reads. **Decision needed:** what "real" looks like for each field and the empty-state copy.

## DESIGN-CLASS rationale

`routine` (both axes match: named existing components + embodied html mockups exist). One variant + a "did-we-consider" rejection list per the skill's routine rule. No low-confidence trigger — Hierarchy/States/Anti-slop all score ≥7 on the single variant because the layouts are already shipped and visually approved; only behavior changes.
