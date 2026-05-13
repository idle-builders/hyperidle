# Test-coverage gap analysis — Mock-data purge (M4 AC-4)

Explains why the pre-Track-M test suite passed despite mock-data leaks in runtime code, and
describes the structural fix introduced by the M1 lint rules.

---

## Root cause: behavioral tests do not catch data-source leaks

The existing test suite proves *behavior* (does the component render, does the panel open, does
the list show items). It does not prove *data provenance* (did the data come from the API or from a
hardcoded constant).

This gap is not a testing failure — it reflects the correct role of behavioral tests. The gap was
invisible before Track M because the runtime and the tests used the same fixture source. When the
runtime imported `DEMO_FOUNDER_ID = "u-founder"` directly and the test rendered the component with
that same import, both were correct relative to each other. Neither caught that the runtime should
have been reading from the auth API instead.

---

## Concrete examples

### 1. `WorkBet.tsx` — hardcoded founder id in thread creation

`WorkBet.tsx` used `FOUNDER_ID = "u-founder"` (from `app-shell-data.ts`) when calling
`resolveOrCreateTaskThread(taskId, founderId, agentParticipantId)`. The e2e test for bets
(`work-surface.spec.ts`) checked that bet cards render and that clicking a task opens the sheet. It
never opened the thread panel and never posted a message. The hardcoded `founderId` was never
exercised in any assertion. The test passed; the data-source leak was invisible.

### 2. `AppShell.tsx` — hardcoded founder id in profile button

`AppShell.tsx` used `DEMO_FOUNDER_ID = "u-founder"` (from `app-shell-data.ts`) for the profile
button aria-label and displayed name. The test suite checked that the AppShell renders an icon rail
and that navigation links are present. No test asserted "the profile button shows the logged-in
user's name from the API". The test checked layout structure, not data source. The test passed;
the `DEMO_FOUNDER_ID` leak was invisible.

### 3. `Rail.tsx` — hardcoded MOCK_RAIL_COST in cost display

`Rail.tsx` rendered `MOCK_RAIL_COST.todaySpend.minor = 1240` ($12.40) and
`MOCK_RAIL_COST.weekSpend.minor = 8420` ($84.20) directly. The e2e test for the rail
(`work-surface.spec.ts`) checked that the rail section exists and that bet titles appear. It did not
assert that the dollar amounts matched an API response. Because the test and the runtime both used
the same `MOCK_RAIL_COST` fixture, they agreed on the values. The test passed; the hardcoded cost
display was invisible.

### 4. `SettingsPanel.tsx` — DEFAULT_SETTINGS from shared fixture

`SettingsPanel.tsx` used `DEFAULT_SETTINGS` (from `app-shell-data.ts`) for the initial profile
values (`name: "Founder"`, `email: "founder@hyperidle.com"`). The settings e2e test checked that
the settings overlay opens when the profile button is clicked and that the overlay closes when
dismissed. It did not check the values of the Name or Email inputs. The test and the runtime shared
the same fixture; both agreed the panel rendered correctly. The test passed; the hardcoded profile
data was invisible.

---

## Shared fixture import pattern

The unifying pattern across all four cases is: **the test and the runtime imported from the same
fixture module**. Removing the fixture from the runtime broke the tests, which was the first signal
that the runtime depended on mock data. Before the removal, the shared import created a false sense
of correctness — the tests passed because they encoded the same hardcoded values as the runtime,
not because the runtime was using real data.

This is the L16 retro pattern (CC-016): "removing a runtime fallback exposes ripple sites in tests
that imported the same fixture as runtime."

---

## Layout-not-data assertions

A secondary pattern: tests that check layout structure (does the element exist, does the section
render) rather than data content (does the element show the value that came from the API). Layout
assertions are useful for catching regressions in component structure. They are not useful for
catching data-source leaks. Both can be true at the same time — the tests were correct for what they
checked; they were not designed to check data provenance.

---

## Missing API-source verification

The test suite had no test that said: "I will configure the API mock to return a specific value, then
assert that the rendered output contains that specific value." Without this pattern, a component can
ignore the API entirely and still pass all tests. The M4 e2e suite (`mock-data-purge.spec.ts`)
introduces this pattern for the three failure modes: DOM literal sweep, rail cost values, and
settings profile. Any future regression — a developer accidentally re-introducing a hardcoded
fallback — will cause one of these tests to fail.

---

## Structural fix: M1 lint rules

Behavioral tests (does the component work?) are necessary but not sufficient to prevent data-source
leaks. The structural guard is a lint rule that fires when a runtime file imports from a fixture
module or declares a symbol with a forbidden prefix (`MOCK_*`, `DEMO_*`, `LEGACY_*`, etc.).

The `design/no-mock-data-import` and `design/no-mock-data-symbol` rules (introduced in M1,
promoted to `error` in M4) make data-source leaks a hard CI failure instead of a silent runtime
behavior. A developer who writes `import { MOCK_XYZ } from "../fixtures/xyz"` in a page component
gets an eslint error immediately — before the code ships to CI, before a reviewer sees it.

The M4 promotion from `warn` to `error` closes the remaining gap: warnings are advisory, errors
are blocking. A `warn`-level rule allows the import to ship; an `error`-level rule prevents it.

---

## Summary

| Gap | Why tests passed | Fix |
|---|---|---|
| Shared fixture import | Test and runtime used same mock source | `design/no-mock-data-import` at error |
| Layout-not-data assertions | Tests checked structure, not data source | M4 e2e API-source verification tests |
| Missing API-source verification | No test verified data came from the API | `mock-data-purge.spec.ts` AC-3a/b/c |
| Forbidden symbol names | `no-mock-data-symbol` was warn, not error | Promoted to error in M4 |
