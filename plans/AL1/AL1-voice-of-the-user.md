# AL1 — Voice of the User: What People Actually Rage About in Review

**Workpackage:** AL1 (Track AL — Review Experience) — companion to `AL1-review-experience-dossier.md` (same folder)
**Date:** 2026-06-14
**Method:** Fan-out forum mining (6 Explore agents) across Hacker News, GitHub Community Discussions (with reaction/upvote counts), the Figma community forum (vote counts), Microsoft/Google support communities, vendor feedback boards, dbt/Jupyter Discourse, and high-engagement blog rants — **plus** founder-supplied Reddit material (`reddit-code.md`, `reddit-design.md`, `reddit-docs.md`).
**Status:** Research input only — verbatim user sentiment, not a design.

> **Why this doc exists.** The first dossier was built from official docs and vendor pages — what tools *claim*. This one is the opposite: what users *vent*, ranked by how many people upvoted the pain. The founder's headline question — "what breaks when an agent edits hundreds of files?" — is **§4**.

> **Confidence note up front (read this).** Three tiers, used throughout:
> - **HARD** — GitHub/Figma/HN threads with visible, checkable engagement counts. Trust the number.
> - **DIRECTIONAL** — viral blog rants + vendor statistics (CodeRabbit/LinearB/Sonar). Real sentiment, but vendor data is marketing; not independently verified.
> - **WEAK / NEEDS-SANITY-CHECK** — the `reddit-*.md` files are outputs of **Reddit's built-in AI chatbot (Reddit Answers)**, which *synthesizes across many threads*. Its "quotes" are recombined, unattributable, carry **no upvotes and no permalinks**, and may be paraphrased. Treated below **only** as corroboration of HARD sources or as flagged hypotheses — never as standalone evidence. §5.5 does the explicit cross-check.

---

## 1. The one-paragraph takeaway

Code review is mature **for the world it was built for** — a human writes a focused change, another human reads it. That world is gone. The loudest, most-upvoted, most-viral theme across every forum: **agents generate code faster than humans can review it, and the diff alone is no longer enough** — reviewers can't see *why* the agent did what it did, can't trust that green tests mean correct, and are drowning in volume. Underneath that, the *mechanical* complaints are identical across domains: **anchored comments break when content moves**, **resolve/outdated state is untrustworthy**, **notifications are noise**, **big changes are unreviewable**. HyperIdle's thesis — review built natively for agent output, pulling the human in only where it matters — lands on the loudest unmet need in the space.

---

## 2. Ranked rage list (cross-domain, by engagement) — HARD + DIRECTIONAL

Numbers are what agents observed on-page. Vendor-blog statistics are DIRECTIONAL (§7).

| # | Pain (verbatim where short) | Domain | Engagement | Tier | Source |
|---|---|---|---|---|---|
| 1 | "Improved Files Changed experience" — review-UI friction | Code | **1,141 reactions, 3,106 comments** | HARD | [GitHub #163932](https://github.com/orgs/community/discussions/163932) |
| 2 | "Comment on / suggest changes to unedited lines" | Code | **939 reactions** (828👍) | HARD | [GitHub #4452](https://github.com/orgs/community/discussions/4452) |
| 3 | Stacked PRs — "what's better than a huge PR? a stack of small ones" | Code | **516 HN points, 282 comments** | HARD | [HN #44968319](https://news.ycombinator.com/item?id=44968319) |
| 4 | "Code review can be better" — feedback comes too late | Code | **391 HN points, 242 comments** | HARD | [HN #44967469](https://news.ycombinator.com/item?id=44967469) |
| 5 | Notebook VC — ".ipynb JSON diff/merge is ugly… nearly impossible to review" | Data | **337 HN points** | HARD | [HN #18337112](https://news.ycombinator.com/item?id=18337112) |
| 6 | "No easy way to view all unresolved conversations" | Code | **266 reactions, open since 2021** | HARD | [GitHub #7638](https://github.com/orgs/community/discussions/7638) |
| 7 | Figma comments don't stay pinned (incl. nested) — "hundreds of floating comments… impossible to track" | Design | **101 upvotes; sibling 163 replies, 26k views** | HARD | [Figma #17753](https://forum.figma.com/suggest-a-feature-11/keep-comments-pinned-to-design-elements-including-nested-17753) |
| 8 | "Don't dismiss approvals from code-owners whose files didn't change" | Code | **96 reactions, open since 2022** | HARD | [GitHub #38806](https://github.com/orgs/community/discussions/38806) |
| 9 | "File comments all get outdated when you push anything" | Code | **96+ reactions, 4-yr thread** | HARD | [GitHub #86527](https://github.com/orgs/community/discussions/86527) |
| 10 | Track-Changes + OneDrive co-edit — "freezes after almost every sentence, 10–15s" | Doc | **90+ "have this question"** | HARD | [MS Q&A #5118017](https://learn.microsoft.com/en-us/answers/questions/5118017/) |
| 11 | Notebook rich diff is read-only — "Why is this not prioritized 3 years in?" | Data | 3-yr escalation | HARD | [GitHub #37376](https://github.com/orgs/community/discussions/37376) |
| 12 | Figma can't reattach orphaned comments — "a critical problem" | Design | **35 upvotes** | HARD | [Figma #4931](https://forum.figma.com/t/make-it-possible-to-reattach-unattached-comments/4931) |
| 13 | "Add suggestion" batch button removed for Copilot — "The button is gone. Just… gone." | Code | **40👍** | HARD | [GitHub #178866](https://github.com/orgs/community/discussions/178866) |
| 14 | Word deletes the comment when its anchor text is edited (2018→2025) | Doc | 7-yr thread | HARD | [MS Q&A #5416726](https://learn.microsoft.com/en-us/answers/questions/5416726/) |
| — | "I am not maintaining software anymore — I am moderating an AI spam filter. And I am doing it for free." | Agent | viral | DIRECTIONAL | CodeRabbit blog |
| — | "A slop PR might refactor a function to look 'cleaner' while silently changing its behavior." | Agent | viral | DIRECTIONAL | [Sam Saffron](https://samsaffron.com/archive/2025/10/27/your-vibe-coded-slop-pr-is-not-welcome) |

**Signal:** the top of the list is **review-UI friction + unreviewable bulk** (1–5); the recurring wounds are **orphaned/outdated anchored comments** (7, 9, 12, 14) and **untrustworthy resolve state** (6). Basics, unsolved, for years.

---

## 3. Most-upvoted feature requests (HARD)

| Ask | Votes | Status | Source |
|---|---|---|---|
| Improved "Files Changed" review UX | 1,141 | shipped Jan 2026 | [#163932](https://github.com/orgs/community/discussions/163932) |
| Comment/suggest on unedited lines | 939 | shipped Sep 2025 | [#4452](https://github.com/orgs/community/discussions/4452) |
| Native stacked PRs | 516 HN pts | shipped ~Apr 2026 | [HN #44968319](https://news.ycombinator.com/item?id=44968319) |
| View all unresolved in one place | 266 | open since 2021 | [#7638](https://github.com/orgs/community/discussions/7638) |
| Selective CODEOWNERS approval dismissal | 96 | open (GitLab has it) | [#38806](https://github.com/orgs/community/discussions/38806) |
| Keep Figma comments pinned (incl. nested) | 101 | open 2+ yrs | [Figma #17753](https://forum.figma.com/suggest-a-feature-11/keep-comments-pinned-to-design-elements-including-nested-17753) |
| Native cell-level comments + suggest on notebooks | 3-yr campaign | open | [#37376](https://github.com/orgs/community/discussions/37376) |
| Notion suggesting/track-changes mode | long-demanded | partial Jul 2024 | [Notion notes](https://www.notion.com/releases/2024-07-29) |
| IDE-native PR review (Cursor) | 3 requests | open | [Cursor #133898](https://forum.cursor.com/t/code-review-like-in-vs-code/133898) |

**Read:** GitHub is shipping the *async-workflow* asks; the *anchoring / resolution / approval-granularity* asks and **everything agent-specific** remain open. Agent-review demand isn't on vote boards yet because it's still being *vented*, not *spec'd* — pre-feature-request, which is exactly where a new product wins.

---

## 4. The nitty-gritty: reviewing an agent that edited hundreds of files

When the change is no longer "a human wrote 200 focused lines" but "an agent rewrote 63 files / 9,000 LOC," the patterns that made review work **invert**.

### 4.1 The diff is no longer the unit of trust — reasoning is missing
- *"AI-generated code spans 9000 LOC, 63 new files, including a DSL parser… the 'author' has basically no idea what the code even does."* — [Ask HN](https://news.ycombinator.com/item?id=45744209) (HARD)
- *"Reviewing AI code requires reconstructing reasoning from output, making it harder than writing it yourself."* — Evil Martians (DIRECTIONAL)
- Reviewers ask *"why this approach?"* and get *"let me check"* (= let me re-prompt). — dev.to (DIRECTIONAL)
- **Corroborated by Reddit (WEAK):** *"the prompt is the real unit of review, not the diff"* / *"reviewing against the original spec, not the implementation."* See §5.5 — this theme is *independently* backed by harder sources (arXiv "intent contracts", Google Cloud "structured language to express intent", Jules/Devin plan-review), so the **theme is credible even though the Reddit phrasing isn't citable.**

→ **White-space #1 (main dossier):** structured, searchable agent **intent** on the diff.

### 4.2 Passing tests ≠ correct — "almost right, but not quite"
- *"45% cite AI solutions that are 'almost right, but not quite'"* — Sonar/Stack Overflow via Builder.io (DIRECTIONAL)
- *"refactor a function to look 'cleaner' while silently changing its behavior… add error handling that swallows exceptions… 'fix' a race condition by adding a lock that introduces a deadlock."* — [Sam Saffron](https://samsaffron.com/archive/2025/10/27/your-vibe-coded-slop-pr-is-not-welcome) (DIRECTIONAL, viral)

→ review must surface *behavioral* change/risk, not just textual diff.

### 4.3 Volume moved the bottleneck from writing to reviewing
- *"AI didn't remove the bottleneck, it just moved it… to reviewing, validating, integrating, and deciding what actually deserves to ship."* — Ask HN (HARD-ish)
- *"You should spend 5–15× the time the model takes to implement… on reviewing."* — [HN #47325104](https://news.ycombinator.com/item?id=47325104) (HARD)
- Projects banned AI PRs: **`cryptography`, curl, Ghostty, tldraw.** — Signadot/Medium (DIRECTIONAL)
- **Reddit corroboration (WEAK):** *"we're now making PRs faster than anyone wants to review it… too much code to review"* and *"There is no way to manually review more code at the same pace."* — consistent with the HARD bottleneck data.

→ **White-space #2:** semantic risk routing — pull the human in only where it matters.

### 4.4 What reviewers beg for (ranked by frequency across threads)
1. **Risk-based highlighting** — "just show me the dangerous parts"; auto-approve low-risk, escalate high-risk.
2. **Intent/reasoning visible *before* the code** — rationale, alternatives, confidence.
3. **Enforced smaller chunks** — reject/split oversized PRs.
4. **Proof of understanding before merge** — author/agent must be able to explain it.
5. **Deterministic gates first, humans last** — lint/secrets/obvious bugs in CI; humans do logic/intent.
6. **Plan/intent review before execution** (praised in Jules/Devin).
7. **Per-decision (not per-PR) approval.**

> The gap between what tools ship (inline comments on a finished diff) and what reviewers beg for (intent + risk routing + per-decision gating) **is** HyperIdle's product.

---

## 5. Per-domain voice (condensed, strongest HARD/DIRECTIONAL quotes)

**Code (human-authored baseline).** Big PRs unreviewable — *"No one can seriously review 2000 lines in one sitting"*; optimum 100–300 LOC; the fix everyone converges on is smaller/stacked PRs (516 HN pts). Outdated-comment workaround is the tell: users *abandoned* file comments — *"I've gotten into the habit of commenting on the top line… [file comments] almost always create a lot of repeated work."* Notification noise: *"a huge source of absolutely useless noise."* Approval theater: *"Most reviews don't review anything. They perform compliance."* Praise → Graphite inbox + stacking; Reviewable *"per-file tracking is the killer feature."*

**Design.** Anchoring is THE pain: *"half of the board is full of 'orphaned' comments that nobody knows what they belong to."* Data loss: *"~50% of the time… pressing enter… deletes the comment."* The contrast that proves the point — **Frame.io timecode comments are loved**: *"No more guessing which part of the video a reviewer may be giving a note on."* → robust, content-following anchors are a *beloved* differentiator; coordinate anchors are hated.

**Document/marketing.** Word's anchor-deletion bug forces a brutal workaround: *"copying the current document with a new version number… each time… tedious and open to all sorts of mistakes"* (live since 2018). Suggesting mode is the *loved* primitive — *"editors everywhere rejoicing"* — but **Notion lacked it for years** (partial fix Jul 2024). Approval-ops: the *"Final_Final_v3"* version-chaos joke; *"feedback spread across Google Docs, Slack, emails, and spreadsheets [makes it] nearly impossible to track."*

**Data/notebooks (thinnest, angriest).** JSON diff hell (337 HN pts); GitHub rich diff read-only and they're furious — *"It's 2025 now."* Data-blind review: *"the code itself is like a description of a picture… doesn't show which downstream tables might be affected"* (Recce). Loved: ReviewNB, jupytext, Recce data-diffs.

### 5.5 Reddit (WEAK — sanity-checked against harder sources)

The `reddit-*.md` files are **Reddit-Answers AI summaries** (synthesized, unattributable, no upvotes). I treat each claim as a *hypothesis* and check whether a HARD/DIRECTIONAL source backs it:

| Reddit claim (illustrative, not citable) | Backed by a harder source? | Verdict |
|---|---|---|
| *"The prompt is the real unit of review, not the diff."* | Yes — arXiv "intent contracts," Google Cloud "structured language to express intent," Jules/Devin plan-review | **Credible theme** — strongest VoC validation of intent-based review |
| *"We're making PRs faster than anyone wants to review… too much code to review."* | Yes — HN bottleneck threads, 5–15× quote, project AI-bans | **Credible** |
| Cross-model review: *"if Claude wrote it, I review with Cursor… the second model catches things the first normalised away"*; run PRs through N models *"so disagreement surfaces."* | Partial — matches main-dossier "heterogeneous, non-closed-loop review" white-space; no HARD thread captured | **Plausible, unverified** — worth a real-thread pull |
| *"if you can't explain why an AI suggestion matters in your own words, don't post it."* | Matches "proof of understanding" theme (HN) | **Credible as norm, not as quote** |
| Design: *"comments barely 'stick'"*; only two states active/resolved, wants more | Yes — Figma forum HARD data (101 votes) | **Credible** (use the Figma source, not Reddit) |
| Design (NEW): clients now paste **AI-generated feedback** that *"refers to things that don't really exist in the design."* | Not in HARD set | **Unverified but interesting** — reviewer-side AI-noise; flag for follow-up |
| Docs: *"sick of AI slop being used as a cover for 'work'… no one has reviewed it and I'm not reviewing it."* | Matches slop-PR DIRECTIONAL rants | **Credible sentiment** |
| Tool name-drops (Greptile "best", Qodo, CodeRabbit "excellent") | Vendor-shaped; no counts | **Discard as ranking** — popularity unverifiable via this source |

**Net:** Reddit Answers added **one genuinely new lead** (clients submitting AI-generated *review feedback* that references nonexistent elements) and otherwise **echoed** the hard-sourced themes — useful as corroboration, not as evidence. Do not quote it as primary.

---

## 6. How the voice maps to the white space (bridge to the dossier)

| Users rage about / beg for | White-space item (dossier §7) |
|---|---|
| "Reconstructing reasoning from output is harder than writing it" + "prompt is the unit of review" | #1 Structured, searchable agent intent on the diff |
| "Just show me the dangerous parts" / approval fatigue / spam-filter burnout | #2 Semantic risk routing |
| Plan-review praise (Jules/Devin) + per-decision approval + cross-model disagreement | #3 Live-observe → steer → async-review continuum (+ heterogeneous review) |
| "The author has no idea what the code does" / "did it solve the problem?" | #4 Spec-to-output traceability |
| Orphaned/outdated comments (Figma/Word/GitHub) vs. Frame.io praise | Robust content-following anchoring (a *loved* differentiator) |
| "View all unresolved in one place" / Graphite inbox praise | Unified, state-bucketed review inbox |

Every hypothesized differentiator has loud user-pain behind it. The voice **sharpens** the dossier: lead with **risk routing** (most viscerally felt) and **intent-on-the-diff / prompt-as-unit** (most-cited missing thing, and now independently echoed by practitioners).

---

## 7. Sourcing confidence & gated forums (where founder access helps)

**Tiers** — HARD (checkable counts: GitHub/Figma/HN/MS-Google threads) · DIRECTIONAL (viral rants + vendor stats — sentiment, not fact; CodeRabbit/LinearB/Sonar numbers come from vendors selling the fix) · WEAK (Reddit-Answers AI summaries — corroboration only, §5.5).

**Still under-covered — founder pulls would materially help:**
1. **Reddit *threads* (not Reddit Answers)** — the agents got little; the chatbot summaries are no substitute. Logged-in pulls from **r/ExperiencedDevs, r/cursor, r/ClaudeAI, r/ChatGPTCoding, r/programming** (search: `reviewing AI code`, `huge PR`, `slop`, `rubber stamp`) sorted Top→Year, capturing **quote + upvotes + permalink**, would convert the WEAK tier into HARD evidence — highest-yield addition.
2. **Vendor Canny/roadmap boards (gated):** Graphite, CodeRabbit, Linear vote totals.
3. **Notion feedback board** — gated.
4. **Cursor forum** — some vote counts need login.
5. **Private Slacks/Discords** — dbt Community Slack, data/ML Discords.
6. **One NEW lead to chase:** clients submitting **AI-generated review feedback** that references nonexistent elements (surfaced only via Reddit Answers — needs a real thread).

---

## 8. Bottom line for the `/concept` act

The forums say, with receipts, that **review is broken exactly where HyperIdle wants to win**: reviewing work you didn't write, at a volume you can't read, from a diff that hides the reasoning. Table-stakes (robust anchoring, trustworthy resolve, state-bucketed inbox, real suggestions) are hated where done badly — so do them *well* — but the **defensible, unowned, viscerally-demanded ground** is: **intent-on-the-diff (prompt-as-unit) + risk-based "pull me in only where it matters" + plan/per-decision review for agent work.** That is the founder's USP, and the voice of the user validates it.

---

*Companion to `AL1-review-experience-dossier.md` (same folder). Raw inputs: `reddit-code.md`, `reddit-design.md`, `reddit-docs.md` (WEAK tier, §5.5). Research input for the founder-led `/concept` act — not a design.*
