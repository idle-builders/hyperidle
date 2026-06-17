# AL1 — From building blocks to the review SYSTEM

We have the **building blocks** (the per-artifact proof canvases: code-diff, field-change-set, action-operation, metrics-moved, rendered-in-context, visual-diff, batch, + the basics browser/email-body) and the **frame lead** (ReviewOutcomeSummary). This note answers the four system questions: **selection · templating · composition · execution.** Marks what `/concept`+IA already settle vs. what's new.

---

## 1. How is the right review type chosen? — automatic, by artifact KIND
**Automatic, not human-picked, and not raw tool-picked — by the artifact's *kind*.** Every artifact carries a `kind`; the review does `getRenderer(kind)` → the canvas. The kind is *derived from* `(tool, operation, result-shape)`:
- a GitHub PR / a SQL change → `code-diff`; a Stripe refund / a PO / a deploy → `action-operation`; a CRM/ledger/record write → `field-change-set`; an email/doc/KB page → `rendered-in-context`; a reconciliation/forecast/GA4 → `metrics-moved`; a Figma/ad → `visual-diff`; an N-item set → `batch` container.
- So it **depends on the tool only insofar as the tool+operation determine the kind.** The agent/harness tags each produced artifact with its kind at completion; selection is then deterministic.

**Settled?** Yes — the IA (§A3 "artifact kind … determines its review affordances") and the code (`getRenderer(kind)`, the kind registry) already do kind→canvas. **New:** the richer proof-family set (we extended the original 5 renderers to ~7 + the batch container + basics) and a **tool override** (next section).

## 2. Standard templates, or templates by tool? — BOTH (a 3-tier resolution)
The canvas is resolved in precedence order — **the first that matches wins:**
1. **Tool-shipped canvas (MCP Apps).** If the tool's MCP server ships a `ui://` review canvas, use it (sandboxed iframe; host routes its actions back — see §4). *The tool that reported the data can bring its own review UI.*
2. **Per-tool template (manifest).** A registered canvas for `(tool, operation)` — built-in for marquee tools, or **community-contributed** via the HACS-style manifest (`tool · proofFamily · field-bindings · logo · render`). Binds the tool's specific fields into a (possibly specialized) family canvas — e.g. a Stripe-refund template on the action-operation family.
3. **Standard proof-family template (the floor).** The 8 building blocks we built. Every artifact of kind X gets the standard canvas for X. **Always works, even for a tool we've never seen** — that's how "review for anything" holds.

So: **standard family templates by default; per-tool/tool-shipped as an optional override.** The mini-logo + source-header make the tool visible regardless of which tier rendered.

**Settled?** No — this 3-tier model is **new** (from the tool-ecosystem research; not in the locked concept). It's the answer to "useful to many platforms."

## 3. Is the artifact the whole review? — NO. The artifact is the *examine* layer.
A building block is **one artifact's proof**. The **entire review experience** wraps a **Subject = a SET of artifacts** in a frame:

```
┌ REVIEW (one Subject, one verdict) ─────────────────────────┐
│ FRAME (orient · triage · judge · decide) — ReviewOutcomeSummary │
│   source/agent → reviewer · what was achieved · tools       │
│   intent done-conditions (met/✗) · NEEDS YOU (the risks)    │
│ ─────────────────────────────────────────────────────────── │
│ SUBJECT — the artifacts, each a proof building-block,        │
│   relevance-ordered, collapsible (T3 session-summary style): │
│   ▸ code-diff (promo-webhook) · ▸ action (deploy) ·          │
│   ▸ metrics (tests) · ▸ doc (migration note) …               │
│ ─────────────────────────────────────────────────────────── │
│ CONVERSATION — anchored comments over the Subject            │
│ VERDICT BAR — resolves the WHOLE Subject (5 binding)         │
└──────────────────────────────────────────────────────────────┘
```
The building blocks are the **Examination sub-surface**; the frame is the rest of the **Review surface**. One review = a frame + N building blocks + conversation + verdict.

**Settled?** Yes, structurally — IA §C (Review surface composes the groups; Examination sub-surface per artifact), §F (orient→triage→judge→examine→decide), concept §1.5 (the 10 parts + examine-vs-converse). The **composition/journey was explicitly deferred to `/design`** — and that's the next thing to design now that the blocks + frame exist. (The 3 deleted variants were premature attempts at this, before the blocks were right.)

## 4. After approve — how does the AI actually do it? — the verdict is a TRIGGER
Two artifact natures:
- **Descriptive** (code diff, doc, metrics, design): the work *is* the artifact. Approve = accept; a follow-on step ships/merges/publishes.
- **Operative** (Stripe refund, PO, send email, deploy, mass-resolve): the work is a **staged, not-yet-executed operation.** The action-operation canvas we built is literally the **pre-commit receipt** (what it will do · params · idempotency · undo · the gate). **Approve = release the staged operation to execute through the connected tool** (MCP/API). The verdict isn't just a label — for operative artifacts it's the **commit trigger**.

The loop (the founder USP — *plan → interact → review → repeat*):
```
agent does work → stages operation(s) + produces evidence → REVIEW
   → human approves where it matters (autonomy L1–L4 decides whether/who)
   → on approve, the harness DISPATCHES the staged operation(s) to the tool
     (MCP Apps "host routes the action through the user's connected capabilities")
   → result posts back → may open a follow-up review
```
Verdict resolves the **whole Subject** (concept hard-rule), so approving releases all its staged operations; `request-changes`/`edit` hold them. The Subject must carry the **staged-operation spec** (tool, op, params, idempotency, undo) — which the action canvas already renders.

**Settled?** Partly — concept: "Verdict … emits an Event Bus event"; IA: action artifacts show "what the action will do … and how to undo." **New/needs `/architecture`:** the **dispatch-on-approve** mechanism (verdict event → harness executes the staged op via the tool) and where the staged-operation spec lives. This is the most important new piece and the heart of "review → act."

---

## What's settled vs. open (re: `/concept`)
- **Settled (concept/IA/code):** kind→canvas selection; the Review-surface composition *structure* + flow-of-understanding; verdict resolves the Subject + emits an event.
- **New / not yet locked:** (a) the **3-tier canvas resolution** incl. per-tool + MCP-Apps + community templates; (b) the **dispatch-on-approve execution loop** (verdict → harness executes staged ops via tools); (c) the **composition/journey** was deferred to `/design` and is now ready to design.

## Proposed next steps
1. **Design the composition** (the entire review experience): the frame + the N building blocks (Subject) + conversation + verdict, as ONE surface — the journey we deferred, under the navbar+2-sections budget. Lead candidate shape: the "briefing" (outcome lead → relevance-ordered collapsible artifact stack → verdict), now that the blocks are rich. *(a `/design` on the composition.)*
2. **Lock the execution loop** (verdict → dispatch staged op via tool) + the 3-tier canvas resolution — a short **concept/architecture extension** (these post-date the locked concept).
3. Then `/architecture` for the staged-operation spec + the renderer-selection + the dispatch wiring.
