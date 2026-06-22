# Variant C — Provider cards (t3code lineage)

**User task.** Treat each backend as a thing you own and configure: see its status, take the one action when needed, and drill into its models/capabilities on demand.

**Component composition.** A vertical stack of uniform `--surface-elevated` cards (`--shadow-default`, 18px padding). Each card:
- **Header** — name (17px) + `StatusChip` + access-mode/version subline + right-aligned `Toggle`.
- **Auth zone** (only when actionable) — a tinted `--surface-page` inset: a sentence + primary `Button` (`authAction.label`) + copyable mono command. This is the unmissable next step.
- **Unavailable zone** (only when unavailable) — tinted inset with `discovery.reason`, no CTA.
- **Capabilities** — a `Fold` ("Models & capabilities · Show"), collapsed by default; expands to `KeyValue` rows (models, file-editing, MCP, sub-agents). Progressive disclosure.

**Information hierarchy.**
1. Card identity + readiness (per-backend focus).
2. Enable toggle.
3. Auth zone (when present) — visually distinct inset, can't be missed.
4. Capabilities fold (reference, opt-in).

**States.** Populated shown. Empty/loading/error deferred to build. Fold open/closed is local state (shown closed).

**Behavior.** Card chrome uniform across all backends (the descriptor-driven contract made visible — same card, different zones). Auth zone present iff `hasActionableNextStep`. Fold present iff the descriptor declares models/caps. Toggle disabled until ready. Motion: Fold uses `--motion-default`.

**Mobile.** Cards full-width; toggle drops below identity; auth zone buttons wrap.

**Signature.** Each backend is a self-contained card with a dedicated auth zone — the next step is a visually distinct inset, not an inline button buried in a row.

**Trade-offs.** Lowest density — five cards push the last backend below the fold on a short viewport. More vertical real estate per backend than A or B. The uniform card chrome means a ready backend (no auth zone, collapsed fold) is mostly empty space below its header.
