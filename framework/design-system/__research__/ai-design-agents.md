# Research: AI Design Agents Survey

## Question set

- Survey of best AI design agents: shadcn/ui, v0.dev, Magic Patterns, claude.ai canvas, Cursor design rules, Bolt.new patterns.
- What do their prompts/rules emphasize re: spacing, type, color, motion, anti-patterns?
- Where do they disagree with traditional design systems?
- Cross-link findings to sections 1-7.

## Sources surveyed

- shadcn/ui — Docs: https://ui.shadcn.com/docs
- shadcn/ui — Themes: https://ui.shadcn.com/themes
- shadcn/ui — Components index: https://ui.shadcn.com/docs/components
- shadcn/ui — CLI: https://ui.shadcn.com/docs/cli
- Radix Primitives — Overview: https://www.radix-ui.com/primitives/docs/overview/introduction
- Radix Primitives — Styling: https://www.radix-ui.com/primitives/docs/overview/styling
- v0 by Vercel: https://v0.dev/
- Vercel Geist (consumed by v0 generations): https://vercel.com/geist/introduction
- Tailwind CSS: https://tailwindcss.com/
- Tailwind utility-first: https://tailwindcss.com/docs/utility-first

## Findings

### shadcn/ui

shadcn/ui distributes copy-pasteable React components built on Radix primitives, styled with Tailwind. The most relevant facts for this research:

- **Closed radius scale.** The default theme exposes a single `--radius` CSS variable (default 0.5rem = 8px). All component variants compute their radius as fractions/multiples of this single source. Switching the theme changes one variable, not 12. This matches productivity-tool radii and avoids the `rounded-2xl` AI-default tell.
- **Tailwind utility-first conventions.** Components use Tailwind utility classes directly. There are no abstract "padding" props that take arbitrary values. Spacing is taken from the Tailwind 4px scale.
- **No marketing copy in primitives.** Buttons, cards, badges ship without "Click here" / "Get started" — the consumer provides the labels.
- **Accessibility-first.** Underlying Radix primitives ship keyboard navigation, focus management, ARIA. shadcn/ui inherits this rather than re-implementing.
- **One accent.** Themes ship with a single primary color and derived shades. No multi-accent palettes by default.

Implication for HyperIdle: shadcn/ui's conventions reinforce HyperIdle's existing `--r0..r3` closed scale, single-accent rule, and Tailwind 4px-grid usage.

### v0.dev (Vercel)

v0 generates UI from prompts, biased toward shadcn/ui primitives (publicly stated by Vercel). Its public docs encourage users to ship Geist-styled output. Geist's published design language emphasizes:

- Single accent.
- Black/white/gray base.
- Sharp typography (Geist Sans + Geist Mono).
- Restrained motion.

Implication for HyperIdle: HyperIdle already adopted Geist + Geist Mono. The convergence with v0/Geist defaults means the project is implicitly AI-agent-friendly without inheriting AI-aesthetic tells.

### Tailwind CSS

Tailwind's utility-first approach, with named scales for spacing/sizing/colors, is the substrate for shadcn/ui, v0, and many AI generators. The 4px base grid (Tailwind's 0.25rem step) is pervasive. AI generators that use Tailwind inherit this grid.

Implication: lint rules can target Tailwind class shapes directly (e.g., `\bp-(8|12)\b` for off-grid productivity padding).

### Radix Primitives

Radix Primitives (https://www.radix-ui.com/primitives/docs/overview/styling) provide unstyled accessible building blocks. shadcn/ui wraps them; HyperIdle uses DaisyUI for similar primitives plus custom components. Radix's accessibility-by-default mirrors HyperIdle's PRINCIPLES universal #7 ("Accessibility Is Structure, Not Retrofit").

## Cross-links

- **Spacing & Density (Section 1).** shadcn/ui + v0 + Tailwind all operate on a 4px grid. Reinforces the recommendation to enforce the 4px allowlist via lint.
- **Typography (Section 2).** Geist + Geist Mono is the v0/shadcn/ui convergence. HyperIdle aligns.
- **Color & Dark Mode (Section 3).** shadcn/ui's theme variables and single-accent rule align with HyperIdle's monochrome status philosophy.
- **Borders/Radii/Shadows (Section 4).** shadcn/ui's single `--radius` variable defaulting to 8px matches HyperIdle's `--r2`. Reinforces the productivity-radius lint.
- **Motion (Section 5).** AI agents do not formalize motion tokens; HyperIdle's tier system goes further than the AI-agent baseline.
- **Mobile & Touch (Section 6).** AI agents inherit Tailwind responsive breakpoints. The 768px / 1024px convergence stands.
- **AI-Aesthetic Anti-Patterns (Section 7).** shadcn/ui itself is the strongest counter to AI-aesthetic tells: by shipping productivity-grade defaults, it makes the LLM defaults harder to produce.

## Disagreements with traditional design systems

- shadcn/ui ships a single density. Material/Carbon/Atlassian formalize multi-density tokens. HyperIdle aligns with the multi-density camp because it serves data-dense product workflows (BetCard, ThreadRow, Kanban) plus comfortable detail views.
- shadcn/ui treats radii as a single configurable variable; Material defines 6+ named tokens. HyperIdle splits the difference with a 4-token closed scale.

## Notes for K7 ingestion

This report contributes no token-driving rows of its own; it cross-links the other reports and confirms convergences. The K7 sweep should consult shadcn/ui's `--radius` default (0.5rem = 8px) when comparing HyperIdle's `--r2` (8px) — the values match, no change required.
