# Z2 Review -- Round 3 (post-write-docs)

## Verdict: DONE

The write-docs pass improved scanning, tightened prose, and reduced word count without introducing factual regressions. One minor inaccuracy noted below (F-01) but it is non-blocking -- the intent is correct and the user will not be confused.

---

## What the write-docs pass changed

The diff (73 insertions, 83 deletions) is exclusively editorial:

- Renamed "Step N:" headings to "N." -- shorter, scans faster.
- Changed "What you should see:" to "Expected:" -- consistent, terser.
- Promoted the API-key-in-browser blockquote from Step 4 into its own `####` subsection with an anchor (`#api-key-in-browser-mode`), then linked to it from Step 7. This is a genuine improvement -- the prior version buried the browser workaround inside a blockquote that was easy to miss, and Step 7 duplicated the same information. The new structure is DRY and scannable.
- Removed "Now that you have HyperIdle running, explore by topic:" preamble above the What's Next table. The table speaks for itself.
- Trimmed filler throughout: "in your browser", "something like", "own arguments", "text area" -> "textarea", etc.
- No factual claims were added, removed, or altered (with one exception noted in F-01).

---

## Factual accuracy spot-checks (3 claims verified against code)

### Check 1: SetupFlow fields (guide lines 86-89 vs SetupFlow.tsx)

| Guide claim | Code | Verdict |
|---|---|---|
| "Your name (required)" | `label="Your name"` + `required` (line 175-181) | MATCH |
| "Anthropic API key (required)" | `label="Anthropic API key"` + `required` (line 187-196) | MATCH |
| "Project folder (optional)" | `Project folder (optional)` (line 206-207) | MATCH |
| "Click Start HyperIdle" | `Start HyperIdle` button text (line 271) | MATCH |
| "you land on Work > Portfolio" | `navigate("/work/portfolio")` (line 131) | MATCH |

### Check 2: BetCreateDialog fields (guide lines 132-136 vs BetCreateDialog.tsx)

| Guide claim | Code | Verdict |
|---|---|---|
| Team select shown only with multiple teams | `teams.length > 1` guard (line 138) | MATCH |
| Description required | `description.trim().length > 0` in canCreate (line 64) | MATCH |
| Title preview auto-derived | `deriveTitleFromPitch(description, "")` (line 62) | MATCH |
| Button text "Create" | `"Create"` (line 209) | MATCH |
| Result: draft card in portfolio | Bet created via POST /api/bets; default status is draft | MATCH |

### Check 3: Sidebar sections (guide lines 117-122 vs Sidebar.tsx)

| Guide claim | Code | Verdict |
|---|---|---|
| Three sections: Conversations, Work, Knowledge | Three SectionHeader components for "conversations", "work", "knowledge" | MATCH |
| Work expands to show Teams as sub-items | Team sub-items rendered when `activeView === "work"` (lines 243-279) | MATCH |
| Cmd+K search at bottom | Search hint div with "Search" + kbd "Cmd+K" (lines 322-333) | MATCH |
| Avatar opens Settings | Avatar button with `aria-label="Settings"` + `onSettingsClick` (line 341-351) | MATCH |
| Assistant button opens CoC overlay | Assistant button with `onCocClick` (line 364-378) | MATCH |

### Check 4: Seed data (guide line 51 vs seed.ts)

Guide: "seeds an example Team ('Nimmly') with three agents: Chief of Staff, Product Manager, and Builder."

Code: seed.ts inserts team "Nimmly" (line 66), then agents: "Nimmly Builder" (line 101), "Chief of Staff" (line 117), "Nimmly Product Manager" (line 157), plus 5 Practice Facilitators (line 171) and a "Propagation System" system user (line 130).

The guide's "three agents" is an acceptable simplification -- the Practice Facilitators and system user are not relevant to the getting-started flow. No regression from prior version.

---

## Findings

### F-01 MINOR: Hint text quote is slightly inaccurate

**Location:** Guide line 88 -- `The hint reads "Your key stays on this device."`

**Code:** `SetupFlow.tsx` line 194 -- `hint="Required. Your key stays on this device."`

The actual hint text is "Required. Your key stays on this device." -- the guide omits the "Required." prefix. This was present in the R2 version as well (the write-docs pass did not introduce it), but noting it for completeness. Non-blocking because the user will see the full hint and not be confused.

**Severity:** Minor. Cosmetic inaccuracy. The prior review (R2) did not flag this either.

---

## No factual regressions from write-docs pass

The diff was reviewed line-by-line. Every change is editorial (tighter phrasing, shorter headings, structural promotion of the API-key section). No factual claim was added, removed, or altered beyond the editorial tightening. The one inaccuracy (F-01) pre-dates the write-docs pass.

---

## Writing quality assessment

**Scanning:** Strong. The numbered headings ("1. Clone and install") scan faster than the prior "Step 1: Clone and install". Bold keywords at the start of prerequisite bullets. "Expected:" is terser than "What you should see:" and stands out as a scannable anchor.

**Progressive disclosure:** The API-key-in-browser subsection (lines 97-108) is well-placed -- it sits after the main setup flow for users who need it, out of the way for users who do not. The anchor link from Step 7 (`#api-key-in-browser-mode`) correctly connects the two without duplication.

**Actionable:** Every step has a concrete action, an expected result, and troubleshooting. No step leaves the user wondering "did it work?"

**Concision:** 1,158 words -- well under the 2,000 word limit. No filler. No marketing language. No superlatives.

**One concern:** The guide says "Take 60 seconds to orient" (line 114) -- this is a reasonable instruction but slightly prescriptive. Not a finding, just noting it.

---

## AC Assessment

| # | Acceptance Criterion | Status | Evidence |
|---|---|---|---|
| AC1 | New user reaches running instance within 10 minutes | PASS | Steps 1-4 are linear, commands are copy-pasteable, expected outputs match code. |
| AC2 | Guide reaches the "aha moment" quickly | PASS | Agent output visible by Step 7. No detours. |
| AC3 | Every step: action + expected result + troubleshooting | PASS | All 8 steps have all three elements. |
| AC4 | Zero-ops local setup (PGlite, API key documented honestly) | PASS | PGlite via `--profile laptop`. API key documented as required (matches SetupFlow validation). Spec says "no external API keys" but the product requires one -- guide documents reality honestly. |
| AC5 | User knows where to go next | PASS | "What's next" table links to 7 files, all verified present. |
| AC6 | Commands are copy-pasteable | PASS | All commands literal. `sk-ant-...` placeholder is standard and explained. |
| AC7 | Under 2000 words | PASS | 1,158 words. |

---

## Security lens

API key handling advice is safe:
- "Do not commit it to version control" (line 13, prerequisites)
- "do not commit the key" (line 108, browser mode section)
- `.env` file guidance references `.gitignore` (line 108)
- No key echoed in expected output blocks
- `type="password"` on the API key input in SetupFlow (line 191) -- not mentioned in guide, but the code is safe

---

## Adversarial lens (literal reader test)

**What would trip a new user?**

1. Step 2 says "npm run setup -- --profile laptop" but does not explain what "laptop" means vs other profiles. A curious user might wonder about "vps" or "cloud". The setup CLI supports `--help` but the guide does not mention it. -- Acceptable: the guide is for getting started, not for explaining all deployment modes.

2. Step 6 says "open the Bet card and change its status to active using the action menu" but does not describe how to open the card or where the action menu is. This was present in the prior version and was not flagged. -- Minor gap but acceptable for a getting-started guide; the user can figure out "click on the card" without instruction.

3. Step 7 cross-references the API key section with an anchor link `#api-key-in-browser-mode`. This assumes the markdown renderer supports anchor links. In raw GitHub markdown, this works. In VitePress (Z0), this also works. -- No issue.

---

## Simplification lens

Nothing further to simplify. The write-docs pass already did the simplification work -- the guide went from ~1,486 words (R2) to 1,158 words while preserving all content. The structure is flat (no nesting beyond the API key subsection), every section is short, and there is no redundancy.

---

## Slop lens

No AI slop detected:
- No marketing superlatives
- No "seamless", "powerful", "beautiful"
- No unnecessary comments or asides
- No hedging ("you might want to", "consider")
- No filler sentences
- Grep for "aha" returns zero results
- Grep for "simply", "just", "easily" returns zero results in the guide
