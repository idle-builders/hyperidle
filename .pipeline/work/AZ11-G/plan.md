# AZ11-G — Stable frame plus lane

Implemented; the one fresh implementation review is complete and its findings repaired. This is the
combined requirements/design/architecture/as-built record the founder procedure requires. Its approved
rule **replaces** the earlier "all visible content shares one left edge" proposal.

## Outcome

One stable page frame, without forcing every kind of content into the same shape. Normal routed pages
keep their title in one centered frame — 1120px maximum including 24px desktop gutters — and the body
then uses the lane that fits its job. Split panes stop using page geometry entirely: each pane gets a
local header and local inset, and in split mode the shell hands its main area directly to two sibling
pane surfaces with no outer card, inner canvas or visible divider. Routes, text, data, actions, split
ratios and scroll behaviour are unchanged.

**Why.** The old requirement confused consistency with identical alignment. Lists, prose, editors and
panes have different spatial needs. The shared rule belongs at the page level; content measure belongs
to the job.

**Terms.** A *stable frame* owns page identity and title position; a *content lane* is the body area
chosen for the current job; a *local pane* is one side of a split view — not another page, and it does
not contain the stable frame. Empty, loading and error states inherit their host, and are not new
layout types.

## The rule — Option C, founder-selected 2026-08-14

Chosen after reviewing full-size, one-screen-at-a-time comparisons.

| Job | Header | Body |
| --- | --- | --- |
| Scan | Stable frame | Left-aligned lane, up to 800px |
| Read | Stable frame | Centered readable lane, up to 760px |
| Workbench | Stable frame | Left-aligned working area, usually 800–960px; optional rail |
| Focus | Stable frame when routed | Centered form lane, up to 680px |
| Inspect | Local pane header | Local 18px inset; no page frame, no centered page lane |
| Layer | Not a page | Existing dialog, overlay, search or picker size |

On compact layouts lanes fill the available width using the existing compact gutters. Recipient picker,
Assistant, Notifications, Search and dialogs are layers, not primary pages, and are outside this
migration. Approved the same day as a follow-up: split layouts give the room to two surfaces directly.

### Rejected directions

- **A — one edge.** Good for lists, poor for reading and focused forms.
- **B — family frame.** Aligns each page internally but moves page identity between page types.
- **Universal body alignment** — the failed earlier requirement; it destroys useful reading and focus
  lanes.
- **A global `PageScaffold` default** — it reaches nested pane consumers and creates opt-out work.
- **Nested split cards** — rejected after screenshot review; the two panes replace the shell card
  rather than sitting inside it.

## How it is built

Three small primitives plus explicit per-route use. No registry, no second layout system.

1. `PageFrame` (design system) owns only the 1120px maximum and the 24px gutters.
2. `PageHeader` takes `presentation="page" | "pane"`. `page` is the default: content in `PageFrame`
   with H1. `pane` uses the local 18px inset and H2, with no `PageFrame`.
3. `PageScaffold` takes `frame="page" | "local"`, defaulting to **`local`**. Routed scroll pages opt
   into `page`, wrapping only the scroll body; managed and nested pane scaffolds stay local. The
   default is `local` deliberately — a `page` default would reach every nested consumer.
4. Existing body wrappers keep their useful maximum widths: `mx-auto` comes off Scan and Workbench,
   centering stays for Read and Focus, and the duplicate outer 24px padding now owned by `PageFrame`
   is removed.
5. Pane presentation is passed only through the three real managed paths — Conversations, WorkTeam,
   Review — which adapt their embedded Artifact, Knowledge, Routine, Agent and Review content locally.
   When Conversations or WorkTeam opens a split it suppresses its outer page header and renders the
   same identity and actions in the origin pane header. Standalone Routine suppresses its local pane
   header and keeps its page H1.
6. `SplitView` keeps its ratios, invisible gap resizing, compact destination-only behaviour, API and
   state. In desktop split mode only, the shell's single-surface chrome becomes transparent and the
   two pane surfaces fill that space directly.
7. Settings' 680px Focus lane is limited to simple form sections; its split tools use Workbench width
   and local panes.

Load-bearing: `framework/design-system/src/{PageFrame,PageHeader,PageScaffold}.tsx`, the routed pages
under `layers/core-ui/src/pages/`, `ThreadSections.tsx`, `ConversationSurface.tsx`,
`review/ReviewComposition.tsx`, `work/{RoutineDetailPane,AgentDetailPane}.tsx`, `SettingsPage.tsx`.
Documented in `docs/ui-design/page-anatomy.md`.

**Feasibility note worth keeping:** the code graph does not index React component *uses*, so its negative result had to be re-checked with source search. Do not trust a graph miss here.

## Acceptance criteria

1. All 17 audited primary surfaces use the stable frame in normal routed states, except outside-shell
   Focus surfaces, which keep their named treatment.
2. Scan, Read, Workbench and Focus bodies follow their lane rule without changing their useful maximum
   measure.
3. Conversations, WorkTeam and Review split states show two local panes — no outer page header, no
   centered page lane inside either pane, H2 pane titles.
4. Content, actions, routes, split ratios, compact behaviour, Block internals and scroll reachability
   are unchanged.
5. Painted checks prove **visible content**, never aligned wrapper proxies. Inspect one full-size
   screenshot per family; scaled multi-screen contact sheets do not count as evidence.

## Boundaries

No new routing, data, state, responsive system, SplitView mode, layout registry, container query, or
global default migration. Layout-only: no input, persistence, endpoint, credential, path handling or
outbound request. The existing AZ2 scroll suite stays unchanged.
