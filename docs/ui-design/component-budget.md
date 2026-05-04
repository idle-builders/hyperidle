# UI Stack & Component Budget

Token authority lives in `packages/design-system/DESIGN.md` and `packages/design-system/src/tokens.css`. This file complements it with the stack/component baseline.

**Foundation:** Tailwind CSS + DaisyUI + custom `factory-dark` theme (surfaces, accents, text hierarchy, radius, fonts).

**Behavior:** `focus-trap-react` (modals), `@floating-ui/react` (positioning).

**Custom components:** No strict count enforced. Create new components only when necessary, as decided by the designer. Prefer composition inside existing components when possible. Current baseline:

- **Tier 1:** StatusChip, Tag, KeyValue, NavItem, SearchField
- **Tier 2:** ThreadRow, BetCard, PitchCard, TaskCard, KnowledgeRow, NotificationRow, ReasoningBlockView (renamed from `ReasoningBlock` to disambiguate from the L2 Block content primitive — see `docs/blocks/blockkind-the-closed-vocabulary.md`. The TSX rename is implementation work for whichever story first touches the component; the name in this list is canonical from this concept-doc pass forward.)
- **Tier 3:** IconRail, Submenu, Rail, ArtifactView, ReviewHeader, Canvas, Kanban, PitchSelector
