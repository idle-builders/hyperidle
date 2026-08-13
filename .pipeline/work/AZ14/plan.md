# AZ14 — One rule for opening and editing an object

## Work package

**Outcome.** A user can predict what a click will do to their context — take over the page, open a pane beside what they were reading, or float above it — and knows how to start editing anything, because both follow one stated rule.

**Why this matters.** Today the grouping is arbitrary. Opening a routine or an agent splits the screen; opening a bet, task, knowledge item, thread or artifact takes the whole page; notifications, the assistant and search float above it. Nothing about those objects explains the split, so every click is a small gamble with the user's place. Editing is split the same way: a bet's pitch is a live editor that is always editable in place, while a knowledge item is read-only behind an Edit button — the same prose primitive with two different mental models. Users learn an interface by forming rules; an interface with no rule cannot be learned, only memorised.

**What exists today.** A split-pane surface exists and is used for two object kinds. Full-page routes exist for everything else. Three overlay surfaces exist with differing dismissal and scrim behaviour. Prose editing is a live inline editor on one surface and a mode switch on another.

**Missing delta.** A decided rule mapping object kind and user intent to presentation, and a decided editing model, both applied consistently.

**Depends on.** None.

**Complexity.** M

**Engineering tier.** mvp

**Pre-build.** **Folded into the combined refine + design + architecture round.** What earns a split pane rather than a page, what earns an overlay, and whether prose edits inline or through a mode are product decisions with no existing approved pattern to follow. They are made in that one artifact and approved before any code.

**Execution procedure (human-approved).** Skip the pipeline's standard phase set. One agent runs a single **combined refine + design + architecture round** — sharpening the requirement, deciding the user-facing shape, and producing the technical plan as one artifact — and stops there. The founder reviews and approves that one artifact before any code is written. The same agent then builds in a single session — tests, then code. When it is done, one fresh agent reviews it, one round only. No separate refinement, design, critique or architecture phases, and no further human gate after the approval. Founder decision, 2026-08-11: this is the approved procedure for this work package and the orchestrator does not add phases to it.

**Constraints.** Whatever is decided must hold at every viewport — a split pane has to degrade to something coherent on a phone.

**Out of scope.** The individual overlay defects (missing composer, clipping, scrim extent) — those are bug-list work; this decides the pattern they should conform to.

## Acceptance criteria

- A written rule states which presentation each object kind and intent uses, and why.
- Every object in the product is opened according to that rule.
- A single editing model applies to prose wherever it is editable.
- Opening something never silently discards what the user was reading without a way back to it.
- The rule holds at every supported viewport, including where a split pane cannot fit.

## Validation scenarios

- Given two objects the rule treats alike, when the user opens each, then both present the same way.
- Given a prose field on two different surfaces, when the user starts editing each, then the interaction is the same.
- Given a split presentation at a phone viewport, when the user opens it, then it degrades to the decided fallback rather than a squeezed pane.

## Approved decision

Founder approved the combined refinement, design, and architecture decision on 2026-08-12:

> Rows take you there. Context actions open beside you. Tools float above you.

The code-level closed rule is `navigate -> page`, `inspect -> pane`, and `act -> overlay` for every product object. Object kind makes the mapping exhaustive; it does not create exceptions. On a phone (`<=768px`), an Inspect pane presents only its full-width destination while the still-mounted origin remains available through **Back to {origin}**.

Existing durable document prose rests rendered. **Edit** enters the existing in-place editor, saves continue through the existing autosave hooks, and **Done** returns to reading only after the latest draft is acknowledged. A failed save or version conflict keeps the draft and editor visible. Creation canvases remain immediately editable. Multi-field configuration and transaction forms retain atomic Save/Cancel behavior, but existing content exposes an explicit Edit or Customize entry.

### Closed intent map

| Product object | Navigate | Inspect | Act |
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

Blocks and messages remain parts of their owning object, not new object kinds. A block Inspect opens its host at the encoded block anchor. Missing destinations stay no-op/unavailable; the implementation does not fabricate routes.

## As-built behavior and architecture

- `object-presentation.ts` owns the total ten-object kind and three-intent resolver. It is intentionally a small presentation contract, not a parallel router.
- `createOpenHandler` binds contextual host, artifact, resolved-review, and session references to the page-owned Inspect placement. Structural **Open review** remains normal navigation.
- Conversations owns one shared `SplitView` and keeps its conversation origin mounted while rendering existing artifact, knowledge, review, or session bodies through narrow override props. Dial-in and recursive session references use the same placement.
- Generic routine rows navigate to `/work/routine/:routineId`. The existing explicit routine and agent contextual editors still use panes.
- `SplitView` supports compact destination-only presentation and a labelled normal-flow return control. Desktop keeps its draggable divider, now exposed as a keyboard-operable ARIA separator with a 20-80 range.
- Every shipped Inspect consumer passes compact behavior: Conversations, review artifact examination, team routine/agent panes, and Settings agent, behavior, and backend panes.
- Mobile header Back is temporal when an in-app history entry exists; direct links retain a labelled structural Up fallback. `AppShell` records page scroll and focused-row identity by React Router location key and restores them on temporal traversal.
- WorkBet and Knowledge use rendered read state, explicit Edit, acknowledged-save Done, and draft retention on failure/conflict. Routine, Settings Agents, and Agent Behavior use explicit read/Edit and Save/Cancel snapshot semantics.
- The confirmed-unreachable TaskSheet component, story, tests, thread shim, and TaskSheet-only URL utility were removed. Task rows continue to use their canonical page.
- The generated design migration backlog was refreshed after those causal deletions and line shifts. The development-file census floor tightened from 1,062 to 1,205 using the repository-prescribed floor command; no classifier was weakened.
- Authoritative user, navigation, usability, component, and opening-contract docs now describe the same Navigate/Inspect/Act and Back/Up rules.

No endpoint, schema, data shape, credential, permission surface, rich editor, visual container, object route, global pane registry, pane URL scheme, shared save controller, or history service was added.

## Review closure and simplification

The single permitted fresh review initially found seven blockers: contextual Inspect still navigated, Done could outrun saves, configuration prose opened live, SPA pushes left mobile Back stale, compact behavior was incomplete and overlapped controls, required real-route evidence was missing, and authoritative docs remained false. The same builder closed all seven under the approved one-review procedure. Final review state is **DONE** for all five acceptance criteria with no blocker left.

The founder-requested fresh simplification challenge rejected a projected 600-850-line correction. It constrained closure to existing seams: one Conversations-owned split, local save/edit gates, one shell-local location-key map, compact wiring, and extensions to existing journey suites. It explicitly rejected per-object pane components, a global object router or pane registry, a pane URL scheme, a shared prose/save framework, and a history service. The final code diff contains 537 production/tooling additions and 436 test/E2E additions (973 total additions) while deleting 2,254 code lines.

## Verification evidence

- Red phase: 24 intended focused failures covered Inspect placement, save barriers, explicit configuration editing, compact return layout, and SPA history-key refresh before implementation.
- Focused unit/component closure: nine affected suites passed 95 tests; the final autosave simplification slice passed four files and 44 tests.
- Full affected tests: `npm run test` passed 239 files and 2,475 tests.
- Real-route Playwright matrix: 15/15 passed across routine temporal Back/scroll/focus, inline artifact and session Inspect, compact fold-back, bet and Knowledge save barriers, and search/notification navigation.
- Painted evidence: ten real-route captures at 1440x900, 1024x768, and 375x812 covered session Inspect, bet read state, Knowledge read state, and compact artifact Inspect. Inspection exposed a crushed phone Knowledge metadata column; it was changed to stack, recaptured, and reinspected. Compact destination controls no longer overlap and no horizontal overflow remained.
- `npm run verify` passed all 55 package typechecks, formatting and lint/governance gates, Knip, production Knip, dependency and mock inventories, generated-design backlog check, Core UI build, and desktop bundle validation.
- `git diff --check` passed. A byte-aware identifier scan outside `.pipeline/**` is empty after ship hygiene.

The generated screenshots and phase-specific review files were removed during ship consolidation after their durable observations and limits were recorded here. The retained real-route journeys reproduce the painted states.

## Durable learnings

- Nesting routed Inspect destinations under the conversation route failed in the real browser. One persistent Conversations split that reuses existing page bodies through narrow ID/hash overrides was smaller and correct.
- Green unit tests and repository verification did not prove consuming paths. The fresh review caught seven cross-surface failures, and the real-route matrix was necessary closure evidence.
- Painted inspection added unique evidence: the compact Knowledge metadata layout was technically responsive but visually unreadable until stacked.
- A generated cross-work-package inventory can change mechanically when causal source lines or deleted files change. Refresh it with its generator and audit predicates and unrelated entries, not only the resulting checksum.
- Text search can skip a source file containing a deliberate control byte in a regex. Identifier hygiene uses `rg -a` so binary classification cannot hide a leak.

## Known limits and deferrals

- Pane state has no universal deep-link scheme. Existing URL-addressable selections remain so; other Inspect state lives in the mounted origin and current history.
- No canonical session route was invented. Sessions remain contextual Inspect destinations.
- Missing task-host context, message permalinks, and user/factory destinations remain documented no-op cases.
- Overlay composer, clipping, scrim, and dismissal defects remain separate bug-list work.
- Sent-message editing, artifact/task/review content editing, schema/API/save-concurrency changes, and page-geometry or token redesign remain out of scope.
- Global-search pointer interaction remains constrained by the current focus-trap/body interaction in Playwright; the accessible result button dispatch path proves the application callback, utility close, navigation, and exact temporal Back without expanding this package into overlay repair.
