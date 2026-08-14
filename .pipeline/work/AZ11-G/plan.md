# AZ11-G — Stable frame plus lane

Status: implemented; the one fresh implementation review is complete and its findings are repaired.

This is the durable combined requirements, design, architecture, and as-built record required by the founder procedure. Its approved rule replaces the earlier “all visible content shares one left edge” proposal.

## 1. Outcome

HyperIdle gets one stable page frame without forcing every kind of content into the same shape.

- Normal routed pages keep their title in one centered frame: maximum 1120px including 24px desktop gutters.
- Content then uses the lane that fits its job.
- Split panes stop using page geometry. Each pane uses a local header and local inset.
- In split mode, the shell gives its main area directly to two sibling pane surfaces. There is no outer main card, inner canvas, or visible divider.
- Existing routes, text, data, actions, split ratios, and scroll behavior stay unchanged.

Why: the old requirement confused consistency with identical alignment. Lists, prose, editors, and panes have different spatial needs. The shared rule belongs at the page level; content measure belongs to the job.

## 2. Terms

- **Stable frame** — the outer page area that owns page identity and title position.
- **Content lane** — the narrower or wider body area chosen for the current job.
- **Local pane** — one side of a split view. It is not another page and does not contain the stable frame.

Empty, loading, and error states inherit their host page or pane. They are not new layout types.

## 3. Approved visual rule

Founder selected **Option C — stable frame plus lane** on 2026-08-14 after reviewing full-size, one-screen-at-a-time comparisons.

| Job | Header | Body |
| --- | --- | --- |
| Scan | Stable frame | Left-aligned lane, up to 800px |
| Read | Stable frame | Centered readable lane, up to 760px |
| Workbench | Stable frame | Left-aligned working area, usually 800–960px; optional rail |
| Focus | Stable frame when routed | Centered form lane, up to 680px |
| Inspect | Local pane header | Local 18px inset; no page frame or centered page lane |
| Layer | Not a page | Existing dialog, overlay, search, or picker size |

On compact layouts, lanes fill the available width using existing compact gutters. This work does not redesign mobile navigation or split behavior.

## 4. Surface audit and fit

| Primary surface | Normal state | Split or special state |
| --- | --- | --- |
| Setup | Focus, outside app shell | Existing 520px card remains centered |
| Conversations queue | Scan | — |
| Conversation detail | Read | Origin and destination become local panes while split is open |
| Work overview | Scan | — |
| Work team | Workbench | Team and selected routine/agent become local panes |
| Work routine | Workbench | When embedded from team, it is a local pane |
| New bet | Workbench with rail | — |
| Bet | Workbench | — |
| Task | Workbench | — |
| Review | Workbench | Review and opened artifact become local panes |
| Agent | Workbench | Embedded agent is a local pane |
| Knowledge list | Scan | — |
| New knowledge | Workbench with rail | — |
| Knowledge detail | Workbench with rail | Embedded knowledge is a local pane |
| Artifact | Workbench | Embedded artifact is a local pane |
| Settings | Focus for simple forms | Agents and harness split tools use workbench width and local panes |
| Not found | Focus state | Outside-shell route keeps its existing treatment |

Recipient picker, Assistant, Notifications, Search, and dialogs are layers, not primary pages. They are out of this geometry migration.

## 5. Visible behavior

- Moving between normal pages no longer moves the page title unpredictably.
- Scan rows begin at the stable frame edge; they do not float in the middle of a wide page.
- Conversations and other long text stay centered and readable inside the stable frame.
- Editors, records, Blocks, and metadata rails retain useful working width and start from the stable frame edge.
- Opening an inspector turns both sides into local panes. Pane titles use H2, 17px/600, with 18px horizontal inset.
- Conversations and WorkTeam remove the outer page header while split is open; its identity and relevant actions move into the origin pane header.
- Standalone pages keep H1 titles. Embedded panes never show a second full page header.
- Standalone Routine uses its outer page H1 and does not repeat the pane title inside the body.
- Existing Block handle/discussion spacing remains internal to the Block shell.

## 6. Replacement acceptance criteria

1. All 17 audited primary surfaces use the stable frame in normal routed states, except outside-shell Focus surfaces which keep their named treatment.
2. Scan, Read, Workbench, and Focus bodies follow their lane rule without changing their useful maximum measure.
3. Conversations, WorkTeam, and Review split states show two local panes, no outer page header, no centered page lane inside either pane, and H2 pane titles.
4. Existing content, actions, routes, split ratios, compact destination-only behavior, Block internals, and scroll reachability remain unchanged.
5. Representative painted checks prove visible content rather than aligned wrapper proxies, and all required repository gates pass.

## 7. Technical shape

One builder, one session.

1. Add one small design-system `PageFrame` that owns only the 1120px maximum and 24px gutters.
2. `PageHeader` gets `presentation="page" | "pane"`:
   - `page` is the default and places its content in `PageFrame` with H1.
   - `pane` uses the local 18px inset and H2 treatment; no `PageFrame`.
3. `PageScaffold` gets an explicit `frame="page" | "local"`, defaulting to `local`:
   - routed scroll pages opt into `page`, wrapping only the scroll body in `PageFrame`;
   - managed and nested pane scaffolds stay `local`.
4. Existing body wrappers keep their useful maximum widths:
   - remove `mx-auto` from Scan and Workbench wrappers;
   - keep centering for Read and Focus wrappers;
   - remove duplicate outer 24px padding now owned by `PageFrame`.
5. Pass pane presentation only through the three real managed paths: Conversations, WorkTeam, and Review. Adapt their embedded Artifact, Knowledge, Routine, Agent, and Review content locally. When Conversations or WorkTeam opens a split, suppress its outer page header and render the same identity/actions in the origin pane header. Standalone Routine suppresses its local pane header.
6. Keep `SplitView` ratios, invisible gap resizing, compact destination-only behavior, APIs, and state. In desktop split mode only, the shell's single-surface chrome becomes transparent and the two pane surfaces fill that same space directly.
7. Limit Settings’ 680px Focus lane to simple form sections. Its existing split tools use Workbench width and local panes.
8. Update `docs/ui-design/page-anatomy.md` with the stable-frame, lane, and local-pane rule.

Load-bearing files:

- `framework/design-system/src/PageFrame.tsx`
- `framework/design-system/src/PageHeader.tsx`
- `framework/design-system/src/PageScaffold.tsx`
- normal routed pages under `layers/core-ui/src/pages/`
- `layers/core-ui/src/components/ThreadSections.tsx`
- `layers/core-ui/src/components/ConversationSurface.tsx`
- `layers/core-ui/src/pages/review/ReviewComposition.tsx`
- `layers/core-ui/src/pages/work/RoutineDetailPane.tsx`
- `layers/core-ui/src/pages/work/AgentDetailPane.tsx`
- `layers/core-ui/src/pages/SettingsPage.tsx`

Feasibility was confirmed from source: `PageScaffold` separates header, scroll body, and managed body; `PageHeader` owns title markup; managed consumers are explicit. The code graph does not index these React component uses, so its negative result was checked with source search. The final split-surface treatment needed only a transparent arranger, two sibling pane surfaces, and a shell rule that removes its single-surface chrome while split is active; no container query or new mode was needed.

## 8. Validation before code

Tests are written first.

Component evidence:

- `PageFrame` owns maximum width and gutters.
- `PageScaffold frame="page"` frames the scroll body; `frame="local"` and managed bodies do not.
- `PageHeader` renders page H1 versus pane H2 with the correct owning container.
- One representative component for each Scan, Read, Workbench, Focus, and Inspect rule.

Painted browser evidence:

- populated Work overview: Scan title is stable; rows start at the frame edge;
- populated Conversation: title is stable; visible message/composer lane is centered and no wider than 760px;
- Knowledge detail with a real Block and rail: workbench begins at the frame edge; Block internal offset is unchanged;
- WorkTeam with a routine open: both sides use local pane geometry; ratio and compact destination-only behavior stay unchanged;
- Settings simple form: title is stable; 680px form lane is centered;
- Review with an Artifact open: real embedded path uses local H2 pane presentation.

Use 1440px and 1024px for family geometry. Use one 390px pass for compact lane fill and split destination-only behavior. Keep the existing AZ2 scroll suite unchanged.

Final gates: `npm run check`, `npm run lint`, `npm run test`, focused E2E, then `npm run verify`. Inspect one full-size screenshot per family; never use scaled multi-screen contact sheets.

## 9. Boundaries and size

No new routing, data, state, responsive system, SplitView mode, layout registry, container query, or global default migration.

The final branch is larger than the early estimate because it covers all audited routes, embedded pane variants, painted evidence, and review repairs. The shared geometry itself remains three small primitives plus explicit route use; no registry or second layout system was added.

Security: layout-only change. It adds no input, persistence, endpoint, credential, path handling, or outbound request.

DOC-CLASS: update — `docs/ui-design/page-anatomy.md` currently lacks the stable-frame and content-lane rule.

## 10. Rejected directions

- **A — one edge:** good for lists, poor for reading and focused forms.
- **B — family frame:** aligns each page internally but moves page identity between page types.
- **Universal body alignment:** the failed earlier requirement; it destroys useful reading and focus lanes.
- **Global `PageScaffold` default:** affects nested pane consumers and creates opt-out work.
- **Nested split cards:** rejected after screenshot review; the two panes replace the shell card instead of sitting inside it.

## Approval effect

Founder approval of this artifact:

- amends the AZ11-G outcome and acceptance criteria to the rules above;
- authorizes one build session: tests, then code;
- authorizes one fresh implementation review after the build;
- adds no further human gate before that review.

Approval recorded: 2026-08-14. Founder selected Option C and said to continue.

Follow-up approved 2026-08-14: split layouts provide room for two surfaces directly—no enclosing card, inner canvas, or divider.

## Build evidence

- Component and affected tests: 2,050 passed.
- Painted browser checks: layout 4/4 and page orientation 5/5. The existing AZ2 scroll suite remains unchanged as approved.
- Full-size screenshots inspected for Scan, Read, Workbench, Focus, Inspect, and compact Inspect.
- `npm run check`, `npm run lint`, and `npm run verify`: passed.
- Fresh-review repairs preserve the original Conversation breadcrumb and host link, give Review's destination title a readable row, and add painted proof for that title.
