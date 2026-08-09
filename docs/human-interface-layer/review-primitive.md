# Review primitive

A review is a single surface where a human judges one **Subject** — the output of a task or bet — and casts one **verdict**. It is dual-anchored: it shows *what was asked* (the intent / prompt) and *what was produced* (the Subject), so the verdict answers both "did it do the right thing?" and "is the output sound?". The underlying data is the [`Artifact` primitive](../process-layer/artifact-primitive.md); the review layer only owns presentation. The verdict grammar itself (five decisions, buttons-only) is owned by the [`Thread` primitive](./thread-primitive.md).

## Review canvas families

AL2 ships nine proof-family canvases. Each artifact renders through the canvas selected by its `kind` via `getReviewCanvas(kind)` (`layers/core-ui/src/pages/review/canvas-registry.ts`); unknown kinds fall back to a safe header + JSON dump.

| Kind | Canvas | What it shows |
|---|---|---|
| `outcome_summary` | `ReviewOutcomeSummary` | Frame lead: agent result, done conditions, needs-you items. |
| `field_change_set` | `ReviewFieldChangeSet` | Record fields that changed, with provenance and unchanged count. |
| `action_operation` | `ReviewActionOperation` | Staged action receipt: verb, amount, blast radius, receipt fields. |
| `rendered_in_context` | `ReviewRenderedInContext` | Email or document rendered in its inbox context. |
| `metrics_moved` | `ReviewMetricsMoved` | Period metrics, roll-forward table, exceptions. |
| `visual_diff` | `ReviewVisualDiff` | Before/after regions for UI assets. |
| `code_diff` | `ReviewCodeDiff` | Relevance-ranked diff: logic files, test files, collapsed trivia. |
| `batch` | `ReviewBatch` | Per-item rollup with flagged items surfaced first. |
| `browser_preview` | `ReviewBrowserPreview` | Basic browser view of a deployed or preview URL. |

## Composition surface (AL3)

The `ReviewComposition` component at `/work/bet/:betId/review/:reviewId` (`layers/core-ui/src/router.tsx`) wraps the canvas families into a coherent review page:

```
ReviewComposition
├─ Frame header    (bet › task, agent → reviewer, verdict buttons)
├─ The task        (the real prompt + source link)
├─ Result          (outcome, KPIs, visible proof, intent met-line)
├─ Needs you       (risks, each jump-linked to its artifact)
├─ Artifacts       (thin opener rows; click opens the pane)
├─ Conversation    (one global thread; inline anchored comments bind to artifact blocks/lines)
└─ Right pane      (selected artifact rendered by its AL2 family canvas)
```

Clicking an artifact opens it at full size in a right pane without leaving the review. Press `Esc` or click ✕ to close the pane and return to the whole Subject. One verdict resolves the whole Subject; there are no per-artifact verdicts. The five verdict decisions are `VERDICT_DECISIONS` (`framework/domain-model/src/thread.ts`) — see [Thread primitive](./thread-primitive.md).

## Anchored comments (AL4)

Comments in a review are plain messages in the Subject's single global Thread. Each comment can optionally carry an `AnchorRef` (`artifactId` + `blockId` + optional `spotLabel`). When a comment is anchored, it renders directly next to the spot it addresses: a code-diff line, a paragraph inside an email body, etc. The spot label (`src/billing/promo-webhook.ts`, `Solo plan launch — $19/mo`) gives readers a readable handle, but the real binding is block identity, not coordinates or line numbers. That means the comment follows the content across edits; if the addressed block disappears, the comment becomes an orphan rather than silently reattaching.

In the global conversation, anchored comments show the spot label as a clickable chip; clicking it opens the owning artifact in the right pane. New anchored comments are created by hovering the relevant line or block and using the inline composer; replies attach to the same anchor and appear both inline and in the global thread.

## Tool grounding and safety

Every canvas carries its source tool via `ToolLogo` and a jump-off link via `CanvasSourceHeader`. `isSafeSourceHref` (`layers/core-ui/src/pages/review/source-link-guard.ts`) blocks non-HTTP(S) schemes such as `javascript:`, so agent-authored `sourceHref` values cannot become a click-through XSS vector. Unknown kinds render `ReviewUnknownCanvas`: source header, kind label, and a capped JSON preview — never a blank screen or crash.

## Trust gating — what reaches a human (AD4)

Trust is **earned from verdict history, not assigned**. The policy engine (`layers/core-api/policy/src/policy-engine.ts`) decides, per item, whether an agent's output is pushed at a human, queued quietly, or auto-resolved — based on **approval rate × riskTier**:

- **Trust signal** = the agent's approval rate over a sliding window (`trust_window_days`, default 30), computed from its verdict history (`layers/core-api/policy/src/approval-rate.ts`). Approval = `approve` or `approve-with-comments`.
- **Decision order** (`policy-engine.ts`):
  1. `riskTier = "high"` → always **push** to a human.
  2. `kind = "skill_change"` → always **push**.
  3. Non-blocking item from a silenced agent → **queue**.
  4. Cold start: fewer than `trust_auto_resolve_min_verdicts` (default 10) verdicts → always **push** — new agents get maximum oversight until they accumulate history.
  5. Approval rate ≥ `trust_auto_resolve_threshold` (default 0.9) and `riskTier = "low"` → **auto_resolve** (the engine writes an `approve` verdict as `policy_engine`).
  6. Approval rate ≥ `trust_queue_threshold` (default 0.7) and `riskTier = "low"` → **queue**.
  7. Otherwise → **push**.

All thresholds live in factory settings with safe defaults. The effect the user sees: a new agent's every output lands in review; as its approval rate climbs, low-risk output stops interrupting and eventually resolves itself. Nothing is configured per skill — the gate fades as trust grows.

## Execution on approve (AL7)

Approving a review fires its **consequences** — a review that changes nothing should not exist. The `approve` verdict is the collaboration checkpoint on the Subject's **Proposed Call**: the irreversible call (a refund, a merge, a send) the agent attempted and the gate routed to a human. The review shows the **concrete proposed call** — tool id + verbatim args — so judgment is grounded in the real action. On approve, HyperIdle grants the call and re-engages the agent's own session; the agent re-does the approved work through its own tools and continues. Non-approving verdicts hold the call un-executed. Proposed Call statuses: `captured | granted | executed | failed | held` (`framework/domain-model/src/proposed-call.ts`).

HyperIdle itself executes nothing — see [system boundary](../architecture/system-boundary.md). Full gate mechanics (grant CAS, session re-engagement, reversibility classification, auto-flow AL8): [Staged operation / Proposed Call](../process-layer/staged-operation.md).

### OutcomeBand — what the reviewer sees after approving

The `action_operation` canvas (`ReviewActionOperation`) renders a persistent **OutcomeBand** once the agent's own session runs the approved call and the Outcome is recorded (`layers/core-ui/src/pages/review/ReviewActionOperation.tsx,312-365`). The band replaces nothing — it appears below the receipt on the same card.

**States:**

| Band | When | Visual |
|---|---|---|
| *(none)* | `status = "captured"` — routed to review, not yet approved | Canvas shows the captured call (tool id + args) and the pre-commit receipt unchanged |
| *(none)* | `status = "granted"` or `status = "held"` — approved-not-yet-run, or held by a non-approving verdict | Band-less, same as captured |
| **Executed** (green) | `status = "executed"`, `outcome.status = "ok"` | `--accent-primary` / `--accent-primary-dim` fill; tick icon; short `receipt` identity (e.g. `abc1234… · merged`) + humanized `executedAt` |
| **Execution failed** (red) | `status = "failed"`, `outcome.status = "failed"` | `--status-error` / `--status-error-dim` fill; ✕ icon; **verbatim, un-truncated** error text (`whitespace-pre-wrap break-words`) + humanized `executedAt` |

**Design rules:**
- The success band uses a `--status-success` tint, **not** `--accent-secondary-dim` (the warning/money amber used on the amount block). A completed op is history — it must not continue reading in the danger color family (`ReviewActionOperation.tsx`).
- The failure error is **never truncated** — a reviewer cannot be forced to miss the exact tool error. `whitespace-pre-wrap break-words` preserves the tool's own newlines and keeps long tokens inside the band.
- `executedAt` is a pre-humanized relative string ("2 min ago") — the reviews loader formats it at the response boundary; the component never parses time.
- There is **no HyperIdle-held `executing` state** — HyperIdle never holds an in-flight execution; the agent's own session does. If that session ends without the approved op executing (crash/no-show), the liveness net re-provisions once, then surfaces a `failed` Outcome (`layers/core-api/review/src/proposed-call-workflow.ts,66-82`) — a reviewer never sits on a permanent spinner.
- The band is **persistent** — a re-opened review shows the terminal Outcome state instead of re-prompting for a verdict on an already-executed op.

## Where it lives

The registry, types, canvases, and composition component are in `layers/core-ui/src/pages/review/`. `ReviewPage` at `/work/bet/:betId/review/:reviewId` renders `ReviewComposition`. The server exposes `GET /api/reviews/:reviewMessageId` (`layers/core-api/src/routes/reviews.ts`) — a real loader querying `proposed_calls LEFT JOIN operation_outcomes` plus artifacts, humanizing `executedAt` server-side; a fixture remains only for the demo id `rev-1`. The route is mounted in `layers/core-api/src/app.ts`.

Next: [`Artifact` primitive](../process-layer/artifact-primitive.md) for the canonical data shape, or [`Thread` primitive](./thread-primitive.md) for the conversation container and verdict grammar.
