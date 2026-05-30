# T2 Concept Verification

**Status:** Verified -- concept coverage is sufficient.

## What T2 does

T2 integrates the BodyEditor component (built in T1, already merged to main) into Knowledge editing surfaces. It does NOT introduce new nouns, primitives, or domain concepts.

## Concept coverage check

The locked concept doc at `plans/human-authoring/editing-experience-concept.md` covers every facet T2 needs:

| T2 concern | Concept doc section | Verdict |
|---|---|---|
| Replace KnowledgeDetail textarea with BodyEditor | Section "Editing Surfaces > 1. Knowledge Body (edit mode)" (lines 156-166) | Covered -- specifies click-to-edit, auto-save, conflict detection, 409 banner |
| Replace KnowledgeCreateDialog textarea with BodyEditor | Section "Editing Surfaces > 2. Knowledge Create (dialog)" (lines 168-175) | Covered -- specifies empty start, placeholder, serialize to markdown on create |
| Auto-save debounce to PATCH API | Section "Persistence Changes > Auto-save pattern" (lines 339-348) | Covered -- specifies 1500ms debounce, 409 conflict banner, version update on 200 |
| Saving indicator | Section "Persistence Changes" (line 347) | Covered -- specifies "Saving..." / "Saved" text near the editor, `var(--text-lo)` |
| Conflict banner on 409 | Section "Editing Surfaces > Knowledge Body" (line 165) | Covered -- "show inline conflict banner" |
| Factory-scope read-only behavior | Section "Editing Surfaces > Knowledge Body" (line 166) | Covered -- "except factory items under review" |
| BodyEditor component API | Section "The Editor Component" (lines 226-248) | Covered -- full interface spec |
| Read mode unchanged | Section "What This Does NOT Change" (lines 443-451) | Covered -- deriveBlocks, Block components, anchoring all unchanged |
| TipTap serialization contract | Section "Editor Technology: TipTap" (lines 105-128) | Covered -- GFM round-trip via tiptap-markdown |

## Nouns used by T2

All nouns are pre-existing and already defined:

- **BodyEditor** -- T1 design-system component, the 20th custom component. Defined in concept doc lines 224-248.
- **Knowledge Item** -- existing process primitive. Schema at `packages/db/src/schema.ts:353-380`.
- **Block** -- existing read-mode rendering primitive. Concept does not change blocks.
- **Version** -- existing optimistic locking column on `knowledge_items.version`. Integer, bumped on every PATCH.

## Gap analysis

**No gaps found.** T2 is pure integration work -- wiring an existing component (BodyEditor) into existing surfaces (KnowledgeDetail, KnowledgeCreateDialog) using an existing API (PATCH /api/knowledge/:id). The concept doc covers the editing behavior, auto-save contract, conflict detection, and read-mode preservation.

The only behavioral detail T2 needs that the concept doc does not fully specify is the exact click-to-edit transition UX (does the user click an "Edit" button, or does the body become editable on click?). The concept doc says "No explicit 'Edit' button needed -- the body is always editable" (line 165), but the current KnowledgeDetail has an explicit "Edit" button (line 298). This is a design decision for the /design phase, not a concept gap.
