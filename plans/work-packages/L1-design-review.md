## Design Review: L1

**Score: 6.4/10** (VH:7 SD:5 T:6 C:8 CC:8 S:5 A:3 AS:9 PP:7)

### Browser Verification

Confirmed in browser (worktree dev on http://localhost:5180; main-tree :5173 was serving the wrong code).

- Empty state `?id=<missing>` — `/tmp/L1-empty-3.png`. Renders the new `EmptyState` ("No thread selected · Open a review from the inbox to see it here.") inside the AppShell with IconRail + Submenu + Rail. No leak of `FALLBACK_THREAD_ID`. PASS for the contract Step 5 promised.
- Error state `?id=test-thread-id` (server unavailable) — `/tmp/L1-error.png`. Renders "Failed to load review · HTTP 500" via `ErrorState`. PASS.
- Populated state — could not be browser-verified end-to-end. The worktree server requires DB migration against a populated SQLite (`factory_settings` table missing on dev path), and the running dev server points at the main repo, not the worktree.
- Storybook — confirmed L1 stories file paths and exports compile. `/designsystem` catalog does NOT surface ANY `packages/design-system/src/*.stories.tsx` modules (pre-existing glob-path bug in `web/src/designsystem/DesignSystem.tsx:11` — `../../../../design-system` is one `../` too deep). Direct HTML refs at `:8098` rendered correctly for all six L1 components.
- Visual regression — `bunx playwright test --config=playwright.l1.config.ts` 12/12 PASS. Note: these tests verify existence + `data-ds-component` markers only, not pixel parity. The 5% pixel-diff rule from `.claude/rules/visual-parity.md` is NOT enforced for the L1 family.
- Mobile (≤768px) — not browser-verified. No mobile-specific code paths in the implementation (no breakpoint switches in `ThreadShell`, no two-tab segmented control, no per-viewport Verdict-bar repositioning).

### CRITICAL

- **C1. Sticky `ReviewVerdictBar` behavior is not implemented.** Approved.md §6 mandates "released (scrolls with content) once the user scrolls past the head into the comment stream." The implementation is a single `position: sticky; bottom: …` declaration in `packages/design-system/src/ReviewVerdictBar.tsx:65`. There is no IntersectionObserver, no scroll listener, no head-edge → released transition. The bar will pin to the bottom forever, violating §5 "scroll" + §6 behavior. This is the largest gap between approved.md and the build.
- **C2. Sender-grouping is missing.** Approved.md §2.4 + §8 hard-rule 3 mandate: "consecutive messages from the same sender within 5 minutes show the sender header once and stack indented body blocks below." `ThreadShell.tsx:164` hardcodes `showSenderHeader={true}` for every row. The 5-minute predicate is never computed.
- **C3. The "Unresolved review · acting required ↑" composer rule is not wired.** Approved.md §2.5 requires it iff "the most recent message in the thread is an unresolved review/questionnaire." `Composer.tsx` accepts the `unresolvedReviewLink` prop, but `ThreadShell.tsx:187` calls `<Composer threadId=… onSubmit=… />` with no `unresolvedReviewLink`. The mobile-fallback contract from §6 + §8 hard-rule 4 is silently broken.
- **C4. Accessibility is absent.** Approved.md §5 mandates `aria-live="polite"` on shape transitions, visible focus rings on every interactive element, and `prefers-reduced-motion` handling. `grep -n aria-live …` returns ZERO matches across all six L1 components. No `:focus-visible` overrides; default browser outlines only. Touch targets fail AQ-015 — verdict buttons are `py-[6px]` ≈ 28px tall, well below 44px; the avatar circles are `w-[24px] h-[24px]`. This is a P0 a11y miss.

### WARNING

- **W1. Approved.md §2.3 still describes the old verdict-bar contract** (5 binding + 3 message-emitting + 2 sidecar). Step 5 dropped the latter five. The contract document needs an inline update or a Step-5 amendment paragraph; otherwise downstream consumers will rebuild against the wrong spec.
- **W2. Host-attachment label is not a link.** Approved.md §8 hard-rule 5: "The host-attachment label is a link." `ThreadShell.tsx:114-122` never sets `hostHref` and uses `${thread.hostKind}/${thread.hostId}` as the title (developer string, not a resolved entity title). The page must resolve and pass both.
- **W3. `bottom-[var(--density-row-h,40px)]` violates AQ-002.** The verdict bar's sticky offset hardcodes 40px row height; this is one tier of density tokens away from the comfortable mode (which would push it higher). Use the token without the literal fallback.
- **W4. `text-[10px]` on participant avatars (`ThreadHostBanner.tsx:103,109`) is off the closed type-scale allowlist** `{11, 12, 13, 14, 15, 16, 18, 20, 24}` — AQ-004. Bump to 11.
- **W5. ThreadHead title hardcodes `text-[15px] font-semibold`** instead of `var(--density-text-h2)` weight 600 (approved.md §2.2). This breaks density-tier scaling — AQ-002.
- **W6. `pl-[20px]` on the reasoning `<ol>` (`ThreadHead.tsx:69`)** is on-grid (4×5) but off the density-aware ladder; the bullet indent should derive from a token so compact mode doesn't inherit the desktop value. AQ-002.
- **W7. Storybook catalog is broken for `packages/design-system/src/*` stories.** Pre-existing — `web/src/designsystem/DesignSystem.tsx:11` glob path has one too many `../`. Resolves to `<repo>/design-system/src/*.stories.tsx` instead of `<repo>/packages/design-system/src/*`. The L1 stories file exists and is valid; it cannot be discovered. Visual review via `/designsystem` is impossible until this is fixed.

### SUGGESTION

- **S1. Loading state should match approved.md §4.** The spec says "ThreadHostBanner skeleton + 3 SkeletonRows in the stream area." Implementation renders the real banner + 3 skeletons. The banner data isn't available during initial fetch — should be a skeleton.
- **S2. Resolved state is partially implemented.** The verdict bar collapses on `headMessage.resolvedAt !== null`, but the head doesn't render a "RESOLVED" strip (approved.md §4 "head (if present) shows the original substance message with `RESOLVED` strip in place of the verdict bar"). The `resolvedVerdict` prop on ThreadHead exists but `ThreadShell` never passes it.
- **S3. Overflow row (>50 messages) is not implemented.** `Show N earlier comments` row (approved.md §2.4 + §4) is missing.
- **S4. `Tag label={hostKind}` renders the raw enum value (e.g. "task")** rather than the mono-caps abbreviation. Approved.md §2.1 sample: "BET · Pricing overhaul (Nimmly)". Add a host-kind-to-label map.
- **S5. Promoted artifact (canvas+dock) is entirely unimplemented.** Acknowledged as L11 territory but the `onPromoteArtifact` plumbing in `ThreadShell` (approved.md §2.6) is also missing.
- **S6. Pixel-parity tests do not run for L1.** `playwright.l1.config.ts` only checks existence + DS markers. Add `toMatchSnapshot` against the HTML refs.

### Verdict

**FAIL** — accessibility (3) is below the 5-floor; sticky behavior, sender-grouping, composer-fallback, and a11y are CRITICAL gaps versus the locked design contract. Average 6.4 misses the 7.0 gate.

The two fixes the developer should batch first:

1. **Fix C4 (a11y) end-to-end** — add `aria-live="polite"` to the shape-change container in `ThreadShell`, add `:focus-visible` outlines using `--accent` per approved.md §5, raise touch targets on verdict buttons + avatar circles to ≥44px or rely on hit-area expansion via padding. This is one cohesive pass, ~30 minutes, and unblocks the mobile review entirely.
2. **Fix C2 + C3 together** — both depend on knowing "most recent message of type X." Compute a `groupedMessages` array in `ThreadShell` (sender-grouping with 5-minute window) AND a `mostRecentUnresolvedReview` flag, then thread `showSenderHeader` per row and `unresolvedReviewLink={…}` to Composer. Single derived-state pass, no new components.

C1 (sticky-release) and W1 (approved.md update) should be the third batch — they are visible to the user but lower frequency than a11y/grouping. Anti-slop (9) and component coherence (8) are strong; the implementation reuses the right primitives. The visual signal once the gaps are closed will read premium.
