# Review primitive

A review is a single surface where a human judges one **Subject** — the output of a task or bet — and casts one **verdict**. It is dual-anchored: it shows *what was asked* (the intent / prompt) and *what was produced* (the Subject), so the verdict answers both “did it do the right thing?” and “is the output sound?”. The underlying data is still the [`Artifact` primitive](../process-layer/artifact-primitive.md); the review layer only owns presentation.

## Review canvas families

AL2 ships nine proof-family canvases. Each artifact renders through the canvas selected by its `kind` via `getReviewCanvas(kind)`; unknown kinds fall back to a safe header + JSON dump.

| Kind | Canvas | What it shows |
|---|---|---|
| `outcome_summary` | `ReviewOutcomeSummary` | Frame lead: agent result, done conditions, needs-you items, cost. |
| `field_change_set` | `ReviewFieldChangeSet` | Record fields that changed, with provenance and unchanged count. |
| `action_operation` | `ReviewActionOperation` | Staged action receipt: verb, amount, blast radius, receipt fields. |
| `rendered_in_context` | `ReviewRenderedInContext` | Email or document rendered in its inbox context. |
| `metrics_moved` | `ReviewMetricsMoved` | Period metrics, roll-forward table, exceptions. |
| `visual_diff` | `ReviewVisualDiff` | Before/after regions for UI assets. |
| `code_diff` | `ReviewCodeDiff` | Relevance-ranked diff: logic files, test files, collapsed trivia. |
| `batch` | `ReviewBatch` | Per-item rollup with flagged items surfaced first. |
| `browser_preview` | `ReviewBrowserPreview` | Basic browser view of a deployed or preview URL. |

## Review surfaces (AL5)

The nine family canvases above are the *generic* review surfaces — they work for any tool, well for none in particular. A **review surface** specializes one of them for a recognizable situation: "a Stripe refund review", "a marketing-campaign review", "a data-migration review". A review surface **is a React component** (the review canvas is already React) plus a small manifest — authored by **HyperIdle or the community through one registry mechanism**, distributed shadcn-style, and **deliberately adopted** by a team. It is code, not config: review surfaces are open-ended UI, contributors are devs, and AI writes a component cheaply.

- **Code that specializes a base canvas.** A surface composes over one of the nine **base canvases** through that canvas's slots, inheriting its structure and its fallback. Not a freeform from-scratch screen.
- **Registry-distributed; adopted, never auto-applied.** Surfaces live in a **registry** (a catalog of *availables* — HyperIdle's + community ones; anyone can host one). A team **adopts** the one it wants for a situation — a deliberate, owned, version-pinned, reviewable mapping `(tool/task → surface)`. The system renders the **adopted** surface by that explicit mapping; it **never** scores thousands of candidates at render time. No adoption (or a failed surface) → the **base canvas** renders. "Which surface rendered this review, and who chose it" is always answerable.
- **Two layering modes: wrap or eject.** **Wrap** — compose over the base canvas via its slots (upgrade-safe; the default). **Eject** — fork the base canvas's source and own it (total control; you own upgrades). Each base canvas declares, per slot, `wrap | eject | forbidden`.
- **The base canvas is the floor and the always-present fallback.** Every surface specializes one; "review for anything" holds for anything nobody surfaced.
- **A surface is the lens, never the decision.** It changes presentation only; it never moves the verdict, the staged action, or the [gate](../process-layer/staged-operation.md).
- **One mechanism; provenance + trust the only difference.** First-party and community surfaces use the same registry, distinguished by **provenance** (`first-party | community`) and an AN **trust tier** (`vetted | community`, reused from [`Connection`](../agent-layer/tool-integration.md)). Trust is adopt-time **code review + ownership**, not a runtime sandbox — a surface is reviewable/previewable before adoption.
- **Boundary with AN4.** AL5 owns the **review surface** (the code unit, the base-canvas slot contracts, the registry, adoption, the floor fallback). The [connector registry](../agent-layer/tool-integration.md) (AN4) owns the **Connector** (tool integration). A connector may *reference* a preferred surface; a surface is independently publishable. There is no `ui://` shipped review UI in scope.

## Composition surface (AL3)

The `ReviewComposition` component at `/work/bet/:betId/review/:reviewId` wraps the canvas families into a coherent review page:

```
ReviewComposition
├─ Frame header    (bet › task, agent → reviewer, cost, five verdicts)
├─ The task        (the real prompt + source link)
├─ Result          (outcome, KPIs, visible proof, intent met-line)
├─ Needs you       (risks, each jump-linked to its artifact)
├─ Artifacts       (thin opener rows; click opens the pane)
├─ Conversation    (one global thread; inline anchored comments bind to artifact blocks/lines)
└─ Right pane      (selected artifact rendered by its AL2 family canvas)
```

Clicking an artifact opens it at full size in a right pane without leaving the review. Press `Esc` or click ✕ to close the pane and return to the whole Subject. One verdict resolves the whole Subject; there are no per-artifact verdicts.

## Anchored comments (AL4)

Comments in a review are plain messages in the Subject's single global Thread. Each comment can optionally carry an `AnchorRef` (`artifactId` + `blockId` + optional `spotLabel`). When a comment is anchored, it renders directly next to the spot it addresses: a code-diff line, a paragraph inside an email body, etc. The spot label (`src/billing/promo-webhook.ts:118`, `Solo plan launch — $19/mo`) gives readers a readable handle, but the real binding is block identity, not coordinates or line numbers. That means the comment follows the content across edits; if the addressed block disappears, the comment becomes an orphan rather than silently reattaching.

In the global conversation, anchored comments show the spot label as a clickable chip; clicking it opens the owning artifact in the right pane. New anchored comments are created by hovering the relevant line or block and using the inline composer; replies attach to the same anchor and appear both inline and in the global thread.

## Tool grounding and safety

Every canvas carries its source tool via `ToolLogo` and a jump-off link via `CanvasSourceHeader`. `isSafeSourceHref` blocks non-HTTP(S) schemes such as `javascript:`, so agent-authored `sourceHref` values cannot become a click-through XSS vector. Unknown kinds render `ReviewUnknownCanvas`: source header, kind label, and a capped JSON preview — never a blank screen or crash.

## Execution on approve (AL7)

Approving a review fires its **consequences** — a review that changes nothing should not exist. The `approve` verdict is the **collaboration checkpoint** on the Subject's [Proposed Calls](../process-layer/staged-operation.md) — the *irreversible* calls (a refund, a merge/landing, a send) the **trusted** agent attempted and the gate routed to a human for judgment. **HyperIdle executes nothing of its own**: we trust the agent, which holds its own credentials and runs its own tools (like a real employee with broad self-permission). Approve lets that trusted agent's irreversible action **actually happen, through the agent's own tools** — HyperIdle composes a **tailored grant** (do the approved op + reversible work; route any *other* irreversible op back to review), re-engages the agent's session, and the agent **re-does the approved work itself** (re-deriving the call is fine — we trust the intent). The result returns to the review, and the agent **continues working** — closes the story, updates docs, proceeds. The review shows the **concrete proposed call** — tool id + verbatim args — so the human's judgment is grounded in the real action. Reversible calls flow at the gate without review (the auto-flow-per-trust wiring is AL8); the gate is reserved for the irreversible and **fades as trust grows**. Non-approving verdicts hold the Proposed Call un-executed. The verdict grammar is unchanged — approve gains a consequence, not a new action. The checkpoint rides the harness's **native permission mechanism** (ask/allow/deny) as a workflow, not a security boundary policing the agent. Full spec: [Review-gated execution / Proposed Call](../process-layer/staged-operation.md).

### OutcomeBand — what the reviewer sees after approving

The `action_operation` canvas (`ReviewActionOperation`) renders a persistent **OutcomeBand** once the agent's own session runs the approved call and the Outcome is recorded. The band replaces nothing — it appears below the receipt on the same card.

**States:**

| Band | When | Visual |
|---|---|---|
| *(none)* | `status = "captured"` — routed to review, not yet approved | Canvas shows the captured call (tool id + args) and the pre-commit receipt unchanged |
| **Executed** (green) | `status = "executed"`, `outcome.status = "ok"` | `--accent-primary` / `--accent-primary-dim` fill; tick icon; short `receipt` identity (e.g. `abc1234… · merged`) + humanized `executedAt` |
| **Execution failed** (red) | `status = "failed"`, `outcome.status = "failed"` | `--status-error` / `--status-error-dim` fill; ✕ icon; **verbatim, un-truncated** error text (`whitespace-pre-wrap break-words`) + humanized `executedAt` |

**Design rules:**
- The success band uses `--accent-primary-dim` (forest green), **not** `--accent-secondary-dim` (the warning/money amber used on the amount block). A completed op is history — it must not continue reading in the danger color family.
- The failure error is **never truncated** (hard rule #9 — a reviewer cannot be forced to miss the exact tool error). `whitespace-pre-wrap break-words` preserves the tool's own newlines and keeps long tokens inside the band.
- `executedAt` is a pre-humanized relative string ("2 min ago") — the reviews loader formats it; the component never parses time.
- There is **no HyperIdle-held `executing` state** — HyperIdle never holds an in-flight execution; the agent's own session does. If session 2 ends without the approved op executing (crash/no-show), the liveness net re-provisions once, then surfaces a `failed` Outcome — a reviewer never sits on a permanent spinner.
- The band is **persistent** — a re-opened review shows the terminal Outcome state instead of re-prompting for a verdict on an already-executed op.

## Where it lives

The registry, types, canvases, and composition component are in `packages/web/src/pages/review/`. `ReviewPage` at `/work/bet/:betId/review/:reviewId` renders `ReviewComposition`. The server exposes `GET /api/reviews/:reviewId` as the Subject loader stub; the route is mounted in `packages/server/src/app.ts`.

Next: [`Artifact` primitive](../process-layer/artifact-primitive.md) for the canonical data shape, or [`Thread` primitive](./thread-primitive.md) for the conversation container.
