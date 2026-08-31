# AZ11-O — Page orientation and document outline

**Outcome.** Every primary page tells the user where they are and presents one coherent document
outline: the breadcrumb names the real current page, the page header comes first, and nested
authored content cannot become a second page title. These defects are independent of page width, so
they had to be fixed before geometry could align every page to its header (AZ11-G). Depends on AZ2's
`PageScaffold`. **Out of scope:** page-column width and alignment, pane ratios, Block layout,
sidebar composition, routes, APIs, data states, fabricated ancestry.

**Provenance.** The AZ11 corrective decision sheet this was meant to implement exists in no retained
file, ref, worktree or stash; there were no failed-run hunks to retain either. The breadcrumb table
below was reconstructed from AZ11-O's constraints and route truth, and the founder's 2026-08-13
approval *is* its authority.

**Definitions.** A **primary surface** is one route document; a split destination does not become
another. The **first page region** is the first rendered child inside its `PageScaffold` — the route
`PageHeader`, with nothing before it. The **current breadcrumb segment** is the last segment *by
position*, never "whichever has no `to`". **Real ancestry** is a route or loaded parent that exists;
a non-link intermediate is fine when the object exists but no route can be formed, a guessed URL
never. A **normalized title** is equality under block-derivation's `slug()`, which deliberately
treats case, spacing and punctuation-only differences as one identity — the `<empty>` sentinel alone
never makes two all-stripped strings equal.

**Header and breadcrumb.** Header order is `breadcrumb row → title/actions row → optional subtitle`.
The breadcrumb is one non-wrapping flex row with `min-width: 0` and clipped overflow — never a
second header line, no absolute positioning. Root, separators and history controls are shrink-proof;
intermediates shrink to zero and ellipsize under the existing 120px ceiling; **the final current
segment takes the remaining width, keeps `min-width: 6ch` and its prefix, and ellipsizes at its
end**. Keeping the breadcrumb row separate from the title/action row — actions shrink-proof, title
`min-w-0 truncate` — prevents collisions without touching page-column geometry.

`Breadcrumb`'s semantics depend only on index: for `index < last`, a link when `to` exists,
otherwise plain text, never `aria-current`; for `index === last`, always plain text with
`aria-current="page"` **even if a caller supplies `to`**. **Callsites own labels and ancestry — no
shared route-inference helper was added, because loaded data differs per page and a helper invites
fabricated ancestry.**

Square brackets are loaded text; "plain" is a real object with no link available from current data.
Every other primary page has no breadcrumb — its PageHeader title alone gives orientation.

| Surface | Segment array | Why |
|---|---|---|
| Work Team | `Work(/work) / [team.name]` | Both already present. |
| Work Bet, Work Task | `Work / [team](plain) / [bet.title](/work/bet/:betId, on Task) / [task.title]` | `BetDetail` has the team name but no trustworthy id, so its fake `/work` team link was dropped; the bet URL is real, no team URL can be formed from task data. |
| Work Routine | `Work / [teamName](plain, omitted when absent) / [routine.name]` | No team id is returned here. |
| New Bet, New Knowledge | `Work / New bet`, `Knowledge / New knowledge` | Replace the hand-rolled breadcrumb and ambiguous `New`. |
| Knowledge item | `Knowledge / [scopeName](plain, optional) / [topic](plain, optional) / [item.title]` | Appends the missing current page; classifications stay non-links. |
| Conversation detail | `Conversations(/conversations) / [threadTitle]` | The queue itself needs no breadcrumb. |
| Agent | `Work / [teamName](/work/team/:teamId) / [agent.name]`, or `Conversations / [agent.name]` | No Agents index route exists, so a team-less agent falls back to Conversations. |
| Review | `Work / [betTitle](…) / [taskTitle](…, omitted when absent) / [subject.title]` | All ids exist on `ComposedReviewSubject`; optional ancestry is omitted, not fabricated. |
| Artifact | `Work / [producingTaskTitle](plain) / [artifactDisplayTitle]` | `Artifact` lacks `betId`, so its task route cannot be formed; the intermediate is omitted when normalized titles match. |

**Document outline.** `PageHeader` keeps its default H1 and is the **sole route-document H1** in
loading, error, empty, missing and populated states alike — no second page-header primitive, no
fallback header component. Loading headers use a real accessible fallback noun with skeleton paint
kept separate: **an H1 made only of skeleton `<div>`s is not acceptable evidence.** Managed
destination titles — Agent and Routine detail, the Review examine pane, conversation and session
inspectors — are H2. `Setup` is the H1 of `/setup`, `Page not found` the H1 of `*`.

Authored Blocks receive a narrow optional context — `{ documentTitle, blockIndex, levelOffset: 1 }`
— threaded through `renderPayload` to `HeadingPayload`. Non-heading payloads ignore it; effective
level is `min(6, payload.level + levelOffset)`; output is suppressed **only** when `blockIndex ===
0`, the payload is a heading, and its normalized text equals the normalized document title, so a
later matching heading survives. Suppression removes the heading payload and nothing else — the
outer `article[data-block-id]`, its id, anchor target, handle and action wiring, assistant
attachment, anchored messages and discussion all remain — and non-page Block consumers keep current
behaviour because the context defaults to absent. One heading-identity helper re-exports the
existing `slug()` for Block and the two embedded-Review headings: **no second normalization.**

**The evidence boundary — why AZ11 failed the first time.** **No omnibus "all pages comply" lint
rule exists; adding one was the failed AZ11 proof error.** Typecheck and lint stay syntax gates, and
an explicit runtime branch ledger over all 17 route documents owns branch coverage while making no
pixel claims. Static syntax may prove the listed arrays are present and no production H1 sits
outside PageHeader — never that a branch renders, nor H1 counts, truncation or overlap. Runtime
evidence may prove a rendered state begins with PageHeader, has one H1 and one current crumb, and
that heading tags, suppression and Block identity survive — never width allocation. Painted geometry
may prove prefix visibility, ellipsis and non-intersecting rectangles at 1440/1024/390 — never
unvisited branches, nor source enforcement.

## As built

The procedure allowed **one** fresh review. It returned NOT-DONE with five blockers; the same
builder repaired all five red-first, a second review was forbidden, and the founder approved
shipping the repaired result — a human-authorized exception to the normal "last verdict must be
DONE" precondition. Three repairs are constraints, not history:

- **Semantic tag and visual class are separate.** Demoting a source H1 to H2 painted it at 20px
  instead of 24px; the semantic tag now uses the effective level, the visual class the authored one.
- **PageHeader first does not mean the body stops scrolling.** Making PageHeader the first region
  left Setup's submit control unreachable, because no scrolling page body owned it.
- **Suppress the repeated title, not the header.** `ArtifactPreview` first removed kind, label,
  producing task, timestamp and id along with the duplicate title; it now drops only that title.

The other two were missing evidence rather than defects. The final diff was **919 changed lines
against a 920 ceiling** agreed before the build, the rule being that reaching it meant returning to
the founder gate rather than adding an omnibus abstraction or a page registry.

**Accepted limitation.** Task-body summary geometry at mobile width pre-existed this package and was
deliberately preserved: page-column and body geometry belong to AZ11-G, and this package owns
orientation, breadcrumb identity and outline only.
