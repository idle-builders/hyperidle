# UI Stack & Component Budget

Token authority lives in `packages/design-system/DESIGN.md` and `packages/design-system/src/tokens.css`. This file complements it with the stack/component baseline.

**Foundation:** Tailwind CSS + DaisyUI + custom `factory-dark` theme (surfaces, accents, text hierarchy, radius, fonts).

**Behavior:** `focus-trap-react` (modals), `@floating-ui/react` (positioning).

**Custom components:** No strict count enforced. Create new components only when necessary, as decided by the designer. Prefer composition inside existing components when possible. Current baseline:

- **Tier 1:** StatusChip, Tag, KeyValue, NavItem, SearchField, PageHeader, SectionLabel
- **Tier 2:** ThreadRow, BetCard, PitchCard, TaskCard, KnowledgeRow, NotificationRow
- **Tier 3:** Sidebar, ArtifactView, ReviewHeader, Canvas, Kanban, PitchSelector
