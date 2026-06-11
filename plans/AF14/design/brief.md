DESIGN-CLASS: routine  ref=ThreadRow,ThreadSections,FilterChip,EmptyState,SkeletonList  pattern=running-conversations-view

# AF14 design brief — thread titles, list states, filter chips

## Scope (the only UI-shaped surfaces in AF14)
1. **Readable thread titles** — replace `"<HostKind> thread <uuid8>"` stub with a human title.
2. **Empty / loading states for the list** — confirm/keep the existing treatments (they already exist; verify they're correct, not redesign).
3. **Filter chip decision** — keep or remove Unread and Blocking, given concept facts: unread has NO backing state (no read primitive), blocking's backing state is not produced until AF7.

Everything else in AF14 (sort fix, WS subscription, overlay refresh, overlay rename, DM dedup) is behavior with no new visual surface — `/architecture` owns it.

## Interrogation (resolved from concept + code, nothing unsettled enough to block)

- **Who / what decision?** A founder scanning the inbox to pick the next thread to act on. Titles must let them recognize a thread at a glance; sort must put the live one on top. Chips that never match actively mislead the scan.
- **Smallest surface?** Title is a *value* change, not a layout change — `ThreadRow` already renders `title` + `hostTag` pill. No component touched. Empty/loading already implemented (`EmptyState` "No conversations yet", `SkeletonList` 3 rows). So the only real *design decision* is the chip question.
- **Primary state in real use?** Populated, low-count (a handful of threads). Empty is common on fresh install. Loading is a sub-second flash.
- **Extension, not new primitive.** Variants explore application within `ThreadRow`/`ThreadSections`, not a new shape → routine, 1 variant + rejection check.

## Title data available cheaply (drives the variant)
- Host-scoped threads (bet/task/knowledge_item): the host's title — the list endpoint can resolve it, but per-row host-title lookup is the N+1 pattern the L1a arch-critique explicitly forbids for list endpoints. → resolve in ONE batched query per host kind (see approved.md §Titles).
- DM threads (host=user/agent): the *other participant's* name (identities already loadable by id).
- Assistant thread: "Assistant" (host=user, participant includes `ast-<userId>`).
