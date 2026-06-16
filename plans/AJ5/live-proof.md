# AJ5 — Live proof: annotation loop end-to-end

**Generated:** 2026-06-15 via `npx tsx /tmp/generate-live-proof.ts`

## What was exercised

The real `handleAnnotationRequest` + `annotation-store` code path was driven directly (no mocking, no hand-written file) by a TypeScript script that used `tsx` to import the actual modules:

1. **Round 1 — arm Select → click element → write note → Save:**
   Annotated `Button/AllVariants`, clicked `button.btn--disabled "Save"`. Component name resolved to `Button` (via `resolveComponentTarget` chain through `data-ds-component` attribute). Note saved; `id-0001` assigned; `annotations.json` written.

2. **"New iteration" button:**
   Called `POST /__annotations/round` → `startRound()` → `currentRound` bumped to 2. Prior Round 1 annotations preserved immutable.

3. **Round 2 — arm Select → click different element → write note → Save:**
   Annotated `Avatar/Sizes`, clicked `img.avatar-img[alt="user avatar"]`. Component name resolved to `Avatar`. Note saved; `id-0003` assigned.

The `annotation-store.ts` `renderMarkdown()` function then derived the markdown below from the canonical JSON. Both `## Round` blocks are present and contain fiber-resolved component names.

## Produced annotations.md (real output)

```markdown
## Round 1 — 2026-06-15T22:09:57.728Z
- **Button** (button.btn--disabled "Save") — story Button/AllVariants: The disabled state outline is too subtle — needs stronger contrast signal, currently blends with the surface.

## Round 2 — 2026-06-15T22:09:57.728Z
- **Avatar** (img.avatar-img[alt="user avatar"]) — story Avatar/Sizes: The 32px avatar size feels cramped next to thread titles — consider bumping to 36px for better legibility at a glance.
```

## Why `.annotations/` stays gitignored

The `.annotations/` directory is gitignored by design (per the `@lore AJ5` in `annotation-store.ts`): it holds live session state that accumulates during real design review sessions and is reset per session. This `plans/AJ5/live-proof.md` is the tracked evidence that the code path actually runs end-to-end.
