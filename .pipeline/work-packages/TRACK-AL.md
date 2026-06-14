# Track AL: Review Experience

Source: the kernel/strategy USP analysis of 2026-06-13 (`plans/reviews/kernel-strategy-usp-analysis.md`, founder-annotated) and the empirical verification of 2026-06-14. The founder's stated USP is a review experience that eclipses anything on the market — "review for anything," pulling the human in only where guidance matters. Verification confirms the foundation is real: thread-native review with five binding verdicts posts and resolves live, and live session dial-in (watch tool-calls / reasoning / cost while an agent works) is genuinely built. The gap is the async-polish layer that separates "good" from "best ever" — and, crucially, an honest admission that **no tool does this well today**, and that the non-code review space (design, marketing, docs, data) is unmapped territory for us.

**Why a separate track.** The founder asked for review work to be its own worktrack, and to register the *research* alongside the *build*. Review polish can proceed in parallel with the kernel-loop track (AK); it shares no code seam with it.

**Scope rules.** The review *experience* only — the interaction layer over the existing thread/verdict/artifact system, and the research that informs it. No changes to the verdict semantics, the thread model, or the kernel work-loop. `npm run verify` must pass after each workpackage merges.

**Reference docs:** `plans/reviews/kernel-strategy-usp-analysis.md` (§3), `docs/product/human-ai-collaboration.md`, `docs/blocks/`, `packages/shared/src/thread.ts`, `.claude/rules/` (web-research wariness).

---

### AL1 — Competitive research dossier of review experiences

**Workpackage.** As the founder shaping HyperIdle's review experience, I want a researched, cited dossier of how the best tools handle review — across code *and* non-code domains (design, marketing/docs, data) — so that we design our differentiator grounded in what already exists and where the real white space is, instead of guessing. Today we have a strong instinct ("none of the existing experiences are great") but no map of the field, and an explicit blind spot on non-code review (what does Figma do, what do marketing approval tools do).

**Why this matters.** The review experience is the headline USP, and we are about to invest in it (AL2 and beyond). Designing the differentiator blind is the expensive failure mode; a grounded dossier is cheap insurance and the necessary input to a founder-led concept act on the review experience. The founder is the direct beneficiary — this is the raw material for deciding what "best review ever" actually means for agent-produced work. Without it, AL2 risks reinventing a worse version of patterns that already exist.

**What exists today.** Nothing — this is greenfield research. (Separately, our *own* review surface is partly built: verdicts and dial-in work; inline anchored comments do not — that gap is AL2, not this WP.)

**What's genuinely missing.** A structured, cited dossier covering, per domain, the dominant review interaction patterns — inline/anchored commenting, threading, comment-vs-suggestion, approval gating, async-vs-live, notification/attention routing — for code review (e.g. GitHub, GitLab, Graphite, Gerrit), design review (Figma), document/marketing review (Google Docs, Notion, marketing approval tools), and data/notebook review; with screenshots where obtainable and a synthesis of the white space for reviewing *agent-produced* work specifically.

**Depends on.** None.

**Complexity.** M

**Acceptance criteria.**
- The dossier captures, per domain (code, design, doc/marketing, data), the dominant review interaction patterns, each with a cited source.
- It explicitly names what no surveyed tool does well for reviewing agent-produced work — the white space.
- A reader can come away able to name the handful of patterns worth adopting and the white space HyperIdle should own.
- Deep dives that require founder-provided access to gated tools are listed as explicit follow-ups, not fabricated — no invented screenshots of tools we cannot access.

**Validation scenarios.**
- Human walkthrough: given the dossier, the founder can identify the patterns to adopt and the white space to own, and every non-obvious claim traces to a cited source.
- Given a domain we could not access without credentials, when the founder reads that section, then it clearly states the limitation and lists the access-gated deep dive as a follow-up.

**Plan calls.** Skip `/design` and `/architecture` — this is a research/writing workpackage (web research in the spirit of `/deep-research`). Output to `plans/reviews/`. The collaborative, access-gated deep dive (screenshotting gated tools together with the founder) is a follow-on `/concept` act and is out of scope here.

**Contracts / constraints.**
- Web claims are critically sourced and cross-checked (per the CLAUDE.md web-research rule — the web is full of wrong/marketing content).
- No fabricated screenshots or claims about tools we cannot directly observe; list them as founder-access follow-ups instead.
- The dossier is research input, not a design — it must not prescribe HyperIdle's UI.

**Out of scope.** Designing HyperIdle's review UI (that is the founder-led concept act plus AL2). The access-gated screenshot deep dive of paywalled tools.

**Effort.** M (~1d)

---

### AL2 — Inline / anchored review comments

**Workpackage.** As a reviewer, I want to attach a comment to a specific place in what I'm reviewing — a diff line, a paragraph, a block — so that my feedback is precise and threaded at the exact point it refers to, the way real review tools work. Today I can post a verdict and type a comment into the thread, but I cannot say "this line is wrong" anchored to the line; the review reads like a PR discussed in a side chat next to a static diff.

**Why this matters.** This is the number-one gap between our review and "best review ever," and the product docs already promise it (inline diff-line and paragraph comments) while the code only renders static diffs. Verification confirmed the scaffolding (`PlainPayloadWithBlockId`, stable block IDs) exists but no UI wires it. The cost of not building it is that review stays generic — precise, point-of-reference feedback is the table-stakes capability every serious review tool has and ours lacks.

**What exists today.** The thread/verdict system works (verified: verdicts post and resolve live). Block-reference scaffolding exists (`PlainPayloadWithBlockId` and block IDs across the codebase). Artifacts render as blocks; code diffs render statically with no line anchoring. There is no UI to create or display an anchored comment.

**What's genuinely missing.** The interaction and wiring to anchor a comment to a specific diff line / paragraph / block within a review, render it at that anchor, and thread replies there — across at least code diffs and prose/block artifacts.

**Depends on.** AL1 — the competitive dossier sets the interaction bar and the patterns this should match; building the anchoring UX before mapping the field risks reinventing a worse wheel.

**Complexity.** L

**Acceptance criteria.**
- A reviewer can anchor a comment to a specific line, paragraph, or block of the artifact under review.
- Anchored comments render at their anchor point and support threaded replies.
- Anchoring works across the artifact kinds the review renders — at minimum code diffs and prose/block content.
- The existing verdict flow is unaffected: a review with anchored comments still resolves via a verdict as it does today.

**Validation scenarios.**
- Given a code diff in review, when the reviewer comments on a specific line, then the comment renders anchored to that line and supports replies.
- Given a prose/block artifact in review, when the reviewer comments on a paragraph or block, then the comment anchors there.
- Given a review carrying anchored comments, when a verdict is posted, then the verdict still resolves the review (no regression to verdict semantics).

**Plan calls.** `/design` for the anchoring interaction, informed by AL1's findings; `/architecture` to wire `PlainPayloadWithBlockId` and block anchors into the thread/review renderer. Reuse the existing block-reference scaffolding — do not invent a new anchor model.

**Contracts / constraints.**
- Reuse existing block-ref / `PlainPayloadWithBlockId` scaffolding; no new content dialect.
- Verdict and thread semantics are preserved unchanged.

**Out of scope.** AI-suggested edits / suggestion mode. Review analytics. The competitive research itself (AL1).

**Effort.** L (~3d)
