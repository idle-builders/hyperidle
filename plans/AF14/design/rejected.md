# Rejected directions (did we consider X / Y / Z?)

## Filter chips
- **X — Keep both chips, wire Blocking to `hasUnresolvedReview`, leave Unread as a no-op.** Rejected: `hasUnresolvedReview` is review-presence, NOT the concept's "blocking" (agent cannot continue). Mislabels the chip and re-introduces a control that lies. Unread no-op is the exact defect AF14 closes.
- **Y — Keep both, fake "unread" via lastActiveAt > lastSeen in localStorage.** Rejected: invents a client-only read primitive — a new concept, explicitly out of AF14 scope (concept §3). Per-tab localStorage desyncs across devices; "unread" would be wrong the moment you open the app elsewhere. Spec contract: "If a filter cannot be backed by real state, remove the control."
- **Z — Remove BOTH chips and the header chip bar entirely.** Rejected (partial): Blocking *is* a real concept whose backing state lands in a near-term WP (AF7). Deleting the chip and its lifted state wholesale means rebuilding it later. Better: remove Unread now (no backing concept at all), and remove Blocking *as a visible chip* but keep the section-grouped "Blocking" treatment that already works off `hasUnresolvedReview`-derived ordering — OR remove both chips but retain the `blocking` field plumbing. See approved.md for the chosen line.

## Titles
- **Show the raw `hostId` (the L9 detail-header fallback).** Rejected: a `bet-…`/`thr-…` id is still not human-readable in a scan-dense list. Acceptable as a *last-resort* fallback only.
- **Embed first-message preview as the title.** Rejected: that's the `snippet` slot's job (currently blank); conflating title and snippet collapses two hierarchy levels. Out of AF14 scope (no preview field on the list endpoint yet).
- **Per-row host-title fetch in `rowToItem`.** Rejected: N+1 over the list — the exact anti-pattern flagged in `routes/threads.ts` `resolveHostTitle` lore. Titles resolve server-side in batched queries.
