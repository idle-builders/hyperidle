# AL7 — Review execution loop · Design brief

**DESIGN-CLASS: routine**

Extends the existing `action_operation` review canvas (`ReviewActionOperation.tsx`). Adds an
execution-result band (the **Operation Outcome**) below the existing pre-commit receipt — not a new
base primitive. No new page, no new navigation, no new interaction grammar. The verdict grammar is
unchanged; `approve` simply now resolves into a visible outcome on the same canvas.

Per the locked concept (`plans/AL7/concept.md`) and the project memory rule, this WP's design
review is **No** and the variant renders only the **populated real state** — the canvas after a
successful execution and the canvas after a failed execution (both are real terminal states the
reviewer must read, not loading/empty/skeleton states, which are build concerns).

---

## The user's task

A reviewer has approved (or is about to approve) a staged operative action — a Stripe refund, a
merge/landing, a send. AL2 built the **pre-commit receipt** (verb · amount · blast radius ·
reversibility · the gate). AL7's design question is narrow:

> After the reviewer approves and the Kernel runs the operation through the tool, **what does the
> reviewer see come back?** And when it fails, how does the failure surface so it is impossible to
> miss?

What would waste their time: a spinner with no terminal state; a silent success that doesn't confirm
the money actually moved; a failure buried in a toast that vanishes; having to leave the review to
find out whether the refund went through. The concept's hard rule #8 ("failure surfaces, never
silently swallowed") is the spine of this design.

## What already exists (the budget we compose from)

`ReviewActionOperation` (the canvas) renders three layers in one card:
- **L1** — action headline + amount (large, tabular) + irreversible badge.
- **L2** — the receipt fields (charge, customer, reason, idempotency key, net-after).
- **L3** — blast radius + reversibility + a *local* Approve/Reject footer (dead `onApprove`).

The real verdict bar lives one level up, in `ReviewComposition` (the five-verdict bar that resolves
the whole Subject). The canvas's local footer is a story-only echo. **AL7 does not add a second
approve button** — the commit trigger is the Subject's existing verdict bar. The canvas's job is to
*show the staged op and its outcome*, not to own the verdict.

Design-system tokens only (Hearth). `--status-error` / `--status-error-dim` already carry the
irreversibility warning; `--status-warning` carries the amount. We reuse the same palette for the
outcome band so success/failure read in the family the canvas already established.

---

## The one variant: outcome band appended to the receipt

A single horizontal **status band** appended after L2 (between the receipt `<dl>` and the L3
toggle), keyed on the staged operation's `status`:

- `pending` → no band (today's canvas, unchanged — the staged op hasn't fired).
- `executed` (Outcome `ok`) → a calm **success band**: a filled check, "Executed", the
  `executedAt` time, and the one fact that proves it happened — the tool's return identity
  (`re_3Qs… · refunded` for Stripe). Color: `--accent-primary` family (forest green), the system's
  "good/done" signal. Quiet, because a reversible-once-done refund is now just history.
- `failed` (Outcome `failed`) → a loud **failure band**: `--status-error` border + dim fill (the
  same treatment the irreversibility warning already uses), "Execution failed", the `executedAt`
  time, and the surfaced `error` string verbatim from the tool. This is the loudest thing on the
  canvas after the amount — a failed irreversible op is the exact dangerous moment the product
  exists to surface. It is part of the persistent canvas, never a toast.

The band sits **inside the same card**, directly under the receipt it describes, so the reviewer
reads "this is what I approved" → "this is what happened" in one vertical scan. No new component:
it is markup + tokens inside `ReviewActionOperation`, driven by two new optional props
(`status`, `outcome`).

The idempotency key (already in L2's receipt fields) is the visible anchor that ties the
pre-commit receipt to the post-commit outcome — the reviewer can see the same key the at-most-once
guard dedupes on.

### Why a band, not a separate canvas / modal / new kind

- A separate Outcome canvas would split "what I approved" from "what happened" across two surfaces —
  the reviewer would lose the receipt context exactly when reconciling a failure. The concept says
  the Outcome is "surfaced where the staged operation's canvas rendered" — same canvas, appended.
- A modal/toast violates hard rule #8: it is dismissable and transient. Failure must be a durable,
  re-openable fact on the review. The re-open scenario (AC: re-opening does not double-execute) must
  show the *terminal outcome*, not re-prompt.
- A new artifact `kind` would break the budget and the AL2 selection model — the Outcome is the same
  operative artifact's terminal state, not a different proof family.

## Did we consider X / Y / Z

- **A trailing toast/snackbar for the result.** Rejected — transient, dismissable, dies on re-open;
  fails hard rule #8 (failure must persist against the review) and the re-open AC.
- **A dedicated `operation_outcome` review canvas kind.** Rejected — budget violation; the outcome
  is the staged op's terminal state on the *same* operative artifact, not a separate proof family.
  Selection (`getReviewCanvas(kind)`) stays untouched.
- **Inline live progress (executing spinner) baked into the design variant.** Deferred — the
  `executing` transient is a build concern (states: empty/loading/error). The design renders only the
  populated terminal states (`executed`, `failed`) per the no-skeleton-in-design rule. The builder
  wires the transient.
- **A second Approve button on the canvas that fires the op directly.** Rejected — the commit
  trigger is the Subject's existing verdict bar in `ReviewComposition` (verdict resolves the whole
  Subject; concept hard rule #7, grammar unchanged). A canvas-local execute button would create a
  second authority path and contradict "the agent/human never holds a per-canvas live verb." The
  canvas only *renders* state.
- **Showing the autonomy level / "this flowed without you" banner for reversible auto-flowed ops.**
  Out of scope for AL7's canvas — graduated autonomy is the trust dial (`trust` §10), read but not
  redefined here; reversible auto-flow doesn't produce a gated review canvas in the first place.

## States rendered in the variant story

Populated terminal states only (per memory rule — no skeleton/empty/error-as-loading in the design):
1. **Executed (ok)** — success band with tool return identity + executedAt.
2. **Failed** — failure band with the surfaced error verbatim, loud `--status-error` treatment.

(The `pending` state is the already-shipped AL2 canvas, unchanged; shown for continuity.)
