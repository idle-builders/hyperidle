# AF14 — Approved design (routine, 1 variant)

Input contract to `/architecture`. The visual contract below is locked; architecture does not re-decide hierarchy, component vocabulary, or chip presence.

## Decision summary
- **Titles:** human-readable, resolved server-side, batched. Display surface unchanged (`ThreadRow.title`).
- **Empty/loading:** keep existing treatments as-is (verified correct). No redesign.
- **Filter chips:** **REMOVE both Unread and Blocking chips** and the inline header chip bar. Neither can match real state today (unread has no backing concept; blocking's backing state is not produced until AF7). Per spec contract: "remove the control rather than ship a chip that never matches."

---

## 1. Readable thread titles

**Component:** `ThreadRow` (unchanged) renders `title` (primary, 1) + `hostTag` mono pill (3). The fix is the *value* of `title`, computed before it reaches `ThreadRow`.

**Title resolution ladder** (first match wins), computed server-side in `GET /api/threads` and returned as a new `title: string` field on each list row:

1. **Assistant thread** (host=`user`, hostId === requesting participant, participants include `ast-<userId>`) → `"Assistant"`.
2. **DM** (host=`user` or `agent`, exactly 2 participants) → the *other* participant's `users.name` (the recipient). e.g. `"Aria"`, `"Maverick"`.
   - **Fall-through (W1):** if the other participant has no `users.name` (deleted user, or an id with no row): `ast-*` id → `"Assistant"`; other agent/principal id → `"Agent"`; human with deleted row → `"Unknown participant"`. **Never `undefined`, never the id.** (Agents normally *do* have `users` rows, so this is the residual case.)
3. **Host-scoped** (host=`bet`/`task`/`knowledge_item`) → the host entity's human title (bet→`deriveTitle(description)`, task→`title`, knowledge_item→`title`). e.g. `"Ship onboarding v2"`.
   - **Fall-through (W1):** host row deleted/dangling (thread outlives host) → typed label `"Deleted bet"` / `"Deleted task"` / `"Deleted knowledge item"`. **Never the bare `hostId` uuid** — that re-introduces the AC1 defect.
4. **Group/feed** (host=`team`/`factory`, or >2 participants) → host entity name, else a **deterministically sorted** participant-name join (`"Aria, Maverick +2"` — sorted so the title is stable across reloads). Unresolved members are skipped, never rendered as `undefined`.
5. **Last-resort fallback** → `"Untitled conversation"`. **Never the `"<HostKind> thread <uuid8>"` stub. Never a bare UUID / `hostId`.** (Round-1 design fell to `hostId` here — corrected: a raw uuid is exactly the "raw identifier" AC1 forbids.)

**Hierarchy in the row (unchanged, for reference):**
1. Title — `text` primary, the resolved name above.
2. Timestamp — relative display string ("5m", "just now"), right meta. **Display only — never a sort key** (see architecture: sort uses `lastActiveAt`).
3. `hostTag` mono pill — the host kind, right of title.

**Copy register:** terse. No "Thread with…", no "Conversation:" prefix — just the name.

## 2. Empty + loading states (keep as-is)

- **Empty** (`threads.length === 0`, status ready): existing `EmptyState` — title `"No conversations yet"`, the existing description + chat-bubble icon + "Start a thread" CTA inside the card. Header shows only the `"Conversations"` title (no chips, no New-thread button) — already implemented. **No change.**
- **Loading** (status loading): `SkeletonList rows={3}` via `ThreadSections loading` path. **No change.**
- **Error** (status error): `ErrorState` "Couldn't load threads" + retry. **No change.**
- **Filtered-empty:** N/A after chip removal — there is no client-side filter that can empty a non-empty list, so the `thread-sections-filter-empty` surface is no longer reachable from Conversations. (The section-grouped `ThreadSections` filter path stays for other callers; only the flat Conversations path loses chips.)

## 3. Filter chips — REMOVE

**What renders before:** an inline chip bar in the Conversations header (`<FilterChip label="Blocking">`, `<FilterChip label="Unread">`) + the `toggleFilter` lifted state + the flat-list `toggleFilter.blocking`/`toggleFilter.unread` predicates in `ThreadSections`.

**After:**
- Header bar in the populated list state shows: `"Conversations"` title (left) + "New thread" button (right). **No chip cluster.**
- Remove `<FilterChip>` instances from `Conversations.tsx` and the `toggleFilter` state + `onToggleFilter` plumbing for the flat path.
- `ThreadSections` flat-list (`groupBySection={false}`) renders the list directly with no chip bar and no toggle filtering.
- **Keep** the `blocking` field on `ThreadItem` and the wire plumbing (forward-compatible for AF7). Removing the *chip* ≠ removing the *field*. Keep `FilterChip` the component (still used elsewhere / re-introducible) — only the two Conversations instances go.

**Why not keep a disabled/greyed chip:** a control that's always inert is noise in a density-first inbox. Remove it; reintroduce when AF7 produces blocking state.

**Accessibility:** removing the chips removes two `aria-pressed` buttons; the header keeps a single h2 + the New-thread button. No focus-order regression (one fewer tab stop pair).

## Mobile adaptation
Conversations is one of the three mobile tabs. Header collapses to the mobile 48px bar (title only, already handled by AppShell). Chip removal simplifies the mobile header too — no wrapping chip row at narrow width. No mobile-specific work.

## Motion
None added. Title is static text. Live-update insertion of a new row (architecture concern) should use the existing row appearance — no bespoke animation in this WP.

## Component budget
Zero new components. Net: −0 (FilterChip retained as a component; two usages removed). No budget impact.

## Open questions for the architect
- Title resolution must be **batched** server-side (one query per host kind across the page of rows, one `users` query for all DM/group participant names). Do NOT call `resolveHostTitle` per row (N+1 — flagged in `routes/threads.ts` lore). Define the batched resolver in `/architecture`.
- The list row already carries `lastActiveAt` on the wire (`ThreadListRow`); ensure `ThreadItem` carries it through for the sort key, distinct from the display `timestamp`.
