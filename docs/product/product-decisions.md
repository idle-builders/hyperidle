# Product Decisions

Durable founder decisions from the June 2026 feature audits. Two kinds: standing decisions that must not be re-opened, and decided-but-unexecuted work.

Target user framing behind all of these: solo founder up to a small (~10-person) team, tech company or agency, building with heavy AI leverage. See [ETHOS.md](../../ETHOS.md).

---

## 1. Standing decisions — do NOT re-open

**Knowledge merge/split stays API-only.** `POST /api/knowledge/:id/merge` and `/:id/split` exist (`packages/server/src/routes/knowledge.ts:684`, `:88-93`); no UI buttons, ever. Users comment on the item and an agent performs the edit. Still API-only as of 2026-07-07 — that is the intended end state, not a gap.

**Cost caps keep the 3-level nesting** (agent < team < factory). The audit called the team level overbuilt for a solo founder; the founder explicitly overrode: keep all three. Cap grammar and the money-not-duration rationale are owned by [WIP and Cost Limits](../process-layer/wip-and-cost-limits.md) — never restated here.

**No standalone cost-visibility surface.** Burn-vs-cap on the team view is the cost UI. A dedicated spend dashboard is an explicit scope-out, not a missing feature.

**No per-skill autonomy controls, ever.** The per-agent-per-skill autonomy product was removed outright. Agents get allow-all on the tools and skills they use; their output is judged at review, and knowledge-item edits are scored behind the system to decide whether a change needs review. Trust model detail: [Review Primitive](../human-interface-layer/review-primitive.md).

**Bet pause/resume does not exist by design.** Resolved by removing the paused state from the bet lifecycle (U1), not by adding endpoints. Lifecycle authority: [Bets](../process-layer/bets-shape-commit-change-ship.md).

**No bundled demo/portfolio ceremony for single-product founders.** The cross-team Portfolio grid was removed (AD9); Work lands on `WorkOverview`.

---

## 2. Decided, not yet executed

- **Knowledge scope cleanup.** Authoring exposes all 7 scope kinds (`packages/shared/src/types.ts:171-179`; scope enum owned by [The Canonical Store](../knowledge-architecture/the-canonical-store.md)). Founder direction: cut the user-facing choice to roughly three — whole company / this product / just me; the practice-vs-product-vs-team distinction is confusing without domain knowledge. Not shipped.
- **Knowledge kind taxonomy under question.** Founder doubts the value of the pattern/decision/failure/brief classification and notes "skill" is missing as a kind even though skills are knowledge items. Kind now lives strategy-side as open text (`packages/db/src/schema.ts:700`). Open product question, no resolution yet.
- **Create-knowledge-from-discussion needs no button.** An agent can identify and capture knowledge from bet/task discussion; the explicit UI affordance is dispensable.
- **Org-chart settings page removal.** Founder: "nobody needs that — we have teams with a responsible human and agents inside." `packages/web/src/settings/SettingsOrgChart.tsx` still exists as of 2026-07-07; removal pending.
- **Routines reframing.** A routine is a work object — or part of a strategy — not an org-level scheduler config. Shapes future Routines work; see [Routines and Retros](../process-layer/routines-and-retros.md).

---

## 3. Deferred until scale demands

Deliberate defers, with rationale — not gaps:

- **Bulk review operations** (approve-similar and friends) — a 3–6-agent team sees 5–15 reviews/day; one-at-a-time is fine.
- **Confidence indicators on reviews** — need a calibrated agent confidence signal first.
- **Edit-history timeline viewer** — mutations are logged; last-modified timestamp suffices at this scale.
- **Skill graduation / usage tallies** — retros improve skills; skill usage can be measured like any other knowledge usage. No auto-increment machinery.

---

## 4. Principles earned from the audit cycle

- **Dead buttons erode trust faster than missing features.** A rendered affordance that silently no-ops teaches the user to distrust the whole interface. Hiding unfinished features is strictly better than showing them.
- **The wiring-gap failure mode.** The most common failure was never missing capability — it was a complete, tested backend plus a rendered frontend with zero connection between them, from shipping the two in separate passes without integration verification. Every June instance was fixed; the process risk remains worth naming.
- **Infrastructure should be invisible.** Blocks, lifecycle propagation, and the knowledge fabric are the strongest subsystems precisely because users only experience their effects.
- **Curation cost is visible, value is invisible.** No mechanism yet shows the founder "this curation session saved your agents N hours." Still an open concern.

---

## 5. Executed — never re-report as missing

Decisions from the June audits that already shipped; do not re-open them as gaps:

| Decision | Resolution |
|---|---|
| Global search | Built (AD7): `packages/server/src/routes/search.ts`, GET `/api/search` |
| Knowledge Flag / Archive dead buttons | Flag removed (agent operation, not user-facing); Archive wired (AD6) |
| Task dependency auto-unblock | Wired: `packages/server/src/services/dependency-watcher.ts`, called from `app.ts:51` |
| Assistant responder | Wired (AD8b): `packages/fabric/src/services/assistant-dispatcher.ts` |
| Routine scheduler (cron, silent runs, delegation) | Started at boot: `packages/fabric/src/bootstrap.ts:165` |
| Portfolio page | Removed (AD9); `WorkOverview` is the Work landing |
| Per-skill autonomy product | Removed (see §1) |
| Bet pause/resume | Removed from the bet lifecycle (U1; see §1) |
