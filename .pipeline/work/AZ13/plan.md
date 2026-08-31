# AZ13 — Sidebar navigation is one system

## What we need

The sidebar had to become one navigation system, readable everywhere, with the primary
destinations reachable from anywhere in the app.

Before this, beneath the three primary destinations sat a second, unlabelled list of recent
objects truncated to about fourteen characters — "Write the four-em…", "Decision: client-si…" —
with no tooltip and an order that disagreed with the main list it duplicated, and disagreed
again on a third page. Opening settings replaced the primary navigation entirely, leaving a
single unlabelled icon as the only way back. A user's map of the application changed depending
on where they were standing. Documentation also still described a brand mark the shipped
sidebar did not render.

What was wanted was a stable shell: most of the sidebar reserved for a domain-owned dynamic
navigator, the four context switches reachable from every state, and settings no longer able to
replace navigation. One navigation system, each region with a stated purpose; primary
destinations reachable even while settings is open; any shortened label exposing its full text
to pointer and assistive technology; provisional navigator rows keeping their current source
order; the shipped sidebar and its documentation agreeing.

The boundary was deliberately narrow. Page content, the contents of the Notifications,
Conversations, Work and Knowledge navigators, retiring their existing list pages, team-scope
placement, and any real merger of Search with Assistant beyond a shared visual entry group were
all excluded and assigned to follow-up packages. Whatever was decided had to hold at every
viewport, including the phone drawer, which presents the same navigation.

## How it works

The sidebar is one continuous surface with four stable regions:

1. **Header** — HyperIdle identity with Search and Assistant visually grouped but still
   separately operable.
2. **Context switches** — Notifications, Conversations, Work and Knowledge. Desktop shows
   labelled rows; the phone drawer shows the same four destinations as an icon strip with
   complete accessible names.
3. **Dynamic navigator** — the flexing, scrollable remainder. It shows the selected domain's
   provisional rows until that domain's follow-up defines its final list or tree, controls,
   status and canonical ordering.
4. **Footer** — an icon-only Settings utility. Settings changes Main without replacing the
   selected domain or its navigator.

Desktop uses a fixed 276px sidebar. At 768px and below the sidebar hides behind Menu and opens
as a 300px modal drawer. The icon-strip structure changes only above 768px; 44px interactive
targets remain through 1024px and compact only above that width — the structural breakpoint and
the touch-target boundary are deliberately separate. Mobile detail routes keep both Back and
Menu available. The drawer is portalled beside `#root` with its scrim immediately below the
drawer layer, so inert page content cannot disable the drawer itself.

The desktop sidebar is unboxed: its root is transparent so navigation sits directly on the shell
background rather than inside a second white card. The mobile drawer keeps an opaque overlay
surface because it must separate navigation from the scrimmed page behind it.

Long navigator labels may use a visual ellipsis, but each row exposes its complete label through
its accessible name and its native pointer title. The change adds no new data contract,
grouping, filter, sorting, hierarchy or team-scope fiction, and existing list pages remain until
a domain follow-up proves equivalent access.

## How we work on this

The work is complete. The focused surface passes 89 tests across nine files, and `npm run
verify` passes through typecheck, lint and governance, Knip, dependency and generated-inventory
checks, the web build and the desktop build.

Accepted limitations and deferrals:

- Provisional navigator rows keep source order only. Canonical cross-surface ordering is owned
  by each domain follow-up, and no existing list page may be retired before that follow-up
  proves equivalent access.
- The `SettingsOrgChart` fixture error caught by `ErrorBoundary` is pre-existing test noise, not
  a consequence of this change.

Registered follow-ups, each owning its own responsive behavior:

- **AZ17 — Notifications navigator:** structure, sorting/filtering/grouping, and popover/list
  retirement proof.
- **AZ18 — Conversations navigator:** complete conversation switching, canonical order and
  controls, list-page retirement proof.
- **AZ19 — Work navigator:** team scope, truthful work status, object structure and controls,
  list-surface retirement proof.
- **AZ20 — Knowledge navigator:** scalable tree/list data contract, scope, order and controls,
  list-surface retirement proof.
- **AZ21 — Search and Assistant entry surface:** the future combined entry experience, without
  conflating the two capabilities in this shell change.
