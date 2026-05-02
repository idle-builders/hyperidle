# Variant B — User-vocab axis — CRITIQUE

Scoring against the nine `/design-critique` dimensions, judged from the rendered `screenshot.png` (1280×820, two frames).

| Dimension | Score | Notes |
|---|---:|---|
| 1. Visual hierarchy | 7 | Four chips at 240-px Submenu width crowd the chip row — `Needs review` and `Resolved` together push close to wrap. Chip row pulls more visual weight than A or C. |
| 2. Spacing & density | 8 | Density tokens consumed; `flex-wrap` retained for safety at narrow widths. Slightly tight at desktop; comfortable tier handles mobile fine. |
| 3. Color & dark mode | 9 | Same palette as A. No new chromatic accents. |
| 4. Typography | 8 | Same as A. `Needs review` is the longest chip label and sets the chip-row footprint. |
| 5. Borders / radii / shadows | 9 | Same as A. |
| 6. Motion | 8 | Same as A. |
| 7. Mobile & touch | 7 | Same as A. The four-chip row is more likely to wrap on narrow widths. |
| 8. Information architecture | 5 | **The asymmetric mapping is the central problem.** `Needs review` and `Chats` are *subsets* of the blocking and non-blocking halves of the axis (`blocking ∧ hasUnresolvedReview` and `¬blocking ∧ ¬hasUnresolvedReview`). Their union is `⊊ All` — a non-blocking thread *with* an unresolved review (or a blocking thread *without* one) escapes every chip except `All`. The chips are sharper than the L8 sections, not a bisection of them, which silently violates the brief's "one axis, exhaustive" rule. |
| 9. Founder filter | 9 | No emojis, no purple, no rounded-2xl. The `Resolved` chip duplicates the `Resolved · 24h` section's semantic — borderline (a chip whose name matches a section is fine if the chip narrows TO that section, which this design does). Counts derive correctly. |

**Total:** 70/90 → **7.8 / 10**.

**Strengths**
- Zero label change vs. the J2-locked vocabulary already on screen — no founder relearning cost.
- Empty-filter copy can be very specific per chip (`Nothing resolved in the last 24h.`).

**Weaknesses**
- The mapping is not a clean bisection of the founder's stated axis. Edge-case threads escape every chip except `All`.
- The chip row is denser visually than the axis warrants — four chips for a one-axis filter implies more structure than exists.
- `Resolved` as a chip duplicates the `Resolved · 24h` section, creating two ways to "see resolved threads" and zero ways to "see only resolved" without the duplication.

**Verdict:** clears the ≥7 threshold but only just. The IA score is the disqualifier — the founder's "one axis" constraint is the brief's hardest rule, and this variant honors it operationally but not visually.
