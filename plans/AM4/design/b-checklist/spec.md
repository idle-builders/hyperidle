# Variant B — Get-to-working checklist

**User task.** At first run, get from "fresh install" to "one working backend" by the shortest path — the backends that need action float to the top with their single next step.

**Component composition.** Three descriptor-partitioned sections:
- **Needs you** — card list; each row is identity + `StatusChip` + a CLI command hint + a right-aligned primary `Button` (`authAction.label`). This is the work.
- **Ready** — quiet flat list inside one card; `StatusChip` + name + capability summary + version + ghost "Configure".
- **Unavailable** — muted footer paragraphs, no action.

Header counts ("2 ready · 2 need sign-in") set expectations.

**Information hierarchy.**
1. The counts headline (am I done?).
2. "Needs you" rows + their CTA (the task).
3. "Ready" confirmations (quiet reassurance).
4. Unavailable footnotes.

**States.** Populated shown. Empty (`EmptyState` "No backends detected"), the all-ready case (Needs-you section hidden — already supported by the partition), loading/error deferred to build.

**Behavior.** Partition is computed from `discovery.state` via shared mappers. CTA same flow as A. When a backend becomes ready it migrates from "Needs you" to "Ready" (build handles re-fetch). Keyboard: each CTA in tab order top-down.

**Mobile.** Sections stack naturally; "Needs you" cards full-width; CTA wraps below the identity line.

**Signature.** The interface has a goal state — it tells you how many backends still need you and surfaces only those, instead of presenting a neutral table.

**Trade-offs.** Bad as a steady-state settings surface — once everything is ready the "Needs you" section vanishes and the page is just a quiet confirmation list, which under-serves the "inspect a ready backend's capabilities" task (no models fold here). Two rendering treatments (action card vs ready row) is more surface than A's single row.
