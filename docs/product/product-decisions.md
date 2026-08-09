# Product Decisions

Durable founder decisions from the June 2026 feature audits. Two kinds: standing decisions that must not be re-opened, and decided-but-unexecuted work.

Target user framing behind all of these: solo founder up to a small (~10-person) team, tech company or agency, building with heavy AI leverage. See [ETHOS.md](../../ETHOS.md).

---

## 1. Standing decisions — do NOT re-open

**Knowledge merge/split stays API-only.** `POST /api/knowledge/:id/merge` and `/:id/split` exist (`layers/core-api/src/routes/knowledge.ts:734`, `:784`); no UI buttons, ever. Users comment on the item and an agent performs the edit. That is the intended end state, not a gap.

**No per-skill autonomy controls, ever.** The per-agent-per-skill autonomy product was removed outright. Agents get allow-all on the tools and skills they use; their output is judged at review, and knowledge-item edits are scored behind the system to decide whether a change needs review. Trust model detail: [Review Primitive](../human-interface-layer/review-primitive.md).

**Bet pause/resume does not exist by design.** Resolved by removing the paused state from the bet lifecycle (U1), not by adding endpoints. Lifecycle authority: [Bets](../process-layer/bets-shape-commit-change-ship.md).

**No bundled demo/portfolio ceremony for single-product founders.** The cross-team Portfolio grid was removed (AD9); Work lands on `WorkOverview`.

---

## 2. Decided, not yet executed

- **Knowledge scope cleanup.** Authoring exposes all 7 scope kinds (`SCOPE_KINDS`, `framework/domain-model/src/types.ts:181`; scope enum owned by [The Canonical Store](../knowledge-architecture/the-canonical-store.md)). Founder direction: cut the user-facing choice to roughly three — whole company / this product / just me; the practice-vs-product-vs-team distinction is confusing without domain knowledge. Not shipped.
- **Knowledge kind taxonomy under question.** Founder doubts the value of the pattern/decision/failure/brief classification and notes "skill" is missing as a kind even though skills are knowledge items. Kind now lives in the app projection as open text (`knowledgeAppProjection.kind`, `framework/db/src/schema.ts:1014`). Open product question, no resolution yet.
- **Create-knowledge-from-discussion needs no button.** An agent can identify and capture knowledge from bet/task discussion; the explicit UI affordance is dispensable.
- **Org-chart settings page removal.** Founder: "nobody needs that — we have teams with a responsible human and agents inside." `layers/core-ui/src/settings/SettingsOrgChart.tsx` still exists; removal pending.
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
| Global search | Built (AD7): `layers/core-api/src/routes/search.ts`, GET `/api/search` |
| Knowledge Flag / Archive dead buttons | Flag removed (agent operation, not user-facing); Archive wired (AD6) |
| Task dependency auto-unblock | Wired: `checkAndUnblockDependents` in `layers/core-api/work/src/dependency-watcher.ts`, subscribed in `layers/core-api/src/app.ts:493` |
| Assistant responder | Wired: `layers/core-api/conversation/src/assistant-turn-resolver.ts`, running through the durable request poller |
| Routine scheduler (cron, silent runs, delegation) | Started at boot: `startRoutineScheduler` in `layers/core-api/src/service-bootstrap.ts:600` |
| Portfolio page | Removed (AD9); `WorkOverview` is the Work landing |
| Per-skill autonomy product | Removed (see §1) |
| Bet pause/resume | Removed from the bet lifecycle (U1; see §1) |
