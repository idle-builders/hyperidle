# AM4 — Synthesis

## Strongest base: C — Provider cards (8.0)

C wins because it serves **both** the AM4 jobs the spec names — the high-stakes first-run "what's my next step" moment AND the durable Settings inspect/configure surface — without forking the layout. The uniform card chrome with descriptor-conditional zones is the descriptor-driven contract made literal: same card for every backend, the auth zone and capability fold appear purely from `discovery.state` + `authAction`. The tinted auth-zone inset is the one distinctive, purposeful detail that makes the next step unmissable on the backends that need it while letting ready ones stay quiet.

## Pull in from B

- **The expectation-setting header counts** ("2 ready · 2 need sign-in"). B's headline answers "am I done?" before the user scans. Pull this into C's header strip. Cheap, high-value at first run.
- **The ordering instinct** — render actionable backends first. C keeps one stack (no partition sections — that's B's steady-state weakness), but **sorts so `unauthenticated`/`installed` cards lead**, `ready` next, `unavailable` last. Gets B's "the gap floats up" benefit without B's vanishing-section problem.

## Pull in from A

- **The copyable mono command** beside the CLI-login CTA (A and C both have it; keep C's placement inside the auth zone). For `native_cli_login` the command is the literal next action; surfacing + copying it is the honest "we surface the step, the CLI owns the secret" behavior.

## Rejected (do not re-litigate)

- **A's flat dense list as the primary shape** — buries the actionable next step under a 152px gutter; fails the spirit of the "actionable, not silent" AC. (A's density is the right instinct for a 20-row table; we have 5 backends.)
- **B's partition into separate Needs-you / Ready sections** — degrades to a near-empty page once everything is ready, and strands capability inspection. We take B's ordering and counts, not its sectioning.
- **Per-backend icons / logos** — would require a per-backend branch (the hard contract forbids it) and adds decorative chrome (AQ-019). Name + StatusChip is the identity.
- **A 3-column card grid** (AQ-108) — single column only; this is a settings list, not a dashboard.
- **Centered first-run hero** (AQ-008/AQ-106) — left-aligned workspace layout; the surface lives in the app shell / Settings, not a marketing page.
- **Skeleton/error/empty states in the design** — deferred to build per project memory; build reuses `SkeletonList`/`ErrorState`/`EmptyState` as the sibling settings sections do.
