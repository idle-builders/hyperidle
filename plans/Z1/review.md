# Z1 Review -- Product Story & Landing Documentation

**Verdict: NOT DONE**

Two acceptance criteria fail (AC3, AC5). The remaining six pass. The writing quality is strong -- the voice is direct, opinionated, and free of marketing slop. Structural issues are minor. The two failures are specific and fixable.

---

## AC Table

| AC | Criterion | Verdict | Evidence |
|----|-----------|---------|----------|
| AC1 | First-time reader can explain what HyperIdle does, why, how it differs | **PASS** | `what-is-hyperidle.md` covers the problem (current tools don't support agent teams), the answer (meta layer), three differentiators (teams persist, humans validate, knowledge compounds), the three layers, the Factory app, and the target audience. A reader finishing this document can articulate all three. |
| AC2 | Paperclip/agent-framework reader can articulate the difference | **PASS** | `human-ai-collaboration.md` "What this is not" section explicitly addresses "zero human companies," workflow orchestration, and humans doing agent work. `how-work-flows.md` "What HyperIdle does not have" section addresses no DAGs, no central planner, no crew-per-task. The differentiators are concrete and specific. |
| AC3 | Every core primitive introduced with a concrete example | **FAIL** | See Finding F-1 below. |
| AC4 | Human+AI collaboration model front and center | **PASS** | `human-ai-collaboration.md` is the third document, structurally prominent. Covers founders as decision-makers, agents as team members, facilitators as curators (three levels), autonomy levels L1-L4, the verdict grammar, and cost transparency. The judgment gradient is explicit: "This is how HyperIdle transitions from 'the founder is in every loop' on day one to 'the founder is only in the loops that matter' by month six." |
| AC5 | Covers features that exist today, distinguishes "available now" from "coming soon" | **FAIL** | See Finding F-2 below. |
| AC6 | No marketing superlatives, factual/specific/direct/opinionated voice | **PASS** | See Slop Lens results below. The writing is clean. Zero superlatives found. Claims are specific. Voice is consistently direct and opinionated ("This is intentional," "A bad fit: you want to automate a single workflow. Use n8n or Zapier."). |
| AC7 | Each document under 2000 words | **PASS** | Word counts: `what-is-hyperidle.md` = 1012, `how-work-flows.md` = 1665, `human-ai-collaboration.md` = 1406, `how-knowledge-compounds.md` = 1956, `index.md` = 287. All under 2000. `how-knowledge-compounds.md` is at 1956 -- tight but within limit. |
| AC8 | Cross-references consistent with architecture docs | **PASS with findings** | See Architecture Lens below. One minor inconsistency found (F-3), one terminology imprecision (F-4). No factual contradictions on core claims. |

---

## Findings by Severity

### Critical

None.

### Major

**F-1. AC3 FAIL: Several primitives lack concrete examples.** The AC requires "Every core primitive (team, bet, task, session, knowledge, routine, agent) introduced with a concrete example -- not just a definition." Several primitives are introduced with definitions and structural descriptions but no concrete scenario with named entities doing specific things.

Primitives with good examples (PASS):
- **Team** -- Nimmly team, Ambrovia team, Builder that shipped auth in January ships payments in March. Concrete, named, temporal.
- **Bet** -- Pitch lands on the Work view canvas, founder moves it to committed, cost cap of $800 USD. Concrete.
- **Session** -- Mika works on Nimmly payments, hits a Stripe fee question, hands off to a human. Concrete, named, behavioral.
- **Knowledge** (L3 example) -- Builder on Nimmly discovers right chunk size for file uploads, Builder on Ambrovia gets it for free. Concrete.

Primitives missing concrete examples (FAIL):
- **Routine** -- `how-work-flows.md` lines 83-84 lists three trigger shapes as abstract patterns ("every Monday at 9am," "every time a landing page artifact ships," "every hour, check cost burn") but these are generic type descriptions, not a concrete example of a specific routine in action with a named agent and a named product. The Helena example on line 85 is better but still describes the mechanism (delegation, memory) rather than showing a routine's actual execution producing a result.
- **Agent** -- Agents are described by role (Builder, Growth Agent, Product Manager) but no single agent gets a concrete introductory example that shows what being an "agent as team member" looks like in practice. Mika appears in the Sessions section but not as an introduction to the agent concept itself. The `human-ai-collaboration.md` "Agents are team members" section (lines 11-12) is definitional, not example-driven.
- **Task** -- `how-work-flows.md` lines 37-53 describe tasks structurally (state list, done condition, cost cap, artifacts) but the only concrete example is "A task that builds the signup flow produces a code artifact. A task that writes the landing page copy produces a content artifact." These are artifact examples, not a concrete task example showing an agent picking up a specific task, working it, and completing it.

**Fix:** Add one concrete example per missing primitive. For Routine: "Helena, a Practice Facilitator, owns the 'weekly growth metrics review.' Every Monday at 9am, Helena checks what campaigns shipped last week across all products, compares conversion numbers against the growth practice benchmarks, and posts a summary to the Chief of Staff's thread. When Helena found that Ambrovia's email open rates dropped 15% after a subject-line change, she flagged it as a review item for the founder." For Task: show a specific named agent picking up a named task on a named bet. For Agent: a brief paragraph showing a Builder or Growth Agent acting autonomously as a team member (initiating a conversation, surfacing a problem).

---

**F-2. AC5 FAIL: No distinction between "available now" and "coming soon."** The entire documentation reads as if the system is fully operational. There is no indication anywhere that HyperIdle is pre-implementation (as stated in CLAUDE.md: "Status: Pre-implementation"). Every feature is described in present tense as if it exists and works today. The AC says "The documentation covers features that exist today, clearly distinguishing 'available now' from 'coming soon' where applicable."

The product docs describe: the Factory desktop app, the three views, the Rail, autonomy levels, cost caps, knowledge materialization, TOON encoding, routines, review threads, the attention score, practice meetings, the full knowledge lifecycle -- all in present tense with no caveat.

**Fix:** Add a brief status section to `what-is-hyperidle.md` (or to each document) that honestly states the project's current state. Options: (a) a "Current Status" paragraph at the end of `what-is-hyperidle.md` saying what exists today vs. what is being built, (b) a "Roadmap" note in `index.md`, or (c) inline markers like "(shipping Q3 2026)" where appropriate. The present-tense voice is fine for describing the design -- but there must be at least one clear statement that distinguishes the design from the running product, per the AC.

---

### Minor

**F-3. Terminology imprecision: "four zones" in `what-is-hyperidle.md` vs. architecture docs.** Line 49 says "The Factory is the single window where human oversight happens. It has four zones" and lists Conversations, Work, Knowledge, the Rail. The architecture doc (`one-app-two-form-factors.md`) defines four layout zones as IconRail, Submenu, Main Pane, Rail. The product doc's "four zones" are three logical views plus the Rail -- a different taxonomy from the architecture doc's four layout zones. Not a factual contradiction (it is describing different things), but the shared term "zones" creates ambiguity.

**Fix:** Change "four zones" to "three views and a sidebar" or "four areas" in the product doc to avoid overloading "zones."

---

**F-4. "Conversations" described differently between product doc and architecture doc.** `what-is-hyperidle.md` line 51 says "review threads and chat threads live" in Conversations. The architecture doc (`one-app-two-form-factors.md` line 14) says Conversations "opens whichever thread is selected" and is used "for review items, chat items, and human-initiated conversations equally, because they're all threads." The product doc is consistent but slightly narrower: it says "review threads and chat threads" but omits "human-initiated conversations" as a third category. This is minor but the architecture doc explicitly distinguishes three categories.

**Fix:** Add "and conversations the founder initiates" or similar phrasing to the Conversations bullet.

---

**F-5. `human-ai-collaboration.md` lists five binding verdicts but the architecture doc defines ten total actions.** Lines 47-51 list five binding verdicts (approve, approve with comments, request changes, edit, reject). Lines 52-53 mention non-binding actions (comment, inline comment, reply, snooze, escalate). The architecture source (`verdict-actions.md`) lists exactly 10: approve, approve-with-comments, comment, inline-comment, request-changes, edit, reject, reply, snooze, escalate. The product doc correctly presents these as two groups: "five binding verdicts" and "review actions that do not terminate the thread." However, the product doc says "five" non-binding actions (line 52: "comment, inline comment, reply, snooze, and escalate" = five), while the concept doc (section 1.6) says "Five are binding verdicts... Three are review actions... Two are sidecar operations" = 5+3+2 = 10 with a three-part taxonomy. The product doc collapses the three-part taxonomy into a two-part one (binding verdicts / non-binding actions). This is a reasonable simplification for a product doc but the count is inconsistent: the product doc implies 5 binding + 5 non-binding = 10, while the concept doc says 5 binding + 3 review + 2 sidecar = 10. Both arrive at 10 total, and both are internally consistent, so this is not a failure -- but it is worth noting that the product doc's grouping differs from the concept doc's canonical taxonomy.

**Fix:** No fix required. The simplification is appropriate for a product doc.

---

**F-6. `what-is-hyperidle.md` line 42 describes dependency direction as "the Meta Layer depends on the Agent Runtime."** This matches the architecture doc (`system-overview.md` line 56: "The Meta Layer depends on the Agent Runtime adapters"). However, the product doc's phrasing "The Human Interface depends on the Meta Layer, the Meta Layer depends on the Agent Runtime" is backwards from the usual way dependency is expressed in the architecture diagrams where "arrows point down" means the upper layer depends on the lower. The phrasing is technically correct as written. No fix needed -- noting for completeness.

---

## Lens Results

### 1. Architecture Lens (factual consistency)

**Three-layer model:** Product doc matches `system-overview.md`. Human Interface / Meta Layer / Agent Runtime. Strict downward dependency. Meta Layer does not call models or execute tools. PASS.

**Kernel/Fabric split:** `what-is-hyperidle.md` line 41 says "Kernel (stable protocols -- routing, persistence, events) and Fabric (volatile heuristics -- scoring, propagation, notifications). The kernel never imports from the Fabric." This matches `system-overview.md` line 58 verbatim. PASS.

**Five process primitives:** All five (Team, Bet, Task, Session, Routine) are present and described consistently with `the-five-primitives.md`. Team is product-bound, Bet has money appetite not duration, Task has decentralized decomposition, Session ends at context window compaction, Routine has three trigger shapes. PASS.

**Agent categories:** Two categories (Central, Product Team) described in `human-ai-collaboration.md`. Chief of Staff, Practice Facilitators, Product Managers align with `the-two-categories.md`. Product team roster (PM, Builder, Growth, Ops) matches. PASS.

**Knowledge layers:** Five layers L0-L4 described in `how-knowledge-compounds.md` match `the-five-layers.md`. Layer descriptions (Session/Task/Product/Practice/Factory), storage format (ephemeral/SQLite/md+SQLite/SQLite/markdown), cadence (minutes/per-task/per-cycle/weekly/monthly), human touch level -- all consistent. PASS.

**Canonical store:** One table, two projections described in `how-knowledge-compounds.md` matches `the-canonical-store.md`. The product doc correctly says "Every knowledge item has an ID, a layer, a scope, a status, a markdown body, and a confidence level." Note: `layer` is actually in the strategy extension table (`knowledge_strategy_fabric`), not the kernel `knowledge_items` table. The product doc's phrasing implies layer is a direct attribute of a knowledge item, which is a simplification. Not a factual error for a product doc (the layer IS associated with the item via the join), but imprecise at the schema level. Acceptable simplification.

**Knowledge lifecycle:** Six statuses (Captured, Provisional, Validated, Active, Stale, Archived) match `the-canonical-store.md` schema (line 18). Correctly omits NEEDS_HUMAN per the concept doc's recommendation. PASS.

**Autonomy levels:** L1-L4 per agent per skill, moves up over time, changes go through review threads. Matches `trust-building-slow-cumulative.md`. PASS.

**Verdict actions:** Five binding verdicts (approve, approve-with-comments, request-changes, edit, reject) match `verdict-actions.md`. PASS.

**TOON format:** Described as "~40% fewer tokens than JSON" in `how-knowledge-compounds.md`. Matches `the-five-layers.md` ("TOON gives ~40% fewer tokens than JSON"). PASS.

**Cost caps at three levels:** Agent, Team, Factory. Matches the architecture docs' WIP limit structure. PASS.

### 2. Design Lens (narrative structure)

**Concept introduction order:** The four documents follow a logical dependency chain: What (overview) -> How work flows (process) -> How humans and agents collaborate (trust) -> How knowledge compounds (knowledge). This matches the concept doc's recommended narrative structure. Each document is self-contained but builds on prior ones. PASS.

**Voice consistency:** All four documents maintain the same voice -- direct, declarative, opinionated. Sentences are short. Technical terms are introduced with context. The voice never shifts into marketing register or academic register. PASS.

**Opening hooks:** Each document opens with a clear statement of what it covers and why it matters. `how-knowledge-compounds.md` opens with "The tenth bet is faster than the first" -- a concrete claim that the document then explains. `how-work-flows.md` opens by listing the five primitives. These are effective. PASS.

**Cross-references:** Each document ends with links to the other two relevant documents. The `index.md` provides summaries of all four with links. Navigation is clear. PASS.

**Concept density:** `how-knowledge-compounds.md` is the densest document (1956 words, near the 2000 limit). It covers five layers, the canonical store, the lifecycle, the attention score, retros, practice meetings, and the Knowledge view. This is a lot of ground. The document handles it well by giving each section enough space, but it is tight. The practice meetings section (lines 94-103) could be cut if space is needed for other improvements.

### 3. Adversarial Lens

**The Skeptical Developer:** "How is this different from just... a project management tool with API integrations?" The docs address this directly in `what-is-hyperidle.md` ("Agent frameworks like CrewAI or LangGraph solve a different problem: they execute tasks") and in `how-work-flows.md` ("No workflows or DAGs"). The differentiators are specific enough to withstand scrutiny. However, a skeptic could ask: "If there is no central planner and agents decompose their own tasks, what prevents an agent from decomposing badly?" The docs mention the Product Manager integrates and reviews but do not describe what happens when decomposition fails. This is an edge the docs could be stronger on.

**The Paperclip Advocate:** "Your agents start at L1 and earn trust. That means for the first month, every action is human-approved. How is that useful?" The docs partially address this: "This is how HyperIdle transitions from 'the founder is in every loop' on day one to 'the founder is only in the loops that matter' by month six." But they do not address the bootstrapping problem directly. A Paperclip advocate would point out that their system is fully autonomous from day one. The docs would be stronger with one sentence acknowledging the ramp-up cost and why it is worth paying.

**The Auditor:** The docs claim "Agents can initiate conversations with founders" (human-ai-collaboration.md line 11). This is consistent with the architecture docs' thread model (agents create threads). Claim checks out. The docs claim "humans are identities in the same matrix as agents" (how-work-flows.md line 75). This is consistent with the architecture's identity model where users and agents share the same `users` table structure. Claim checks out.

### 4. Simplification Lens

**Potential cuts:**
- `how-work-flows.md` lines 26-28 repeat the money-not-duration point that was already made in the section heading and the first sentence. The `created_at`/`shipped_at` detail is architecture-level and could be cut: "A bet has a cost cap in real currency (for example, $800 USD). It never has a deadline or a sprint length." That sentence alone is sufficient.
- `human-ai-collaboration.md` lines 70-82 (the five artifact renderers section) is an architecture detail list. It describes internal renderer names (text_diff, content_preview, visual_comparison, action_summary, data_metrics). For a product doc, this level of detail is unnecessary. A sentence like "Review threads embed the artifact -- rendered as the reader will see it, whether that is a code diff, a landing page preview, a UI mockup comparison, a deployment summary, or a metrics report" would convey the same information in one-third the space.
- `how-knowledge-compounds.md` lines 94-103 (practice meetings section) describes a weekly propose/react/synthesize cycle. This is useful but could be shortened to a single paragraph without losing the key insight (knowledge flows without notifications because materialization loads it automatically).

**No dead sections.** Every section contributes to the narrative. The docs are already concise.

### 5. Slop Lens

**Marketing superlatives:** None found. Zero instances of "revolutionary," "groundbreaking," "cutting-edge," "seamless," "powerful," "robust," "state-of-the-art," or similar. PASS.

**Buzzwords:** "Meta layer" is used correctly and precisely (it describes what the system actually is). "Operating system" is used as a metaphor and explained immediately. No empty buzzwords. PASS.

**Vague claims:** One borderline case: "The tenth bet is faster than the first" (how-knowledge-compounds.md line 1). This is a strong claim, but the document then explains exactly why (accumulated practice knowledge, materialization, facilitation). The claim earns its confidence. PASS.

**AI tells:** No "simplified version," "for now," "TODO," "in this section we will," or other AI-writing markers. No unnecessary hedging. No filler. PASS.

**Generic AI hype:** No "AI is transforming how we work" or similar. The docs are specific about what HyperIdle does and do not make general claims about AI. PASS.

---

## Summary of Required Fixes

| ID | Severity | File | Fix |
|----|----------|------|-----|
| F-1 | Major | `how-work-flows.md`, `human-ai-collaboration.md` | Add concrete examples for Routine, Agent, and Task primitives per AC3. |
| F-2 | Major | `what-is-hyperidle.md` or `index.md` | Add honest status indication distinguishing design from running product per AC5. |
| F-3 | Minor | `what-is-hyperidle.md` | Change "four zones" to "three views and a sidebar" or similar to avoid terminology overload with architecture docs. |
| F-4 | Minor | `what-is-hyperidle.md` | Add human-initiated conversations to the Conversations bullet. |
