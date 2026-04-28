# Variant C — Artifact: layered base + slots (composable)

**Identity.** A base `<ArtifactSurface>` that always renders the canonical chrome (kind, producing-task, cost, timestamp) plus four named slots (`preview`, `actions`, `discussion`, `footerExtras`). Consumers compose layout-specific compositions per surface via React composition. The four "layouts" become call-site recipes, not separate components.

```tsx
<ArtifactSurface
  data={ArtifactData}
  variant="block" | "row" | "page" | "embed"   // chrome geometry only
  preview={<ArtifactPreviewSurface kind={data.kind} preview={data.preview} />}
  actions={<OpenButton onClick={...} />}             // optional
  discussion={<ThreadList artifactId={data.id} />}   // optional, only on "page"
  footerExtras={<ThreadCountChip count={threadCount} />}  // optional
/>
```

**Density philosophy.** The base owns one density story (per-variant), but consumers can override slot internals. The four call-site recipes (gallery, stack, page, embed) are documented examples of the same composition, not enforced shapes. This shifts the burden — flexibility wins, discipline becomes a docs problem.

**Motion register.** The base contributes hover surface ramps for `block` and `row` variants only. The `page` variant has no chrome motion. The `embed` variant has no chrome at all (transparent), so no motion either.

**Copy register.** The base prescribes nothing about copy — it renders whatever the consumer passes. Recommended call-site recipes use the same register as variants A and B, but enforcement is at the docs / lint level, not the component level.

---

## ArtifactSurface API

```tsx
interface ArtifactSurfaceProps {
  data: {
    id: string;
    producingTaskId: string;
    producingTaskTitle: string;   // denormalised onto fetch response
    kind: ArtifactKind;
    cost: { money: string | null; tokens: string | null };
    createdAt: string;            // ISO
  };
  variant: 'block' | 'row' | 'page' | 'embed';
  preview?: ReactNode;            // a slot — consumer decides what renders
  actions?: ReactNode;            // a slot — open buttons, kebab menus
  discussion?: ReactNode;         // a slot — only honored on variant="page"
  footerExtras?: ReactNode;       // a slot — thread count, badges
  state?: 'populated' | 'loading' | 'error';
  onClick?: () => void;           // makes block/row clickable
}
```

The base renders:
- An identity strip: kind badge + producing-task title + cost + timestamp.
- The `preview` slot (when provided).
- The `discussion` slot (only on `variant="page"`).
- The `footerExtras` slot.

The four variants are pure chrome geometry differences:
- `block` — `--surface-4` card with `--r2`, `--density-card-pad`. Hover ramps to `--surface-5`.
- `row` — no background, height `--density-row-h`, padding `--density-pad-x`. Hover background `--surface-4`. Identity strip rendered on a single line; preview slot is not displayed (the consumer should not pass it).
- `page` — `--surface-3` page-gutter, full bleed inside the page chrome. Header is the identity strip vertically (kind + cost + time on row 1; producing-task as link on row 2; derived h1 below). The preview slot fills the body. The discussion slot fills a 320px right rail.
- `embed` — TRANSPARENT. The base contributes only the identity strip + preview slot, separated by 4px. No background, no border, no padding.

---

## Layout call-site recipes (these are documentation, not components)

### Recipe — gallery_card
```tsx
<ArtifactSurface
  variant="block"
  data={artifact}
  preview={<ArtifactPreviewSurface kind={artifact.kind} preview={artifact.preview} size="gallery" />}
  footerExtras={threadCount > 0 ? <ThreadCountChip count={threadCount} /> : undefined}
  onClick={() => openArtifact(artifact.id)}
/>
```

### Recipe — stack_item
```tsx
<ArtifactSurface
  variant="row"
  data={artifact}
  footerExtras={threadCount > 0 ? <ThreadCountChip count={threadCount} /> : undefined}
  onClick={() => openArtifact(artifact.id)}
/>
```

### Recipe — single_full_preview
```tsx
<ArtifactSurface
  variant="page"
  data={artifact}
  preview={<ArtifactPreviewSurface kind={artifact.kind} preview={artifact.preview} size="full" />}
  discussion={<ThreadList artifactId={artifact.id} />}
  actions={<OpenInNewPaneButton />}
/>
```

### Recipe — review_message_embed
```tsx
<ArtifactSurface
  variant="embed"
  data={artifact}
  preview={<ArtifactView shape={shapeFromKind(artifact.kind)} payload={payloadFromArtifact(artifact)} />}
  actions={<OpenArrow onClick={() => openInPane(artifact.id)} />}
/>
```

---

## States

The state prop ('populated' | 'loading' | 'error') controls the identity strip's render:
- 'populated': renders normally.
- 'loading': renders a skeleton matching the strip's shape (badge skeleton + 2 text skeletons).
- 'error': renders normally; the consumer is responsible for rendering an error indicator inside the preview slot.

The preview / discussion slots own their own loading and error states. When `preview` is undefined and the consumer wants the placeholder, they pass `<ArtifactPreviewSurface preview={null} />`, which renders the placeholder.

---

## Sub-primitives reused

The same internal sub-primitives as variant B are still useful inside ArtifactSurface:
- `ArtifactKindBadge` (kind tag)
- `ArtifactCostChip` (cost + tokens)
- `ArtifactTimestamp` (relative + absolute on hover)
- `ArtifactPreviewSurface` (the kind-renderer switch)

But unlike variant B, in variant C these are first-class exports — consumers may use them outside of ArtifactSurface (e.g. on a notification row that mentions an artifact). This is a feature: the design system gains four small reusable pieces.

---

## Behavior

- `block` and `row`: clickable when `onClick` is provided. Keyboard `Enter`/`Space`. Focus ring per AQ-015.
- `page`: not clickable; the consumer wires per-section interactions.
- `embed`: identity strip non-interactive. The `actions` slot is the affordance.

---

## Mobile adaptation

- `block`: breaks to 1 column at < 640px (consumer's grid). Density-comfortable kicks in at < 1024px.
- `row`: at < 480px, footerExtras drops to a second line.
- `page`: discussion sidebar drops below body at < 1024px.
- `embed`: inherits.

---

## Component-budget impact

- **+1 base component:** ArtifactSurface.
- **+4 first-class sub-primitives:** ArtifactKindBadge, ArtifactCostChip, ArtifactTimestamp, ArtifactPreviewSurface.
- **0 layout components** — they are call-site compositions.
- Net public component count: +5 (1 base + 4 reusable primitives).

---

## Tradeoffs / risks

- **Pro:** maximum flexibility — surfaces can compose unique combinations without forking.
- **Pro:** sub-primitives become reusable on non-Artifact surfaces (notification rows, knowledge-row mentions, search results).
- **Pro:** if a fifth-but-disallowed layout were ever attempted, it would manifest as an unreviewed call-site recipe rather than a sneaky component PR.
- **Con:** the closed view family becomes a docs / convention concern, not an enforced one. The concept's "four layouts, closed" rule is harder to police.
- **Con:** consumers must know which slots to pass for which variant — the `discussion` slot on `block` is silently ignored, the `preview` slot on `row` is silently ignored. Mistakes are quiet.
- **Con:** the embed variant's "no chrome" rule depends on the base behaving correctly under `variant="embed"` — there is one switch in the base that, if regressed, breaks the rule everywhere.
- **Con:** the call-site recipes drift over time as different surfaces want minor tweaks. Variant B locks the recipe by giving each layout a dedicated component.
- **Highest risk:** the closed-family discipline is the whole point of the L3 spec. A composition-based approach makes it possible to violate the closure without anyone noticing.
