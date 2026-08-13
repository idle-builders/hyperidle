# AZ13 — Sidebar navigation is one system

## Work package

**Outcome.** The sidebar presents one navigation system whose items are readable, and the primary destinations stay reachable from anywhere in the app.

**Why this matters.** Beneath the three primary destinations sits a second, unlabelled list of recent objects truncated to about fourteen characters — "Write the four-em…", "Decision: client-si…" — with no tooltip and an order that disagrees with the main list it duplicates, and disagrees again on a third page. Meanwhile, opening settings replaces the primary navigation entirely, leaving a single unlabelled icon as the only way back to the rest of the product. A user's map of the application changes depending on where they are standing.

**What exists today.** The sidebar hosts primary navigation, a secondary recent-objects list and a settings mode that takes over the whole region. The secondary list has no heading, no full-text affordance and no stated ordering rule. Documentation still describes a brand mark in this region that the shipped sidebar does not render — two sources of truth that disagree.

**Missing delta.** A stable shell that reserves most of the sidebar for a domain-owned dynamic navigator, keeps the four context switches reachable, and does not let settings replace the navigation. Each domain's final navigator model is deliberately assigned to a follow-up work package.

**Depends on.** None.

**Complexity.** M

**Engineering tier.** mvp

**Pre-build.** **Folded into the combined refine + design + architecture round.** The founder approved the domain-switcher plus dynamic-navigator direction on 2026-08-13 before production code was written.

**Execution procedure (human-approved).** Skip the pipeline's standard phase set. One agent runs a single **combined refine + design + architecture round** — sharpening the requirement, deciding the user-facing shape, and producing the technical plan as one artifact — and stops there. The founder reviews and approves that one artifact before any code is written. The same agent then builds in a single session — tests, then code. When it is done, one fresh agent reviews it, one round only. No separate refinement, design, critique or architecture phases, and no further human gate after the approval. Founder decision, 2026-08-11: this is the approved procedure for this work package and the orchestrator does not add phases to it.

**Constraints.** Whatever is decided must hold at every viewport, including the phone drawer, which presents the same navigation.

**Out of scope.** Page content; redesigning the Notifications, Conversations, Work or Knowledge navigator contents; retiring their existing list pages before parity is proven; team-scope placement; and combining Search with Assistant beyond their shared visual entry group. Those decisions are owned by AZ17–AZ21.

## Acceptance criteria

- The sidebar presents one navigation system with a stated purpose for each region it contains.
- Primary destinations are reachable from every application state, including while settings is open.
- Any list item whose label is shortened exposes its full text to both pointer and assistive technology.
- Provisional navigator rows preserve their current source order; each registered domain follow-up owns canonical cross-surface ordering before an existing list page can be retired.
- The shipped sidebar and the documentation describing it agree.
- Follow-up work packages are registered for the four domain navigators and the Search/Assistant entry surface.

## Validation scenarios

- Given settings is open, when the user wants to return to conversations, then a labelled primary destination is visible without discovering an unlabelled icon.
- Given a secondary list item whose label is shortened, when the user points at it, then the full label is available.
- Given a provisional dynamic navigator, when its domain follow-up is opened, then that package explicitly owns sorting, filtering, grouping, responsive behavior and the proof required before retiring the corresponding list page.
- Given the AZ13 pull request, when its track changes are reviewed, then separate registered packages exist for Notifications, Conversations, Work, Knowledge and Search/Assistant.

## Approved design and implementation contract

The sidebar is one continuous surface with four stable regions:

1. **Header:** HyperIdle identity with Search and Assistant visually grouped but still separately operable.
2. **Context switches:** Notifications, Conversations, Work and Knowledge. Desktop shows labelled rows; the phone drawer shows the same four destinations as an icon strip with complete accessible names.
3. **Dynamic navigator:** the flexing, scrollable remainder of the sidebar. It shows the selected domain's provisional rows until that domain's follow-up defines its final list/tree, controls, status and canonical ordering.
4. **Footer:** an icon-only Settings utility. Settings changes Main without replacing the selected domain or its navigator.

Desktop uses a fixed 276px sidebar. At 768px and below, the sidebar is hidden behind Menu and opens as a 300px modal drawer. The icon-strip structure changes only above 768px; 44px interactive targets remain through 1024px and compact only above that width. Mobile detail routes keep both Back and Menu available. The drawer is portalled beside `#root`, with its scrim immediately below the drawer layer, so inert page content cannot disable the drawer itself.

Long navigator labels may use visual ellipsis, but each row exposes its complete label through its accessible name and native pointer title. The implementation adds no new data contract, grouping, filter, sorting, hierarchy or team-scope fiction. Existing list pages remain until a domain follow-up proves equivalent access.

## Evidence and review resolution

The selected direction and implemented surface were inspected in the running application at desktop and phone sizes:

| Selected desktop concept | Selected phone concept | Implemented desktop | Implemented phone drawer |
|---|---|---|---|
| [1280×800](evidence/proposals-v4/desktop-conversations.png) | [390×844](evidence/proposals-v4/mobile-work-open.png) | [1280×800](evidence/implementation/desktop-conversations.png) | [390×844](evidence/implementation/mobile-conversations-open.png) |

Red-first tests initially failed for the missing product identity, Settings replacing the navigator, missing full-label disclosure and the absent Menu control on mobile detail routes. The focused final surface passes 89 tests across nine files, and `npm run verify` passes through typecheck, lint/governance, Knip, dependency and generated-inventory checks, the web build and the desktop build.

The single required fresh-agent review round returned `NOT DONE` with five blocking groups. All were resolved without a second review round, as required by the approved procedure:

- split the 768px structural breakpoint from the 1024px touch-target compaction boundary;
- replaced new off-grid spacing and unsupported font weight with binding Hearth values, leaving targeted design lint clean;
- removed newly introduced work-package IDs from product code, docs and test metadata;
- made responsive ownership explicit in every domain follow-up; and
- completed the full repository verification named above.

The reviewer also noted stale Settings-sidebar test prose; those tests now assert the icon-only selected Settings utility and stacked Main content instead. The existing `SettingsOrgChart` fixture error caught by `ErrorBoundary` remains pre-existing test noise and is not caused by this change.

## Registered follow-up boundary

- **AZ17 — Notifications navigator:** notification structure, sorting/filtering/grouping, responsive behavior and popover/list retirement proof.
- **AZ18 — Conversations navigator:** complete conversation switching, canonical order and controls, responsive behavior and list-page retirement proof.
- **AZ19 — Work navigator:** team scope, truthful work status, object structure and controls, responsive behavior and list-surface retirement proof.
- **AZ20 — Knowledge navigator:** scalable tree/list data contract, scope/order/controls, responsive behavior and list-surface retirement proof.
- **AZ21 — Search and Assistant entry surface:** the future combined entry experience without conflating the two capabilities in this shell change.
