# Variant A — Dense status list

**User task.** A settings power-user scans all detected backends' readiness at once and acts on the one row that needs it.

**Component composition.** One flat list inside a single `--surface-elevated` card. Per row: backend `name` (140px column) · `StatusChip` (readiness) · mono version/access-mode · spacer · `Toggle` (enable, right-aligned). A quiet secondary line carries the capability summary. An action line (only when descriptor is actionable) holds a primary `Button` (`authAction.label`) + a copyable mono `code` command. Unavailable rows show `discovery.reason` as a quiet line.

**Information hierarchy.**
1. Backend name + readiness chip (the scan target).
2. Enable toggle (the commitment, right edge).
3. Auth CTA + command (only on rows that need it).
4. Capability summary + version (reference, dimmed).

**States.** Populated shown. Empty/loading/error deferred to build (`EmptyState`/`SkeletonList`/`ErrorState` per existing settings sections).

**Behavior.** Toggle disabled until `ready`. CTA click → build wires auth flow (`enter_api_key` opens credential input; `native_cli_login` reveals/copies command). Row hover: subtle bg tint (build). Keyboard: standard tab order; toggle is a `role=switch`.

**Mobile.** Rows stack; the 140px name column collapses to full-width; toggle drops below the status line.

**Signature.** Whole fleet's readiness visible in one viewport scroll, single card, zero chrome per row.

**Trade-offs.** Bad at making the first-run "what do I do next" obvious — the user must read every row to find the actionable ones. Action lines indented under a 152px gutter feel buried. Capability fallback copy repeats on every unauthenticated row (noise).
