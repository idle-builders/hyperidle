---
name: write-docs
description: "Write user-facing documentation optimized for the reading funnel — attention capture, scanning, progressive insight delivery, and activation. Backed by NNG eye-tracking research, Chartbeat engagement data, and controlled A/B studies on web writing."
argument-hint: "[workpackage-id or doc-path]"
user-invocable: true
min_tool_calls: 15
---

# Write Docs — Reading-Funnel-Optimized Documentation

Write or revise user-facing documentation (product pages, guides, feature docs) so every page works as a **reading funnel** — capturing attention in seconds, delivering insights progressively, and converting scanners into active users.

This skill applies to writing AND reviewing documentation. It is backed by empirical research, not opinion.

## The Reading Funnel

Documentation is a funnel. Every page loses readers at each stage. The writer's job is to minimize drop-off at each gate.

```
LAND (0-3s)     → "Am I in the right place?"     → 50% bounce if no match
SCAN (3-10s)    → "Does this have what I need?"   → 70% gone if no value signal
EVALUATE (10-30s) → "Is this worth my time?"      → 80% gone if no concrete proof
ENGAGE (30s-2m) → "Can I use this right now?"     → Reader commits to a section
ACTIVATE (2m+)  → "What do I do next?"            → Reader converts to user
```

**The critical gate is 10 seconds.** Users leave or stay within the first 10 seconds (NNG, n=205,873 pages). Pages that survive initial scrutiny hold attention for 2+ minutes. Everything before 10 seconds is a retention problem; everything after is a comprehension problem.

**79% of users scan, not read** (NNG, consistent 1997-present). Design for scanners first, readers second.

**Users read at most 28% of words on a page; 20% is more likely** (NNG, n=45,237 page views). Every word must earn its place.

---

## The 15 Principles

These are specific, measurable rules. Not guidelines — rules. Each has an empirical basis.

### Structure

**P1 — First insight in 10 seconds.** The opening 50-80 words must answer "what is this" and "why should I care." No preamble, no history, no "in this document we will." Lead with the answer.

*Basis: NNG — probability of leaving highest in first 10s. At 150 WPM technical reading speed, 10 seconds ≈ 25 words of actual reading. The first 50-80 words must be scannable to that point.*

**P2 — Inverted pyramid.** Conclusion first, then supporting detail, then background. The most important information is at the top of every page and every section. A reader who stops at any point has gotten the most valuable content available to them.

*Basis: NNG inverted pyramid study — comprehension improves when key facts precede context.*

**P3 — One heading per 150-200 words.** Headings are the primary scan target (Layer-Cake pattern is "by far the most effective scanning pattern" — NNG). Each heading must standalone as an information-scent signal. A reader scanning only headings should understand the page structure.

*Basis: NNG eye-tracking — Layer-Cake pattern fixates on headings/subheadings. F-pattern (worse) emerges when headings are absent or vague.*

**P4 — Maximum 4 concepts per section.** Working memory holds ~4 chunks (Cowan 2001, revising Miller). Each section introduces at most 4 new ideas, then grounds them with an example or summary before proceeding.

*Basis: Cowan's revision of Miller's Law — short-term memory capacity is 3-5 chunks, not 7±2.*

**P5 — Progressive disclosure in 3 layers max.** Summary (visible) → detail (one click/scroll) → reference (linked). Never nest deeper than 3 levels.

*Basis: Interaction Design Foundation research on progressive disclosure. Deeper nesting increases cognitive load and abandonment.*

### Sentences and Paragraphs

**P6 — Sentences average 14-20 words.** At 14 words, comprehension is 90%. At 43 words, comprehension drops below 10%. No sentence exceeds 35 words.

*Basis: American Press Institute study of 410 newspapers. Directionality confirmed by modern readability research (Siteimprove, Hemingway).*

**P7 — Paragraphs under 100 words (3-4 sentences).** Web paragraphs over 150 words are too long for screen reading. Short paragraphs create whitespace that signals approachability. 81% of users look at the 1st paragraph; only 32% look at the 4th (NNG).

*Basis: NNG paragraph-position attention study. Cross-referenced with Vayce, SitePoint web writing research.*

**P8 — Front-load information-carrying words.** Users scan the first 2-3 words of headings, list items, and paragraph openings (F-pattern). Put the meaningful noun or verb first. "Create a team" not "How to go about creating a team." "Bets are time-boxed" not "One of the key concepts in HyperIdle is the bet."

*Basis: NNG F-pattern eye-tracking — fixation density is highest on first 2 words of each line.*

### Visual Density

**P9 — Code or visual within first 2 screenfuls.** The first two screenfuls capture 74% of viewing time (NNG). A code example, diagram, or table must appear before this threshold. For product docs without code, use a concrete scenario, comparison table, or structural diagram.

*Basis: NNG scrolling study — first two screenfuls get 74% of viewing time; first screenful alone gets 57%.*

**P10 — Every key concept gets a concrete aid.** Text + visual yields 65% retention at 3 days vs. 10% for text alone (Medina, dual-coding theory). The aid can be: code block, diagram, table, screenshot, or worked example. Never rely on prose alone for a concept the reader must remember.

*Basis: Picture superiority effect (Medina/Brain Rules). Developers with comprehensive code examples were 73% more effective (arXiv study on crypto APIs).*

**P11 — Bullet lists for 3+ parallel items.** Users gravitationally fixate on bulleted lists (NNG). Lists compress scanning time and signal structured information. Use numbered lists only for sequential steps.

*Basis: NNG — bulleted list fixation rates exceed inline prose by significant margins across multiple eye-tracking studies.*

### Language

**P12 — Zero promotional language.** Objective text improved usability 27% on its own; combined with concise + scannable, 124% improvement (NNG, n=51, A/B tested). Never describe features as "powerful," "seamless," "revolutionary," "intuitive," "easy," or "simple." State what it does. Show how it works.

*Basis: NNG's only controlled A/B study of writing style — the most rigorous evidence in this entire skill.*

**P13 — Concise above all.** Concise text improved usability by 58% — the single highest-impact writing change measured (NNG). Cut every word that doesn't carry information. If removing a sentence doesn't reduce understanding, remove it.

*Basis: Same NNG A/B study — conciseness had 2x the impact of scannability and 2x the impact of objectivity.*

### Activation

**P14 — Time to first working result under 5 minutes.** For getting-started and quickstart pages, the reader must achieve a working result within 5 minutes. Stripe's "7 lines of code," Vercel's one-click deploy, Supabase's instant database. The path must be obvious and unbroken.

*Basis: The 15-Minute Rule (daily.dev/industry heuristic). Stripe, Vercel, Supabase exemplars. Note: the specific threshold is an industry convention, not a controlled study.*

**P15 — Every page ends with a concrete next action.** After the content: "Next: [specific page]" or "Try it: [specific action]." Never end a documentation page in a dead end. The funnel continues.

*Basis: NNG — dead-end pages have significantly higher exit rates than pages with clear forward navigation.*

---

## Scoring Rubric (10 dimensions, 1-5 each)

Use this rubric when reviewing documentation. Score each dimension. Total: 50 max.

| # | Dimension | 1 (Poor) | 3 (Acceptable) | 5 (Excellent) |
|---|-----------|----------|-----------------|---------------|
| 1 | **10-Second Value** | Opens with background/history; value unclear after scanning | Value present but buried in first paragraph | First sentence answers "what" and "why"; scannable in 3 seconds |
| 2 | **Inverted Pyramid** | Most important info at bottom or scattered | Key info in first section but preceded by setup | Answer first, then detail, then background; no scrolling for the core point |
| 3 | **Heading Quality** | Headings vague ("Overview," "Details") or absent | Headings every 200+ words; partially descriptive | Heading every 150-200 words; each is a standalone information-scent signal; headings alone tell the page story |
| 4 | **Sentence/Paragraph Length** | Paragraphs 150+ words; sentences averaging 30+ | Paragraphs 100-150 words; sentences 20-25 words | Paragraphs under 100 words; sentences 14-20 words; no sentence over 35 words |
| 5 | **Concrete Aids** | No code/visuals/examples; wall of text | Aid present but below fold | Aid within first 2 screenfuls; every key concept has a visual, code, or worked example |
| 6 | **Cognitive Load** | Section introduces 5+ concepts without examples | 4-5 concepts per section with some examples | Max 4 concepts per section; each followed by concrete example or summary |
| 7 | **Language Objectivity** | Promotional ("powerful," "seamless"); marketing tone | Mostly objective with occasional subjective claims | Purely factual; states what it does, shows how it works; zero promotional adjectives |
| 8 | **Scannability** | No lists, no bold, no hierarchy below H1 | Some formatting aids; partial use of lists/bold | Bullet lists for parallel items; bold for key terms; tables for comparisons; strong visual hierarchy |
| 9 | **Progressive Disclosure** | Everything on one page, no layering; or critical info requires 4+ clicks | Some layering but inconsistent; some dead ends | 3-layer disclosure (summary → detail → reference); no dead ends |
| 10 | **Actionable Exit** | Page ends with no next step; dead end | Next step mentioned but vague ("see docs") | Concrete next action with link; "Try it" prompt; clear path to activation |

**Thresholds:**
- **40-50:** Publication-ready. Ship it.
- **30-39:** Minor revision needed. Specific dimensions below 3 need targeted fixes.
- **20-29:** Significant rewrite. Structural issues (pyramid, heading, disclosure).
- **Below 20:** Complete restructuring required.

---

## How to Use This Skill

### Codebase verification (MANDATORY for feature/UI documentation)

Before describing any feature, component, or interaction: grep the codebase to confirm it exists, read the source file, and verify the behavior matches what you're about to write. Documentation without codebase evidence is hallucination. Zero tolerance for fabricated features — if you can't find it in the code, don't document it.

### As a writer (designer or builder)

1. Read the target workpackage's ACs.
2. Before writing, plan the funnel: what's the 10-second value? What's the first concrete aid? What's the exit action?
3. Write the opening 50-80 words first. This is the most important text on the page.
4. Apply P1-P15 as you draft. Check sentence length as you go (count words in any sentence that feels long).
5. After drafting, self-score against the rubric. Any dimension below 3 needs revision before submission.

### As a reviewer

1. Score the document against all 10 rubric dimensions.
2. For any dimension scoring below 3: provide a specific finding with the principle number, location, and fix.
3. Total score must be ≥35 for approval (≥3.5 average per dimension).
4. The two most common failure modes:
   - **Buried lede** (P1/P2 violation): the opening paragraph is context/motivation instead of the answer.
   - **Wall of text** (P3/P7/P9 violation): long paragraphs, no headings, no visual aids.

### When applying to existing docs

Read each document. For each page:
1. Score it against the rubric (current state).
2. Identify the top 3 lowest-scoring dimensions.
3. Revise to address those dimensions specifically.
4. Re-score. All dimensions must be ≥3; total must be ≥35.

---

## Research Sources

This skill is grounded in empirical research, not opinion. Key sources:

- **NNG eye-tracking studies** (1997-present): F-pattern, Layer-Cake pattern, paragraph attention decay, scrolling behavior, reading percentages
- **NNG A/B study on writing style** (n=51): the only controlled experiment measuring impact of concise + scannable + objective writing (58%/47%/27%/124% usability improvement)
- **Chartbeat engagement data** (2023, network-wide): 28.1s average engaged time, declining year over year
- **Cowan's working memory revision** (2001): 3-5 chunks, not Miller's 7±2
- **American Press Institute sentence study** (410 newspapers): comprehension vs. sentence length curve
- **arXiv code examples study**: developers 73% more effective with comprehensive examples
- **Picture superiority effect** (Medina/dual-coding theory): 65% vs 10% retention at 3 days

Critical notes: NNG's n=51 A/B study is small but unique — no other controlled test exists. The "15-Minute Rule" is an industry heuristic, not empirical. Chartbeat data skews toward publisher/news sites, not documentation specifically. All findings should be treated as directional with high confidence, not precise measurements.
