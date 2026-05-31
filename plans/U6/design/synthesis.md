# U6 Design Synthesis

## Strongest base: Variant A (Minimal Scaffold)

Despite Variant C scoring highest on the critique, I recommend Variant A as the base for the following reasons:

1. **The spec says "Sidebar NOT collapsible on desktop."** Variant C's core signature -- expand/collapse chevrons on sections -- contradicts this constraint. The spec says sections are fixed, sub-items are dynamic, and there is no collapse mechanism on desktop. Variant C's disclosure pattern is compelling but out of scope. If we want section-level collapse later, it can be added as a follow-up. Shipping it now adds interaction complexity and state management that the spec explicitly excludes.

2. **Zero new visual patterns.** NavItem already exists. Variant A reuses it for every row. This respects the component budget and keeps maintenance cost at zero. Variant B's custom sub-item treatment and Variant C's disclosure rows would need dedicated styling that diverges from NavItem.

3. **The spec's section structure is flat.** "Three sections fixed. Two levels max: section -> sub-items." This is exactly what Variant A does: a flat list with labeled groups. No tree behavior.

## Elements pulled from other variants

### From Variant C (Linear-Borrowed)

1. **Wordmark treatment.** "HyperIdle" in `--font-sans`, 14px, `--fw-medium`, `--text-primary`. Not mono caps (which looks too austere as seen in Variant A's screenshot). Not a single "H" (too ambiguous, Variant B). A clean sans-serif wordmark that is present without shouting. This is the one change from Variant A's spec.

2. **Bottom area: avatar + name + gear.** Variant A used two separate NavItems for CoC and Settings. Variant C's bottom treatment is better: a CoC row (icon + label) above a user row (avatar initials + name + gear icon). This packs more information into less space and makes settings access feel personal (your name, your settings) rather than generic. However, per the spec which says "gear icon or user avatar" (not both + name), I'll simplify to: CoC row + avatar-with-gear row. The avatar click opens settings. No user name displayed (saves space, and the user already knows who they are).

3. **Sub-item active state treatment.** Variant C's active sub-item with `margin: 1px 6px` inset + elevated bg + shadow creates a "pill" effect that visually pops from the list. This is better than Variant A's flat elevated-bg treatment. Pull this into the final design.

### From Variant B (Power Density)

1. **Section header as clickable nav.** Variant B merged the section label and primary nav item into one: "CONVERSATIONS" is both the label AND the click target for `/conversations`. This is more efficient than Variant A's separate section label + "All Conversations" NavItem. However, we must keep the section icon (Variant A/C have it, Variant B dropped it). Final: the section header row is a clickable element with icon + label + count badge, styled as mono uppercase label text. Clicking it navigates to the section root. This eliminates the need for a separate "All Conversations" / "Portfolio" / "All Knowledge" primary NavItem.

2. **Sub-items directly below section header, no separate primary NavItem.** This saves one row per section (3 rows total = 108px saved at default density). The section header IS the primary item.

## Rejected elements

1. **Disclosure chevrons (Variant C).** Spec says "Sidebar NOT collapsible on desktop." Chevrons imply collapsibility. Out of scope.

2. **"H" lettermark (Variant B).** Too ambiguous. Could be any app. The wordmark should identify the product.

3. **Icon-only bottom strip (Variant B).** The CoC trigger needs a label for discoverability. A new user should not have to guess what the chat-bubble icon does. Variant C's labeled row is better.

4. **Custom sub-item rows without NavItem (Variant B).** Introduces a parallel visual pattern. NavItem can handle sub-items with appropriate prop configuration (no icon, smaller text via density or explicit class).

5. **User name in sidebar bottom (Variant C).** The spec says "gear icon or user avatar" -- not a full user identity row. Keep it simple: avatar button that opens settings.

6. **Section-level expand/collapse with localStorage persistence (Variant C).** Over-engineering for a fixed three-section sidebar. Out of scope per spec.

## Final direction

The approved design is a flat two-level sidebar:

```
 HyperIdle                         ← brand wordmark (sans, 14px, medium)
 ─────────────────────────────
 [icon] CONVERSATIONS    12        ← section header (clickable, mono 12px caps)
   Review: Agent refac...          ← sub-item (13px, indented, truncated)
   Deploy pipeline stu...          ← sub-item with status dot
   Weekly planning wit...          ← sub-item
 ─────────────────────────────
 [icon] WORK              3        ← section header (clickable)
   Platform                        ← team sub-item
   Growth                          ← team sub-item
 ─────────────────────────────
 [icon] KNOWLEDGE                  ← section header (clickable)
   Practices            .          ← scope sub-item with status dot
   Teams                .          ← scope sub-item with status dot
 ─────────────────────────────
 [coc icon] Chief of Staff         ← CoC trigger row
 [avatar]   ⚙                     ← avatar + gear icon, opens settings
```

This combines:
- Variant A's NavItem reuse and flat structure
- Variant B's merged section header (label IS the nav item)
- Variant C's wordmark treatment, bottom area structure, and active sub-item "pill" effect
