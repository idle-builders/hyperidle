# AZ14 — One rule for opening and editing an object

## Work package

**Outcome.** A user can predict what a click will do to their context — take over the page, open a pane beside what they were reading, or float above it — and knows how to start editing anything, because both follow one stated rule.

**Why this matters.** The grouping was arbitrary. Opening a routine or an agent split the screen; a bet, task, knowledge item, thread or artifact took the whole page; notifications, the assistant and search floated above it. Nothing about those objects explained the split, so every click was a small gamble with the user's place. Editing split the same way: a bet's pitch was a live always-editable editor while a knowledge item was read-only behind an Edit button — the same prose primitive with two mental models. Users learn an interface by forming rules; an interface with no rule cannot be learned, only memorised.

**Complexity.** M · **Engineering tier.** mvp · **Depends on.** None.

**Execution procedure (founder decision, 2026-08-11).** One agent runs a single combined refine + design + architecture round and stops; the founder approves that artifact before any code; the same agent builds in one session; one fresh agent reviews, one round only. The orchestrator does not add phases.

**Constraints.** Whatever is decided must hold at every viewport — a split pane has to degrade to something coherent on a phone.

**Out of scope.** The individual overlay defects (missing composer, clipping, scrim extent) — bug-list work; this decides the pattern they should conform to.

**Acceptance.** A written rule states which presentation each object kind and intent uses, and why;
every object is opened according to it at every supported viewport; one editing model applies to prose
wherever it is editable; opening something never silently discards what the user was reading.

## The rule (founder approved, 2026-08-12)

> Rows take you there. Context actions open beside you. Tools float above you.

Closed at code level as `navigate → page`, `inspect → pane`, `act → overlay`, for every product
object. **Object kind makes the mapping exhaustive; it does not create exceptions.** On a phone
(`≤768px`) an Inspect pane presents only its full-width destination while the still-mounted origin
stays reachable through **Back to {origin}**.

Durable document prose rests rendered. **Edit** enters the existing in-place editor, saves go through
the existing autosave hooks, and **Done** returns to reading only after the latest draft is
acknowledged; a failed save or version conflict keeps the draft and the editor visible. Creation
canvases stay immediately editable. Multi-field configuration and transaction forms keep atomic
Save/Cancel, but existing content exposes an explicit Edit or Customize entry.

| Object | Navigate | Inspect | Act |
| --- | --- | --- | --- |
| Team | canonical page | named contextual preview only | compact create/confirm only |
| Bet | canonical page | explicit inline reference/examine | lifecycle confirmation only |
| Task | canonical page | named contextual inspect only | bounded request action only |
| Routine | canonical page | explicit edit/inspect | create dialog |
| Agent | canonical page | Customize/Edit | add-agent dialog |
| Thread | canonical page | contextual embedded discussion only | recipient/new-thread action |
| Knowledge item | canonical page | inline reference or block host | in-context capture |
| Artifact | canonical page from lists | inline reference or Examine | no object-detail overlay |
| Review | canonical page from Open | contextual Inspect | verdict action only |
| Session | no route invented | pane, with phone fallback | composer action only |

Blocks and messages remain parts of their owning object, not new object kinds — a block Inspect opens
its host at the encoded block anchor. Missing destinations stay no-op; the implementation does not
fabricate routes.

## As built

- `object-presentation.ts` owns the total ten-object × three-intent resolver. It is a small
  presentation contract, deliberately **not** a parallel router.
- `createOpenHandler` binds contextual host, artifact, resolved-review and session references to the
  page-owned Inspect placement. Structural **Open review** stays normal navigation.
- Conversations owns **one** shared `SplitView`, keeping its conversation origin mounted while
  rendering existing artifact / knowledge / review / session bodies through narrow override props.
  Dial-in and recursive session references use the same placement.
- `SplitView` gained compact destination-only presentation and a labelled normal-flow return control;
  the desktop divider is now a keyboard-operable ARIA separator with a 20–80 range.
- Mobile header Back is temporal when an in-app history entry exists; direct links get a labelled
  structural Up fallback. `AppShell` records page scroll and focused-row identity by React Router
  location key and restores them on temporal traversal.
- The confirmed-unreachable TaskSheet component, story, tests, thread shim and TaskSheet-only URL
  utility were removed. Net diff: 973 additions against 2,254 deletions.

Nothing was added: no endpoint, schema, credential or permission surface, no rich editor, no object
route, no global pane registry, no pane URL scheme, no shared save controller, no history service. A
simplification challenge rejected a projected 600–850-line correction and constrained closure to those
existing seams, explicitly refusing per-object pane components, a global object router, a pane URL
scheme, a shared prose/save framework and a history service.

## Durable learnings

- **Nesting routed Inspect destinations under the conversation route failed in the real browser.** One
  persistent Conversations split reusing existing page bodies through narrow ID/hash overrides was
  both smaller and correct.
- Green unit tests and repository verification did not prove consuming paths; a real-route Playwright
  matrix was the necessary closure evidence.
- Painted inspection added evidence nothing else did: the compact Knowledge metadata layout was
  technically responsive and unreadable until stacked.
- A generated cross-package inventory changes mechanically when causal source lines move or files are
  deleted. Refresh it with its generator and audit the predicates, not just the checksum.
- Text search can skip a source file containing a deliberate control byte in a regex. Identifier
  hygiene uses `rg -a` so binary classification cannot hide a leak.

## Known limits

- Pane state has no universal deep-link scheme. Existing URL-addressable selections stay so; other
  Inspect state lives in the mounted origin and current history.
- No canonical session route was invented — sessions remain contextual Inspect destinations.
- Missing task-host context, message permalinks and user/factory destinations are documented no-ops.
- Overlay composer, clipping, scrim and dismissal defects remain bug-list work. Sent-message editing,
  artifact/task/review content editing, and save-concurrency changes remain out of scope.
- Global-search pointer interaction is constrained by the current focus-trap/body interaction in
  Playwright; the accessible result-button dispatch path proves the callback, close, navigation and
  temporal Back without expanding this package into overlay repair.
