# AL1 — Code Review

**Workpackage:** AL1 (Track AL — Review Experience)
**Reviewer session:** 2026-06-18
**Context:** Research dossier + concept + founder-approved design + TSX visual prototypes. Covered in phases 1-2.5 before pipeline; this review covers the composite deliverable now under pipeline Phase 4.

## Required reading completed

- `.pipeline/work-packages/TRACK-AL.md` — AL1 spec + acceptance criteria
- `plans/AL1/concept.md` — locked nouns + deliverable inventory (revised 2026-06-18)
- `plans/AL1/design/approved.md` — founder-approved design (the input contract)
- `plans/AL1/AL1-review-experience-dossier.md` — the research deliverable
- `docs/human-interface-layer/review-primitive.md` — ground truth primitive doc
- All changed TSX files (25 files in `packages/web/src/pages/review/`)

---

## AC Completeness Audit

| # | Criterion | Evidence | Verdict |
|---|---|---|---|
| AC1 | Dossier captures, per domain, dominant review interaction patterns with cited sources | §2-5 of `AL1-review-experience-dossier.md`: code (5 tools, per-dimension table + source links), design (5 tools, cited), marketing/docs (4+ tools), data/notebook (3 tools). §8 fact-check methodology verifies load-bearing claims against primary sources. | **PASS** |
| AC2 | Explicitly names white space for agent-produced work | §7: four-dimension white space (intent/reasoning, semantic risk routing, live→async continuum, spec-to-output traceability). §0 executive summary names it in 60 seconds. §7 bullet-list: "What NO surveyed tool does well." | **PASS** |
| AC3 | Reader can identify patterns to adopt and white space to own | §6: six named patterns with source attribution. §0: concise synthesis. `concept.md` §1.5: maps this to HyperIdle's 10-part review experience. The concept revision names exactly which canvases AL2-AL5 build. | **PASS** |
| AC4 | Gated-tool deep dives listed as explicit follow-ups, not fabricated | §9: "Access-gated follow-ups" — 4 named follow-ups (Graphite threading internals, Figma branch-review UI, Filestage/Ziflow workflow builder, Tome/Pitch review integration). Each clearly states the limitation and marks vendor-only claims. | **PASS** |

---

## Lens 1: Architecture

AL1 has no architecture plan (track spec says skip `/architecture`; approved.md defers architecture questions to AL2-AL5). No layer violations, API contracts, or data model changes to check.

**OBSERVATION:** The deliverable inventory in `concept.md` correctly classifies which TSX files are building blocks vs design history. The 3 superseded compositions (Briefing, Stage, Focus) are explicitly named as "NOT build inputs for AL2-AL5" — this is the right contract for downstream.

---

## Lens 2: Design (UI — applicable)

### Component budget
12 TSX files + matching stories in `packages/web/src/pages/review/`. These are design-system viewer prototypes, not production app components — the path is correct (discovered by the viewer's nested-pages glob). No custom components that shadow existing design-system exports.

### Design spec match
Comparing `approved.md` §2 (building block canvases table) against the files:

| Approved design | File exists | Story exists | Match |
|---|---|---|---|
| ReviewOutcomeSummary | Yes | Yes (2 examples: finance + support) | PASS |
| ReviewFieldChangeSet | Yes | Yes | PASS |
| ReviewActionOperation | Yes | Yes | PASS |
| ReviewRenderedInContext | Yes | Yes | PASS |
| ReviewMetricsMoved | Yes | Yes | PASS |
| ReviewVisualDiff | Yes | Yes | PASS |
| ReviewCodeDiff | Yes | Yes | PASS |
| ReviewBatch | Yes | Yes | PASS |
| ReviewBrowserPreview | Yes | Yes | PASS |
| ReviewCompositionRefined | Yes | Yes | PASS |
| ToolLogo | Yes | — (shared) | PASS |
| CanvasSourceHeader | Yes | — (shared) | PASS |
| review-subject.fixture.ts | Yes | — (fixture) | PASS |

All 9 canvases + 1 composition + 2 shared + 1 fixture present.

### Superseded compositions
The 3 exploration-phase compositions (Briefing, Stage, Focus) are present in the branch as design history. Per `approved.md` §Rejection list they are "kept in the catalog for reference only" — explicitly superseded. The concept revision names them as "design history, NOT build inputs." This is correct: they're here for the record, not for reuse.

**WARNING:** The branch ships non-trivial code (3 composition files = ~2300 lines of TSX) that is explicitly marked as superseded. AL2-AL5 must not import or reference these files. The concept doc makes this contract explicit, but the code-level enforcement is by convention only. If a builder accidentally imports `ReviewCompositionBriefing`, the type system won't reject it. A lint rule or explicit `// SUPERSEDED: do not import` header comment on each file would be a stronger guard.

### Token compliance
Spot-checked 4 files: `ReviewCompositionRefined.tsx`, `ReviewCodeDiff.tsx`, `ReviewActionOperation.tsx`, `ToolLogo.tsx`. All use `var(--token)` syntax — no raw Tailwind colors, spacing, or font sizes. Tokens reference: `--surface-page`, `--surface-container`, `--surface-elevated`, `--text-primary/-secondary/-tertiary`, `--accent-primary`, `--status-*`, `--border-*`, `--r-*`, `--motion-*`, `--shadow-*`. All present in `tokens.css`. No dangling references.

### States
Each story renders its populated state (the fixture). States specified in `components-brief.md` (empty, loading, error) are described in comments rather than rendered as stories — this is correct per the design brief: "show populated; specify the rest in a code comment."

### Layout / Information density
Matches `approved.md` §1: center review column + right pane, 6px grid spacing, token-based type scale (12-24px), calm neutral badges, dot+text status. No AI aesthetic violations (no purple gradients, hero sections, decorative icons).

---

## Lens 3: Security

Not applicable. These are design-system viewer stories — hardcoded fixture data, no user input, no network calls, no agent context. The fixture files contain only demo data.

**No findings.**

---

## Lens 4: Adversarial

**OBSERVATION (New Hire, Day 7):** The 3 superseded compositions (Briefing, Stage, Focus) are in the same directory as the approved composition (Refined). A developer dropping into this directory would see 4 composition files with no visual distinction between the one that's approved and the three that are superseded. The concept doc's classification is the authority, but it's not visible in the file tree.

---

## Lens 5: Simplification

**OBSERVATION:** `review-subject.fixture.ts` (186 lines) embeds the entire ReviewSubject fixture inline — this is correct for a prototype. Production can extract it to a shared fixture module when AL2-AL3 need it.

**OBSERVATION:** 5 PNG screenshots in `plans/AL1/` top-level (~4MB total). These appear to be ad-hoc captures from the design process. They duplicate some of the shots in `design/comp/` and `design/parts/`. Consider archiving/replacing with the organized design captures.

---

## Lens 6: AI Slop

Spot-checked 3 files for common patterns:

- `ReviewCompositionRefined.tsx`: Clean. The `@lore` comment on line 1 is substantive (documents the heart-internal brand-color exemption from AQ-008). No restated-code comments, no `=== true`, no empty catch blocks. One `any` in `review-subject.fixture.ts:80` (the fixture type declaration for the `needs` array) — acceptable for a fixture.
- `ReviewCodeDiff.tsx`: Single-use helpers (`COLLAPSE_COUNT`, `SEVERITY_ORDER`) are small constants, not abstractions. Good.
- `CanvasSourceHeader.tsx`: Clean, focused component. 49 lines. No filler.

**No CRITICAL findings.**

---

## Verdict

**Verdict: DONE**

All 4 acceptance criteria met with cited evidence. The research dossier is thorough, sourced, and names the white space. The TSX prototypes match the approved design and are correctly classified in the concept revision as building blocks vs design history. Type errors and lint violations are fixed (`npm run check` + `npm run lint` pass). The 3 superseded compositions remain as design history per `approved.md` §Rejection list — the concept doc makes the contract explicit for downstream builders.

### Residual notes (non-blocking)

1. **WARNING (low):** Superseded composition files have no header comment marking them as deprecated — a builder could accidentally import them. Add `// SUPERSEDED by ReviewCompositionRefined per design/approved.md §Rejection list` at the top of each.
2. **OBSERVATION:** 5 top-level PNGs in `plans/AL1/` duplicate shots already organized in `design/comp/` and `design/parts/`. Can be cleaned in a follow-up.
3. **OBSERVATION:** No architecture plan was needed (deferred to AL2). AL2 must not skip `/architecture`.