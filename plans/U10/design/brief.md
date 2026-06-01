DESIGN-CLASS: routine  ref=aesthetic-quality.md+DESIGN.md+PRINCIPLES.md+AESTHETICS.md  pattern=03-hearth.html

# U10 Design Brief -- Hearth Aesthetic Rules

## Context

U10 translates the Hearth design language (defined in `03-hearth.html`) into enforceable rules, documentation, and lint configuration. The Hearth reference is the locked vision -- no design exploration of the aesthetic itself is needed. The design question is: how to faithfully encode the Hearth aesthetic into rules/docs such that AI agents produce Hearth-conformant UI.

## Key conflicts between Hearth reference and current K-track/Lucid-era docs

1. **Spacing grid:** Hearth uses a 6px grid (3/6/9/12/18/24/36/48). Current rules enforce 4px grid (4/8/12/16/20/24/32/40/48).
2. **Radius scale:** Hearth uses 0/10/16/pill. Current rules enforce 0/4/8/12/pill (Lucid `--r0..r3`).
3. **Shadows on cards:** Hearth puts `shadow-default` on cards. Current AQ-012 restricts heavy shadow to overlay surfaces.
4. **Motion/easing:** Hearth uses 120/240/450ms with `cubic-bezier(0.25,0.1,0.25,1)` (CSS `ease`). Current rules enforce 80/150/250ms with `cubic-bezier(0.2,0,0,1)` (Material standard).
5. **Fonts:** Hearth uses system-ui / ui-monospace. Current docs reference Geist + Geist Mono.
6. **Status colors:** Hearth uses chromatic status (green/amber/red/blue). Current docs describe monochrome status philosophy.
7. **Design principles:** Hearth has 4 principles (Warmth signals trust, Status through content, Generous rounding, Mixed hierarchy). Current PRINCIPLES.md has Seven Universals + Surprise Principles from Lucid-era research.
8. **Token names:** Hearth uses `--surface-page/container/elevated/overlay`, `--text-primary/secondary/tertiary`. Current AESTHETICS.md references `--surface-0..7`, `--text-hi/lo`.
9. **Border widths:** Hearth specifies visible border widths (1/1.5/2.5px). Current system uses opacity-based borders.
10. **Dark mode base:** Hearth dark uses warm `#1a1510`. Current docs reference cool `#111113`.

## Rejected directions

- **Merge Hearth into the existing K-track AESTHETICS.md structure:** The K-track research is Lucid-specific. Adding "Hearth overrides" section-by-section would create a contradictory document. Better to update the recommendations tables directly.
- **Create a separate Hearth AESTHETICS.md:** Would fragment the source of truth. One file should be authoritative.
- **Keep both Lucid and Hearth rules simultaneously:** Lucid is dead. No dual-system complexity.

## Approach

Update all docs and rules to be Hearth-native. The K-track AESTHETICS.md research is valuable infrastructure -- the cross-system citations, the recommendation table format, the appendices. We keep the structure but update every recommendation that Hearth contradicts. The 03-hearth.html is treated as a set of explicit designer-calls that override K-track research verdicts.
