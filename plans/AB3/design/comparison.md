# AB3 Design Comparison

## Side-by-side

| Dimension | A: Minimal Scaffold | B: Power Density | C: Linear-Inspired |
|---|---|---|---|
| **Signature** | Minimum viable enhancement -- enhanced rows + plain form dialog | Soul-first editing with inline description on roster cards | Structured profile dialog with Identity / Soul / Config sections |
| **Component count** | 0 new. Avatar, Button, Tag, Input, Select, native dialog | 0 new. Same components, plus `<details>` native element | 0 new. Same components, plus KeyValue reuse in dialog |
| **Roster density** | Sparse rows: name + role label + optional tag + button. ~36px per row | Compact cards: name + role description. ~52px per card | ThreadRow-style: name + role+desc joined. ~52px per row |
| **Info per roster item** | Name, role label, category tag (non-team only), lead badge | Name, role description (full sentence), category dot, lead badge | Name, role label + description (joined), category tag, lead badge, edit button |
| **Primary action surface** | Explicit "Customize" ghost button on each row | Entire card is clickable (no explicit button) | Row clickable + explicit "Edit" ghost button |
| **Dialog structure** | Flat: guidance text + soul textarea + settings fields, all visible | Soul-first: textarea dominates, settings in collapsed `<details>` | Three sections: Identity (read-only KeyValue) + Soul (textarea) + Config (fields) |
| **Category communication** | Tag component on roster + amber note in dialog | 6px colored dot on roster + amber note in dialog | Tag on roster + full "Category" KeyValue in dialog identity section |
| **State strategy** | Same dialog for all states. Strategy note is inline text | Same dialog, strategy dims settings. Details collapse varies | Same dialog structure, strategy disables config section |
| **Motion** | Dialog opacity fade | Dialog opacity fade | Dialog opacity + translateY lift-in |
| **Best at** | Speed to ship. Minimal risk. Familiar patterns. | Scan-to-edit speed. Soul editing dominance. Information density. | Comprehension. The structured sections create a clear reading flow. |
| **Worst at** | Understanding. No description on roster; dialog is a form dump. | Discoverability. No explicit edit button; collapsed settings hidden. | Weight. Three sections for a soul edit feels heavy for repeat use. |

## Scoring (in-session critique, 0--10)

| Dimension | A | B | C |
|---|---|---|---|
| Hierarchy | 5 -- flat, no clear primary/secondary in dialog | 8 -- soul dominates, settings recede | 7 -- sections create rhythm but identity section competes with soul |
| Density | 6 -- roster is sparse; dialog wastes space showing all fields | 8 -- roster packs description; dialog focuses on soul | 6 -- roster is good; dialog is spacious but may waste space for repeat users |
| States | 7 -- all states covered, strategy note clear | 7 -- all states covered, details collapse varies | 8 -- all states covered, identity section gives best context |
| Coherence with Hearth | 7 -- follows existing row pattern exactly | 7 -- cards are a known pattern; details is less Hearth | 8 -- ThreadRow pattern + KeyValue + section headers all exist in Hearth |
| Anti-slop | 8 -- nothing extraneous | 7 -- colored dots need tooltips (subtle but potentially confusing) | 7 -- identity section is read-only context that some users may not need |
| Component budget | 9 -- zero new | 9 -- zero new | 9 -- zero new |
| Accessibility | 7 -- explicit button is good; dialog form is standard | 6 -- no explicit button means click-target semantics on card need ARIA | 8 -- explicit button + structured sections with headers are screen-reader friendly |
| Mobile | 7 -- works as-is | 7 -- works as-is, details expanded | 7 -- works as-is, identity collapsed |
| Premium polish | 5 -- plain form dialog feels utilitarian | 7 -- soul-first focus feels intentional | 8 -- section headers and KeyValue pairs feel purposeful and crafted |
| **Total** | **61** | **66** | **68** |

## Analysis

**Variant A** ships fastest but delivers the weakest user experience. The roster does not show descriptions, so the team lead must open every dialog just to understand what agents do. The dialog is a flat form with no hierarchy -- experienced users will be fine, but first-time users get no guidance about what matters.

**Variant B** has the best scan-to-edit flow. The description on the roster card answers "what does this agent do?" without opening a dialog. The soul-first dialog focuses on the 80% task. But the lack of explicit edit buttons hurts discoverability, and the colored dot for category is too subtle for first-time comprehension.

**Variant C** has the best first-time comprehension. The identity section in the dialog explicitly answers "what is this agent?" before asking the user to edit. The section headers create a reading rhythm. But for repeat editing, the identity section is dead weight -- the user already knows what a Builder does.
