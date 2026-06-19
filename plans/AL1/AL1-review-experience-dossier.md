# AL1 — Competitive Research Dossier: Review Experiences

**Workpackage:** AL1 (Track AL — Review Experience)
**Date:** 2026-06-14
**Method:** Fan-out web research (5 domain agents) + adversarial fact-check pass on load-bearing claims, in the spirit of `/deep-research`. Every load-bearing claim below traces to a cited source; the most consequential were re-verified against primary sources (see §8).
**Status:** Research input only — **not a design**. It maps the field and names the white space. It does not prescribe HyperIdle's UI; that is the founder-led `/concept` act that follows.

---

## 0. How to read this (the 60-second version)

**The thesis the founder started with** — "none of the existing review experiences are great, and nobody does review of *agent-produced* work well" — survives contact with the evidence. Verdict: **confirmed, with nuance.**

- Review of **human-authored code** is a mature, converged space (GitHub/GitLab/Gerrit + a wave of AI first-pass reviewers). The interaction vocabulary is well-understood and largely solved.
- Review of **design / docs / marketing / data** each solved a *subset* of the same problem, with different anchor models and approval shapes. There is no cross-domain "review for anything" tool — every tool is domain-bound.
- Review of **agent-produced work** is genuinely unmapped. Tools either (a) review agent output as if it were a human PR (losing the agent's reasoning), or (b) gate individual *tool calls* live (not the *work product*). Nobody bridges live observation, async work-product review, intent/spec traceability, and risk-based attention routing into one experience.

**The handful of patterns worth adopting** (detail in §6): anchored comment + threaded resolve; the **comment-vs-suggestion** distinction (a suggestion is an applyable proposed edit, not just text); the **unified review inbox** (Graphite); **disposition-based resolution** (Reviewable) over binary approve/block; **real-time feedback visibility inside an async flow** (Filestage); and **plan-before-execution review** (Jules/Devin).

**The white space HyperIdle should own** (§7): the *integration layer* for reviewing agent work — structured, searchable agent **intent/reasoning** attached to the diff; **semantic risk routing** that pulls the human in only where guidance matters; a **live-observe → steer → async-review** continuum; and **spec-to-output traceability** ("did it actually solve the problem?").

---

## 1. The six dimensions (the comparison frame)

Every tool surveyed was read against the same six interaction dimensions, so domains can be compared apples-to-apples:

1. **Anchored commenting** — can feedback pin to a precise spot (diff line, paragraph, block, canvas region, video timecode, notebook cell)? How robust is the anchor when the underlying content changes?
2. **Threading** — threaded replies, resolve/reopen, mentions.
3. **Comment vs. suggestion** — is there a distinct *proposed edit* (applyable patch / track-change) separate from a plain comment?
4. **Approval gating** — how is approve / request-changes / block / sign-off modeled, and does it actually gate?
5. **Async vs. live** — async-by-default, live multiplayer, or a hybrid?
6. **Notification / attention routing** — how does the right reviewer get pulled in (review request, assignment, queue/inbox, @mention, SLA/escalation)?

---

## 2. Code review (the mature, converged baseline)

Tools: **GitHub**, **GitLab**, **Graphite**, **Gerrit**, **Reviewable**.

| Dimension | GitHub | GitLab | Graphite | Gerrit | Reviewable |
|---|---|---|---|---|---|
| **Anchor** | Line + side + multi-line range | Line + multi-line | Line (inline) | Line, per-commit, interdiff compare | **Commit-hash anchored** (survives rebase) |
| **Outdated handling** | Auto-collapse "outdated" | Auto-resolve (configurable) | Not public | Manual patch-set compare | Hash anchor → no "outdated" churn |
| **Threading / resolve** | Threads; manual hide | Threads; **open thread blocks merge** | Threads | Threads; no explicit resolve | **Disposition system** (see below) |
| **Comment vs. suggestion** | Distinct "suggestion", 1-click apply, batch-commit | Distinct suggestion, multi-line, batch | Nudges all comments toward "actionable suggestion" | No native suggestion (re-push) | Embeds code in discussion |
| **Approval gate** | Approve / Request changes (binary) + branch protection + CODEOWNERS | Approve / Request changes + approval rules + CODEOWNERS | Blocking-comment property + stack merge queue | **Voting labels −2…+2** (per-commit) | Blocking disposition gates |
| **Async/live** | Async (draft-before-submit) | Async (draft-before-submit) | Async + PR inbox | Async, email-driven | Async + **draft-presence** awareness |
| **Routing** | Review-requested, teams, mentions | Reviewers field + status | **PR inbox** ("needs your review") | Email + project watch; no inbox | Per-discussion "action needed" |

**What's notable / worth stealing:**

- **The comment-vs-suggestion split is load-bearing.** GitHub/GitLab let a reviewer propose an *applyable* edit, not just describe one. This is the single most-copied review primitive and is table-stakes. ([GitHub suggestions](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/reviewing-proposed-changes-in-a-pull-request), [GitLab suggestions](https://docs.gitlab.com/user/project/merge_requests/reviews/))
- **Reviewable's disposition model** replaces binary approve/block with semantic stance — *Discussing, Blocking, Working, Satisfied, Informing*. A discussion resolves when ≥1 participant is Satisfied/Informing **and** none are Blocking/Working. This is the most nuanced resolution model found anywhere and reads directly onto HyperIdle's five binding verdicts. ([Reviewable docs](https://docs.reviewable.io/discussions.html) — verified primary source)
- **Graphite's PR inbox** is the emerging answer to review-notification overload: reviews bucketed by state ("needs your review" / "waiting on author"), not a chronological feed. ([Graphite](https://graphite.com/guides/managing-pull-request-approvals-and-reviews))
- **Gerrit's per-commit voting (−2…+2)** is more expressive than binary but demands per-project config; it scales for strict-hygiene projects (Linux kernel) and is overkill elsewhere. ([Gerrit review UI](https://gerrit.cloudera.org/Documentation/user-review-ui.html))
- **Universal gap: no live co-review.** All five are fundamentally async (draft-then-publish). Reviewable's draft-presence is the closest thing to real-time awareness; true side-by-side pair review exists in none. This is a real opening.

---

## 3. Design / creative review

Tools: **Figma** (+ FigJam, Figma Buzz), **Frame.io**, **Filestage**, **Ziflow**, **Pitch**.

| Dimension | Figma | Frame.io | Filestage / Ziflow | Pitch |
|---|---|---|---|---|
| **Anchor** | Pin to top-level frame/component/group or region within — **not nested layers** | **Timecode + on-canvas pin** (video) | Spatial pin coordinates (numbered pins) | Slide-level only |
| **Markup** | No freehand in comments (annotations are a separate dev-handoff feature) | Drawing/lasso markup | Full markup: highlight, shapes, freehand | None |
| **Approval gate** | Branch review (Approve / Suggest changes, all-or-nothing); Figma Buzz can hard-gate export | Approved / Needs Work → new version resets approval | **Multi-stage sequential + parallel workflows**, auto-routing, version-lock | Slide status + assignment (task-like) |
| **Async/live** | Async comments **+ live multiplayer canvas** (cursor presence) | Async + real-time comment sync | Async + **real-time feedback visibility** | Live co-edit + async comments |
| **Routing** | Branch reviewer request + @mention | Reviewer/approver roles (Workfront) | Reviewer groups, SLA reminders, escalation | Slide assignment + @mention |

**What's notable / worth stealing:**

- **Anchoring extends beyond text/lines** — to canvas regions and, crucially, **video timecodes** (Frame.io). Any "review for anything" ambition needs an anchor model abstract enough to cover line / block / region / timecode / cell. ([Frame.io commenting](https://help.frame.io/en/articles/9105251-commenting-on-your-media))
- **Figma's anchor is more limited than its reputation** — comments attach to *top-level* elements and regions only, **not nested layers**. (Verified against [Figma help](https://help.figma.com/hc/en-us/articles/360041068574-Add-comments-to-files).) Lesson: precise anchoring is genuinely hard; even the category leader compromises.
- **Multi-stage approval workflows** (Filestage/Ziflow) are where formal review lives — sequential or parallel stages, conditional routing by asset type/risk, SLA escalation, version-locking so feedback only lands on the latest version. This is the most mature *workflow* layer in the whole survey and the part code tools lack. ([Filestage](https://filestage.io/blog/approval-workflow/), [Ziflow](https://www.ziflow.com/version-management))
- **Async + real-time feedback visibility** (Filestage): reviewers work on their own time but *see each other's comments live*, so conflicts resolve without a meeting. A pragmatic middle path between async and live.
- **Live editing is table-stakes for design tools but the review *comments* stay async** — the durable lesson is "live canvas, async durable feedback threads," not "everything synchronous."

---

## 4. Document / marketing review

Tools: **Google Docs**, **Microsoft Word**, **Notion**, **Filestage / Ziflow**, **Bynder Content Workflow** (ex-GatherContent).

| Dimension | Google Docs | MS Word | Notion | Filestage/Ziflow | Bynder |
|---|---|---|---|---|---|
| **Anchor** | Text selection / paragraph (**fragile**: shows "Original content deleted" when text removed) | Inline insert/delete marks (**comment deleted with its anchor text**) | Text/block inline | Spatial pin on file | Highlighted text |
| **Comment vs. suggestion** | **Suggesting mode** — deferred edits, accept/reject each or bulk | **Track Changes — the canonical model** | **Comment-only (no suggest mode)** | Comment-only | Comment-only |
| **Approval gate** | Implicit (owner accepts/rejects) | Implicit | None native | Multi-stage workflow + audit trail | Workflow steps (Author→Reviewer→Approver) |
| **Async/live** | Async + live co-edit | Async + live co-edit (365) | Async + live co-edit | Async + real-time visibility | Async + real-time |
| **Routing** | @mention + **assign comment** | Manual / none native | @mention | Workflow routing + SLA | @mention + workflow routing |

**What's notable / worth stealing:**

- **Track Changes / Suggesting mode is the gold standard for prose review** and is the same primitive as code "suggestions": a *proposed edit that is accepted or rejected*, distinct from discussion. Word set the model; Google Docs refined it (per-edit or bulk accept). **Notion notably lacks it** — a real functional gap for formal review. ([Google Docs suggesting](https://support.google.com/docs/answer/6033474), [Word track changes](https://support.microsoft.com/en-us/office/track-changes-in-word-197ba630-0f5f-4a8e-9a77-3712475e806a))
- **Anchor fragility is the universal Achilles' heel for text.** Google Docs degrades to "Original content deleted"; Word *deletes the comment* with its anchor text. (Both verified against primary sources.) This is precisely the failure mode HyperIdle's stable block IDs (`PlainPayloadWithBlockId`) are positioned to beat — robust anchoring is a credible differentiator, not a commodity.
- **Assigning a comment** (Google Docs) turns a comment into a tracked action item with an owner — a lightweight bridge between "discussion" and "task" that maps onto HyperIdle's bet/task model.
- **Content-ops tools route by workflow, not by @mention.** @mention is tactical (in-thread); workflow stages (Author → Reviewer → Approver → signed) are strategic. Serious review needs both.

---

## 5. Data / notebook review (the thinnest domain)

Areas/tools: **Jupyter on GitHub**, **ReviewNB**, **nbdime / jupytext**, **Hex**, **Deepnote**, **Databricks**, **Colab**, **dbt + GitHub + Recce**, **Looker/LookML**, **Tableau/Mode**.

**This is the least-mapped domain, and the absences are themselves the finding.**

| Capability | State of the art |
|---|---|
| **Notebook cell/output commenting** | **Broken on GitHub**: rich diff renders cells beautifully but *cannot anchor comments*; you must drop to raw JSON to comment, losing all rendered output. ([verified](https://blog.reviewnb.com/how-to-add-comments-to-notebook-diffs-github/)) Third-party **ReviewNB** fixes this (cell-level comments incl. outputs, threaded, resolvable) but is SaaS, GitHub/Bitbucket-only. |
| **The notebook-diff problem** | Notebooks are JSON (cells + outputs + execution metadata) → line diffs are noise. `nbdime` (structural diff/merge, local only) and `jupytext` (pair `.ipynb` with `.py` so you review the text) are the mitigations — but jupytext shifts review to `.py` and loses output semantics. |
| **Collaborative platforms** (Hex/Deepnote/Databricks/Colab) | Cell-level comments + threading + @mention + **live multiplayer editing**, but **no approval gating** and **no suggestion/propose-edit mode** — comments are discussion-only, bolted onto a live editor. |
| **Data/analytics PR review** | dbt/LookML are code → reviewed as GitHub PRs (suggestions + approval gates work). **Recce** adds *data diffs* (value/profile/lineage/top-k) to dbt PRs and can block merge — but diffs live in an attached state file, not inline in the PR. |
| **BI dashboards** | Weakest of all: Tableau has **no native chart-level commenting** (governance = project-promotion approval); Mode has comments but no gates; Looker review is code-only (LookML), no dashboard markup. |

**What's notable / worth stealing:**

- **The white space here is wide open** — no tool does suggestion-mode for notebook cells, approval gating in collaborative notebooks, or chart-level review for BI. If HyperIdle's agents produce notebooks/data work, the bar to clear is low.
- **Reviewing *outputs*, not just source, is the unmet need.** Notebooks/data exist to produce outputs (plots, tables, diffs); the review that matters is "did the *result* change correctly," which line-diff tools structurally can't express. Recce's data-diff-as-review-object is the most interesting primitive in the domain.

---

## 6. Patterns worth adopting (cross-domain synthesis)

Ranked by how load-bearing they are for "review for anything over agent work":

1. **Anchored comment + threaded resolve.** Universal across every domain. The anchor must be abstract enough to cover line / block / region / timecode / cell / data-diff. HyperIdle's stable block IDs are the right foundation.
2. **Comment vs. suggestion (applyable proposed edit).** The single most-copied primitive (GitHub suggestions = Word track-changes = Google suggesting mode). A "suggestion" is a patch the author one-click-applies, not prose. **Adopt this distinction explicitly.**
3. **Robust anchoring under change.** Every text tool fails here (Docs "Original content deleted", Word deletes the comment, Figma can't nest, GitHub goes "outdated"). Doing this *well* is a credible, defensible differentiator.
4. **Disposition-based resolution over binary approve/block** (Reviewable). Semantic stance (blocking / working / satisfied / informing) maps cleanly onto HyperIdle's five binding verdicts and is more honest than approve/request-changes.
5. **Unified review inbox** (Graphite). Bucket by state ("needs you" / "waiting on author"), not chronology. The answer to notification overload — and a natural home for agent-produced reviews across domains.
6. **Async + real-time feedback visibility** (Filestage). Reviewers stay async but see each other live; conflicts resolve without a meeting. The pragmatic async/live hybrid.
7. **Multi-stage approval workflow with routing + SLA** (Filestage/Ziflow/Bynder). Sequential/parallel stages, conditional routing by risk, version-locking, escalation, audit trail. The mature *process* layer that code tools lack.
8. **Plan / intent review before execution** (Google Jules, Devin). Review the agent's *plan* (files to touch, steps, tests) before it runs — the earliest, cheapest place to catch intent drift. Unique to the agent-tooling world and directly on-thesis.

---

## 7. The white space — reviewing *agent-produced* work

This is the section the founder cares about most, and it is where the survey turns from "well-trodden" to "genuinely empty."

**What the AI-tooling field actually has today:**

- A wave of **AI first-pass reviewers of human PRs** — GitHub Copilot code review (60M+ reviews, official), CodeRabbit, Graphite Diamond, Greptile, Qodo, Cursor BugBot, Sourcery. All converge on the *same* shape: inline GitHub comments, standard threading, advisory (non-blocking), toggle-apply suggestions. Notably, Copilot's review is **one-way** — human replies are *not visible to Copilot* (verified). These review *human* work with AI; they are not about reviewing *agent* work.
- **Human review of agent-authored PRs** — Copilot coding agent, Cursor agent, Devin, Google Jules, Claude Code. The human reviews a finished diff (Devin/Jules/Copilot) or approves inline during execution (Cursor/Claude Code). Jules and Devin add **plan-before-execution** review.
- **Live agent-session observability** — LangSmith, AgentOps, LangGraph Studio, AG-UI, Devin's session view. These *show* tool calls / reasoning / cost, but are observability, not *review*: you watch, you don't anchor feedback or gate the work product.
- **Tool-call approval** — Microsoft Agent Framework, OpenAI Agents SDK, Anthropic, n8n. This is a **solved** primitive: mark a tool approval-required, agent pauses, human approves/denies, agent resumes. But it gates *individual tool executions*, not the *work as a whole*.

**What NO surveyed tool does well** (the genuine white space):

1. **Async review with the agent's intent/reasoning attached.** By the time a human sees the diff, the agent's reasoning, discarded approaches, and confidence are gone. (Qodo's 2025 survey — verified — found **65% of developers cite *missing context* as the #1 problem with AI code, above hallucinations**.) Nobody makes the agent's reasoning *structured and searchable* next to the change ("line 47: chose X over Y because… confidence 85%").
2. **Attention routing by *semantic* risk, not *tool* risk.** Approval today is per-tool (yes/no). Nobody routes by decision riskiness — auto-approve a rename, escalate an architectural change or a data mutation, demand live testing for an external-API integration. Approval fatigue then destroys oversight ("illusion of oversight without substance"). **This is the most direct read on the founder's "pull the human in only where guidance matters" — and it ships in nothing.**
3. **A live-observe → steer → async-review continuum.** Tools offer *either* sync approval (Cursor/Claude Code — slow for long tasks) *or* async post-hoc review (Copilot/Devin — too late to intervene). None combine live observation + mid-flight steering without full restart + async work-product review with full reasoning context. (HyperIdle's existing live session dial-in is the front half of this, already built.)
4. **Spec-to-output traceability.** "Did the agent actually solve the problem?" Nobody maps spec/ticket requirements → agent's interpretation → which changes address which requirement → what was left unimplemented.
5. **Heterogeneous, non-closed-loop review.** Agent-reviews-agent shares the generator's blind spots. Nobody coordinates a *diverse* cohort (human + multiple distinct AI lenses) with consensus + human veto.
6. **Cost/confidence visible at the point of approval.** Humans approve without seeing what the session cost or where the agent was uncertain.

**The synthesis HyperIdle should own:** not a better comment box — the **integration layer** that makes agent work reviewable: structured searchable intent on the diff (#1), semantic risk routing that pulls the human in only where it matters (#2), and the live→steer→async continuum (#3). Items #1–#3 together exist in no shipped product. That is the differentiator, and it is consistent with what HyperIdle already has built (thread-native verdicts + live session dial-in).

---

## 8. Sourcing confidence & caveats (the web-wariness pass)

Per the CLAUDE.md rule (the web is full of marketing and wrong/AI-spam content), the most consequential and most "marketing-shaped" claims were re-checked against primary sources. Results:

| Claim | Verdict | Primary source |
|---|---|---|
| GitHub Copilot: 60M+ code reviews | **Verified (official)** | [github.blog](https://github.blog/ai-and-ml/github-copilot/60-million-copilot-code-reviews-and-counting/) |
| Copilot review replies not visible to Copilot (one-way) | **Verified (official docs)** | [GitHub docs](https://docs.github.com/copilot/using-github-copilot/code-review/using-copilot-code-review) |
| Qodo: 65% cite missing context as #1 AI-code problem | **Verified** | [Qodo report](https://www.qodo.ai/reports/state-of-ai-code-quality/) / [PR Newswire](https://www.prnewswire.com/news-releases/despite-78-claiming-productivity-gains-two-in-three-developers-say-ai-misses-critical-context-according-to-qodo-survey-302480084.html) |
| Google Docs "Original content deleted" on anchor loss | **Verified** | [Google Workspace issue #169](https://github.com/googleworkspace/cli/issues/169) |
| Word deletes comment with its anchor text | **Verified** | [Microsoft Q&A](https://learn.microsoft.com/en-us/answers/questions/5298432/) |
| Figma comments don't attach to nested layers | **Verified (official help)** | [Figma help](https://help.figma.com/hc/en-us/articles/360041068574-Add-comments-to-files) |
| GitHub rich notebook diff can't anchor comments (raw JSON needed) | **Verified** | [ReviewNB](https://blog.reviewnb.com/how-to-add-comments-to-notebook-diffs-github/) |
| Reviewable disposition-resolution rule | **Verified (official docs)** | [Reviewable docs](https://docs.reviewable.io/discussions.html) |
| arXiv papers 2603.21489, 2605.02273, 2601.17406 | **Verified — real papers** | arXiv |
| GitHub: 17M agent PRs/month (Mar 2026) | **Single reputable blog; no official GitHub stat** — treat directional, not precise | [danilchenko.dev](https://www.danilchenko.dev/posts/2026-04-11-github-ai-agents-pull-requests/) |

**Lower-confidence items, flagged inline above as needed:** Graphite's exact threading/outdated/blocking-vs-merge mechanics are not in public docs (vendor-blog only); the 17M-agent-PR figure is one observer's number; several content-ops capability claims (Bynder, Ziflow private stages) come from vendor pages, not independent verification. None are load-bearing for the white-space conclusion.

---

## 9. Access-gated follow-ups (NOT fabricated here)

These require founder-provided logins to observe directly. **No screenshots or UI specifics were invented for them** — they are listed as a collaborative deep-dive for the follow-on `/concept` act, exactly as the workpackage scopes:

- **Figma** branch-review + Figma Buzz approval UI (account-gated; behaviour confirmed from help docs only, not observed).
- **Frame.io** anchored-comment + approval flow (account + media required).
- **Filestage / Ziflow** multi-stage workflow builder, conditional routing, SLA/escalation config (paywalled; capabilities from vendor docs only).
- **Graphite** PR inbox + Diamond review UI, and its outdated/blocking/suggestion mechanics (login required; public docs thin).
- **Reviewable** admin resolution-workflow configuration (account required).
- **Devin** session view + Devin Review, **Cursor** agent diff-review, **Claude Code** Agent View — the live-observe/steer surfaces most relevant to HyperIdle (best evaluated hands-on, side by side).
- **Hex / Deepnote / Databricks** notebook comment + live-edit UX (account required).

**Recommended next move:** a founder + agent screen-share session driving Reviewable (disposition model), Graphite (inbox), Filestage (multi-stage workflow), and Devin/Cursor (agent review surfaces) live — the four richest exemplars — feeding directly into the `/concept` act on HyperIdle's review experience.

---

## 10. Full source list

**Code review:** GitHub [pull-request reviews](https://docs.github.com/articles/about-pull-request-reviews), [suggestions](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/reviewing-proposed-changes-in-a-pull-request), [REST review comments](https://docs.github.com/en/rest/pulls/comments), [protected branches](https://docs.github.com/en/github/administering-a-repository/about-required-reviews-for-pull-requests) · GitLab [merge requests](https://docs.gitlab.com/user/project/merge_requests/), [reviews](https://docs.gitlab.com/user/project/merge_requests/reviews/), [approval rules](https://docs.gitlab.com/user/project/merge_requests/approvals/rules/) · Graphite [approvals & reviews](https://graphite.com/guides/managing-pull-request-approvals-and-reviews), [blocking vs nitpicks](https://graphite.com/guides/blocking-comments-vs-nitpicks), [stacked PR review](https://graphite.com/docs/best-practices-for-reviewing-stacks) · Gerrit [review UI](https://gerrit.cloudera.org/Documentation/user-review-ui.html), [system design](https://gerrit-review.googlesource.com/Documentation/dev-design.html) · Reviewable [discussions](https://docs.reviewable.io/discussions.html)

**Design review:** Figma [comments](https://help.figma.com/hc/en-us/articles/360041068574-Add-comments-to-files), [manage comments](https://help.figma.com/hc/en-us/articles/360041547593-View-and-manage-comments), [branch review](https://help.figma.com/hc/en-us/articles/5693123873687-Review-branch-changes), [Buzz approvals](https://help.figma.com/hc/en-us/articles/39288847137815-Use-approvals-in-Figma-Buzz) · Frame.io [commenting](https://help.frame.io/en/articles/9105251-commenting-on-your-media), [comments panel](https://help.frame.io/en/articles/9105278-comments-panel-overview) · Filestage [approval workflow](https://filestage.io/blog/approval-workflow/), [annotations](https://filestage.io/blog/design-annotations/) · Ziflow [reviewing proofs](https://help.ziflow.com/en/articles/5792032-reviewing-proofs), [version management](https://www.ziflow.com/version-management) · Pitch [review & collaborate](https://help.pitch.com/en/articles/5695595-review-and-collaborate-on-presentations)

**Doc/marketing review:** Google Docs [suggest edits](https://support.google.com/docs/answer/6033474), [comments/mentions](https://support.google.com/docs/answer/6239410), [anchor bug #169](https://github.com/googleworkspace/cli/issues/169) · Word [track changes](https://support.microsoft.com/en-us/office/track-changes-in-word-197ba630-0f5f-4a8e-9a77-3712475e806a), [accept/reject](https://support.microsoft.com/en-us/office/accept-or-reject-tracked-changes-in-word-b2dac7d8-f497-4e94-81bd-d64e62eee0e8), [comment deletion Q&A](https://learn.microsoft.com/en-us/answers/questions/5298432/) · Notion [comments & mentions](https://www.notion.com/help/comments-mentions-and-reminders) · Bynder [content workflow](https://www.bynder.com/en/products/content-workflow/)

**Data/notebook review:** [GitHub rich notebook diff](https://github.blog/changelog/2023-03-01-feature-preview-rich-jupyter-notebook-diffs/) · ReviewNB [home](https://www.reviewnb.com/), [comments on diffs](https://blog.reviewnb.com/how-to-add-comments-to-notebook-diffs-github/) · [nbdime](https://nbdime.readthedocs.io/en/latest/), [jupytext](https://codecut.ai/jupytext-transform-notebooks-into-version-control-friendly-text/), [Jupyter notebook-diff JEP](https://jupyter.org/enhancement-proposals/08-notebook-diff/notebook-diff.html) · Hex [commenting](https://learn.hex.tech/docs/collaborate/comments) · [Databricks notebook collaboration](https://learn.microsoft.com/en-us/azure/databricks/notebooks/notebooks-collaborate) · dbt [model contracts](https://docs.getdbt.com/docs/mesh/govern/model-contracts) · Recce [repo](https://github.com/datarecce/recce), [PR comment template](https://reccehq.com/blog/dbt-data-pr-comment-template/) · Looker [CI/CD](https://cloud.google.com/looker/docs/looker-cicd-usage) · Tableau [governance](https://help.tableau.com/current/blueprint/en-us/bp_governance_in_tableau.htm)

**Reviewing agent work:** [GitHub Copilot code review docs](https://docs.github.com/copilot/using-github-copilot/code-review/using-copilot-code-review), [60M reviews (official)](https://github.blog/ai-and-ml/github-copilot/60-million-copilot-code-reviews-and-counting/) · [CodeRabbit](https://docs.coderabbit.ai/) · [Graphite Diamond](https://graphite.com/docs/diamond-review-comments) · [Greptile](https://www.greptile.com/docs/code-review/first-pr-review) · [Qodo](https://docs.qodo.ai/code-review), [State of AI code quality](https://www.qodo.ai/reports/state-of-ai-code-quality/) · [Cursor BugBot](https://cursor.com/help/ai-features/bugbot) · [Microsoft Agent Framework tool approval](https://learn.microsoft.com/en-us/agent-framework/agents/tools/tool-approval) · [Anthropic — building effective agents](https://www.anthropic.com/research/building-effective-agents) · [n8n human-in-the-loop](https://docs.n8n.io/advanced-ai/human-in-the-loop-tools/) · [Devin](https://devin.ai/) · [LangSmith](https://www.langchain.com/langsmith-platform) · arXiv [2603.21489](https://arxiv.org/abs/2603.21489), [2605.02273](https://arxiv.org/abs/2605.02273), [2601.17406](https://arxiv.org/abs/2601.17406) · [GitHub agent PRs (blog, directional)](https://www.danilchenko.dev/posts/2026-04-11-github-ai-agents-pull-requests/)

---

*Prepared for the founder-led `/concept` act on HyperIdle's review experience. Research input only — not a design.*
