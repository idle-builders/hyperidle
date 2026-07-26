# Variant A — Current-contract recovery atlas

## User task

A maintainer determines what each failed browser assertion should prove now, while a user retains the current canonical journeys unchanged.

## Component composition

- `AppShell` → `SidebarV2` + routed main content.
- Existing `PageHeader`, `Breadcrumb`, `NavHistoryCluster`, `ThreadSections`, `ConversationSurface`, `PartList`, `SplitView`, `KnowledgeRow`, `StatusChip`, `EmptyState`, `ErrorState`, `SkeletonList`, `Button`, `Dialog`/`ScopeChangeDialog`, `ArtifactSection`, and `Block` families only.
- No new component. The atlas is review evidence, not production UI.

## Information hierarchy

1. Canonical location and primary content: route, page title, content users act on.
2. Primary action and transition: the one route/mutation each state affords.
3. Supporting status, metadata, and recovery: tertiary labels, state feedback, retry/dismissal.

## States

- **Empty:** existing `EmptyState`, explicit next action; no dead filters. Work zero-team points to Setup; Conversations starts a thread; Knowledge creates an item.
- **Loading:** shape-matched skeleton; no generic full-page spinner.
- **Error:** Hearth `ErrorState` with action-oriented copy and Retry where retryable.
- **Populated:** semantic rows/cards and shared renderers; no selectors tied to deleted layout wrappers.
- **Overflow:** truncation only for secondary row text; primary titles remain available to assistive technology; scroll within stacked Settings and long reading surfaces.

## Behavior

- Hover/focus use existing component behavior; visible focus always.
- Shell shortcuts: ⌘/Ctrl+1/2/3, ⌘/Ctrl+[/], ⌘K; guarded while typing. Escape closes Settings, Search, and Assistant and restores their trigger focus. Conversation dial-in uses D and its close button, not Escape.
- Settings enters from footer gear, swaps sidebar body, renders one stacked page; closes with Escape or its explicit close action, not backdrop click.
- Motion uses Hearth fast/default tokens, transform/opacity only, and honors reduced motion.
- Assistant trigger toggles its overlay; outside click does not dismiss; Escape/trigger/close dismiss and restore trigger focus.
- Dialog focus traps only while one of the seven retained families enumerated in `register-decisions.md` is open; overlays/popovers follow documented ownership.

## Responsive adaptation

- Same component size at all widths; no density mode.
- Sidebar remains part of the app shell at 768px; ≤1024px every interactive target is at least 44px.
- Retained scope-change dialog becomes a non-overflowing bottom sheet at 375px.
- Full-page create screens remain full-page; they do not turn back into dialogs.

## Signature

One finite contract map ties every design-owned non-pass to a canonical location, retained capability, and representative painted state—without changing the product.

## Trade-offs

- Does not beautify or redesign screens.
- Cannot declare runtime success; it only removes contract ambiguity for architecture and red-proof phases.
