# AM3 — Session View Retro

## Phase Summary
- **Timeline:** 2026-06-22 (design → retro, same-day build)
- **Design:** 17 commits, 12 founder review rounds, 2 concept reframes
- **Build:** 2 feature commits (tasks 1-12), 1 review fix cycle, 26 new component tests
- **Status:** SHIPPED (PR #348)

## Cost Signals

### Design Phase (Expensive, Justified)
- Founder reframed concept: session = streaming conversation, not a control+activity panel
- Founder reframed architecture: session + conversation are ONE shared PartList form (not parallel)
- Multiple design batches rejected before "Session View" approved (calm, folded-aggregation variant)
- Design class = "novel"; designScore = 8

### First Build: Test Paradox
- Unit tests GREEN (672-line adapter test suite covering all contracts)
- `npm run verify` GREEN
- BUT 3 of 4 ACs unproven at surface:
  - AC1: Feature unreachable (no entry wired; hidden behind knip.json ignore)
  - AC3: Aggregation exported, not rendered (`aggregateToolRun` call missing from SessionView)
  - AC4: Zero component tests (only adapter unit tests existed)

### Fixture Fork Anti-Pattern
- SessionView.stories.tsx rendered ~1230-line fixture fork (parallel atoms: BareToolRow, HardAggregate, etc.)
- Fixture was the snapshotted design truth; production component was untested
- Fix collapsed to data-only fixtures: deleted ~904 lines of parallel renderers
- Stories now feed fixtures to PRODUCTION SessionView

### Review → Fix Scope
- Fix 1: Wire entry (Conversations.tsx + SessionViewPanel split layout)
- Fix 2: Wire aggregation (`aggregateToolRun` call in rendering flow + ChangedFilesPanel)
- Fix 3: Collapse fixture fork (delete atoms; production as single source)
- Fix 4: Add 26 component/DOM tests

## Three Key Observations

### 1. Green Unit Tests ≠ Green Feature
TDD's red/green covers testable units, but a feature is not truly done if:
- Unreachable (no entry point)
- Not rendered (logic exported but consumer doesn't call it)
- Untested at surface (adapter tests green ≠ component tests green)

Recommendation: Mark TDD tasks DONE only when (a) entry wired, (b) consumer calls the adapter, (c) surface tested.

### 2. Fixture Fork as Parallel Renderer (Anti-Pattern)
Fixture atoms (BareToolRow, HardAggregate, etc.) became a parallel renderer that was snapshotted and shipped. Fixture fork ≠ fixture data; rule out via design review.

Durable fix: "Every `ComponentName.stories.tsx` renders the PRODUCTION component, fed fixture data — never parallel atoms."

### 3. Design Reframing Prevented Cascading Rework
The expensive design gate (12 rounds, 2 reframes) caught a critical assumption: the unified message pattern (self right + avatars, others left) was missing in AM1. Backporting this pattern to shared PartList fixed AM1 conversation parity for free and prevented future branches from inheriting the defect.

Result: High design cost pays for itself via source-level fixes.

## Positive Patterns
- Adapter contract well-defined (exhaustive red tests)
- No source-agnostic boundary creep (adapter correctly separated; `derivePartsFromSession` takes `ActivityEntry[]` only)
- Review caught all defects pre-merge
- Shared PartList unification fixed AM1 parity at source
