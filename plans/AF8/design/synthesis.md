# Synthesis

**Strongest base: Variant B (purpose-built dense triage row).** Wins on hierarchy, density, color discipline, and anti-slop. The screenshot evidence is decisive — Variant A truncates every title at the locked 360px width because the StatusChip + 24px icon circle + colored border consume the row before the title gets space. A notification that can't show its own title fails its only job.

**Pulled in from Variant A:**
- Keep A's **whole-row click = jump** target (B agrees) and A's explicit **"Mark all read"** is the one borrow worth reconsidering — but B's position (opening marks seen; dismiss is per-row) is cleaner for the near-term low-volume reality. **Decision: omit "Mark all read" for v1**, add only if usage shows pile-up (re-litigation allowed by data, not taste).
- Keep A's reuse instinct where it's free: the **shell** is a near-clone of `CocOverlay` (same idiom, tokens, focus/Escape behavior) — not a new pattern.

**Rejected (do not re-litigate in /architecture or /write-code):**
1. **Reusing the DS `NotificationRow` for popover rows** — wrong shape (severity Status enum vs binary urgency; decorative icon circle; title truncation). The popover row is purpose-built inline in the shell composition.
2. **Promoting the popover row to a new DS primitive** — single consumer (the popover); violates the 2+-context budget rule. Inline in `NotificationPopover.tsx`.
3. **"Mark all read" list verb (v1)** — deferred; per-row dismiss + open-marks-seen suffices.
4. **Merging with the §4.2 Conversations triage badge** — locked-concept hard rule #7: distinct surface, distinct source. The popover reads the notification store; the badge stays thread-derived.
5. **Channel matrix / per-type urgency override / "mute all" in Settings** — see settings-typelist rejected list (dormant channels, closed urgency, duplicate of factory silence).
6. **Notification detail view / history / test-send UI** — out of scope per spec.

**Settings type-list: single variant approved as specified** (registry-driven flat Toggle list). Routine; no synthesis needed.
