# Track Z: Vision & Documentation

Tell the HyperIdle story. Produce external-facing documentation that communicates what HyperIdle is, why it exists, how it works, and how to get started — with the clarity and narrative quality of the best developer-facing product docs (Paperclip, Linear, Vercel). The track also audits the current product against its stated vision and fixes contradictions.

**Key narrative:** HyperIdle is NOT "zero human companies." It is an operating system where humans and AI agents collaborate as equals, with AI amplifying human judgment — not replacing it. The CEO is human. Management is human. Knowledge is co-created. This is the core differentiator from Paperclip and must be woven through every document.

**Constraint:** Documentation lives in `docs/product/` (new directory). Internal architecture docs in `docs/architecture/` etc. are reference material, not replaced. The product docs tell the story; the architecture docs contain the truth. No contradictions between them. `npm run verify` must pass after each workpackage merges.

See `CLAUDE.md` for tech stack and `.pipeline/work-packages/pipeline-manifest.yaml` for the dependency graph.

---

### Z1 — Product Story & Landing Documentation

**Workpackage.** As a developer or founder discovering HyperIdle for the first time, I want a clear, compelling product story that explains what HyperIdle is, why it exists, what makes it different, and what I can do with it — so that I can decide in under 5 minutes whether this is relevant to me and worth exploring further.

**Depends on.** None.

**Complexity.** L

**Acceptance criteria.**
- A `docs/product/index.md` exists as the entry point, containing: a one-paragraph elevator pitch, a visual overview of the three-layer architecture, a list of core concepts (teams, bets, tasks, sessions, knowledge, routines), and navigation links to deeper docs.
- A `docs/product/why.md` explains the problem HyperIdle solves: why existing tools (Slack + Linear + Notion + GitHub) fail for AI-first teams, what "agent OS" means concretely, and how HyperIdle's approach differs from workflow DAGs, single-agent frameworks, and Paperclip's "zero human" model.
- A `docs/product/concepts.md` introduces each core primitive with a one-paragraph explanation, a concrete example, and how it connects to the others. Written for someone who has never seen the codebase.
- A `docs/product/human-ai.md` articulates the human+AI collaboration model: humans as founders/CEOs/team leads, agents as team members, facilitators as organizational curators, and how judgment flows between them.
- A `docs/product/features.md` provides a feature overview with one section per major capability: knowledge management, work tracking, conversations, agent execution, settings/configuration.
- All product docs use plain English, no internal jargon, no acronyms without expansion, and include concrete examples for every abstract concept.
- Each document is under 2000 words — concise enough to read in one sitting.

**Validation scenarios.**
- Given a developer who has never heard of HyperIdle, when they read `index.md` and `why.md`, then they can explain in their own words what HyperIdle does and how it differs from existing tools.
- Given a technical founder evaluating agent OS options, when they read `features.md`, then they can identify which HyperIdle capabilities match their needs.
- Given a reader familiar with Paperclip, when they read `human-ai.md`, then they can articulate how HyperIdle's human-in-the-loop approach differs from Paperclip's agent-company model.
- Given a reader who reads all five documents, when checked for contradictions with `docs/architecture/`, then no factual conflicts exist.

**Plan calls.** Skip /design, skip /architecture. This is narrative writing informed by existing architecture docs and ETHOS.md. Research existing docs thoroughly before writing — the story must be faithful to the actual system.

**Contracts / constraints.**
- Product docs describe the system as designed, including features not yet fully implemented — but must clearly distinguish "available now" from "coming soon."
- No marketing superlatives ("revolutionary," "game-changing"). Factual, specific, concrete.
- The voice is direct and opinionated (like Linear's docs), not corporate-neutral.
- All examples use HyperIdle's actual primitives (real team names, real bet structures), not generic placeholders.

**Out of scope.**
- API reference documentation (that's auto-generated from route definitions).
- Deployment guides (covered by `docs/deployment/`).
- Contributor documentation (CONTRIBUTING.md, separate track).

**Effort.** L (~3d)

---

### Z2 — Getting Started Journey

**Workpackage.** As a new user installing HyperIdle for the first time, I want a step-by-step getting started guide that takes me from zero to a running system with my first team, first bet, and first agent session — so that I experience the core value loop within 30 minutes.

**Depends on.** None.

**Complexity.** M

**Acceptance criteria.**
- A `docs/product/getting-started.md` exists with numbered steps covering: installation (prerequisites, clone, install, configure), first run (`npm run dev`), creating a team, creating a user profile, setting up an agent, creating a bet, creating a task, and triggering an agent session.
- Each step includes the exact command or UI action, what the user should see after completing it, and a troubleshooting note for common failures.
- The guide identifies the "aha moment" — the point where the user sees an agent produce real output on a task they defined — and structures the flow to reach it as quickly as possible.
- The guide includes a "What's Next?" section pointing to deeper docs: knowledge management, facilitator setup, routine configuration, and the human validation workflow.
- Prerequisites are explicit: Node.js version, PostgreSQL (or SQLite for local), and any required API keys (model gateway).
- The guide works end-to-end on a fresh macOS and Linux machine following only the documented steps.

**Validation scenarios.**
- Given a developer with Node.js installed on macOS, when they follow the getting started guide step by step, then they have a running HyperIdle instance with one team, one bet, and one completed agent session within 30 minutes.
- Given a step fails (e.g., migration error), when the user reads the troubleshooting note for that step, then they can resolve the issue without external help.
- Given a user completes the guide, when they read the "What's Next?" section, then they know which doc to read for their next goal.

**Plan calls.** Skip /design, skip /architecture. This is tutorial writing. The author must actually run through the flow end-to-end on a clean environment to verify every step works.

**Contracts / constraints.**
- Commands are copy-pasteable — no `<placeholder>` syntax without explaining what to substitute.
- The guide uses SQLite for local development (zero-ops), not PostgreSQL.
- Screenshots are optional but recommended for UI steps (stored in `docs/product/assets/`).
- The guide does not require external API keys for the initial walkthrough — the built-in harness (X6) with a local model or a free-tier API suffices.

**Out of scope.**
- Production deployment (covered by `docs/deployment/`).
- Multi-user setup.
- Desktop app installation (Track N).
- Advanced configuration (model gateway, notification adapters).

**Effort.** M (~4h)

---

### Z3 — Feature Documentation Suite

**Workpackage.** As a user who has completed the getting started guide, I want detailed documentation for each major feature area — so that I understand the full capabilities of each system and can configure them for my team's needs.

**Depends on.** None.

**Complexity.** L

**Acceptance criteria.**
- A `docs/product/knowledge/` directory contains docs covering: the five-layer knowledge system (explained for users, not architects), creating and editing knowledge items, the review queue, facilitator curation, knowledge search, and how knowledge flows from sessions to practices to principles.
- A `docs/product/work/` directory contains docs covering: bets (what they are, how to create them, the appetite model), tasks (state machine, assignment, dependencies), sessions (what happens during one, outcomes, cost tracking), and routines (schedules, triggers, configuration).
- A `docs/product/agents/` directory contains docs covering: agent setup (soul prompts, harness selection, model configuration), agent roles (builder, PM, facilitator, ops), the skill-tool system, and how agents collaborate in teams.
- A `docs/product/conversations/` directory contains docs covering: threads, messages, the review flow, and how conversations connect to work and knowledge.
- Each feature doc follows a consistent structure: what it is (one paragraph), how it works (walkthrough), configuration options (table), and examples (concrete scenarios).
- All feature docs cross-link to related features (e.g., knowledge docs link to agent docs where agents create knowledge).

**Validation scenarios.**
- Given a user who wants to set up a knowledge validation workflow, when they read the knowledge review queue doc, then they understand how items reach the queue, how to process them, and what happens after validation.
- Given a user who wants to configure a builder agent, when they read the agent setup doc, then they can create an agent with the right soul prompt, harness, and model tier.
- Given a reader who navigates from the getting started guide to feature docs, when they follow cross-links, then every link resolves to an existing document.

**Plan calls.** Skip /design, skip /architecture. Research the actual implemented features (read routes, UI components, and existing architecture docs) before writing. Each feature doc must describe what actually works today.

**Contracts / constraints.**
- Feature docs describe implemented behavior only — no "coming soon" features mixed in with available features.
- Each doc is self-contained (can be read without context) but links to prerequisite docs where needed.
- Configuration options are presented as tables with columns: setting, type, default, description.
- Code examples use actual API endpoints and request/response shapes from the running system.

**Out of scope.**
- API reference (auto-generated from route definitions).
- Internal architecture (stays in `docs/architecture/`).
- Changelog or release notes.

**Effort.** L (~5d)

---

### Z4 — Vision Sharpening & Gap Audit

**Workpackage.** As the founder, I want a systematic audit that identifies contradictions between HyperIdle's stated vision (ETHOS.md, architecture docs, product docs) and the actual implemented features — so that I can prioritize fixes and ensure the product tells a coherent story from docs to UI.

**Depends on.**
- Z1 — Product Story & Landing Documentation. The product story establishes the canonical narrative; this workpackage audits the implementation against it. Without Z1, there is no single source of truth to audit against.

**Complexity.** M

**Acceptance criteria.**
- A `docs/product/vision-audit.md` exists listing every contradiction found between: product docs (Z1), architecture docs (`docs/`), ETHOS.md, and the actual implemented system.
- Each contradiction entry includes: what the docs say, what the system actually does, severity (critical/major/minor), and a recommended resolution (fix the doc, fix the system, or defer with justification).
- The audit covers at minimum: all five process primitives (do they work as documented?), the knowledge system (do all layers exist and function?), the agent system (can agents actually run?), and the human-AI collaboration model (do humans have the controls promised?).
- The audit identifies features that are documented but not implemented, and features that are implemented but not documented.
- The audit produces a prioritized punch list of fixes, ordered by user-facing impact.

**Validation scenarios.**
- Given the product docs claim "facilitators automatically organize knowledge," when the audit checks the facilitator system, then it reports whether facilitator routines actually run and produce visible results.
- Given the ETHOS.md says "User Sovereignty — AI recommends, humans decide," when the audit checks the UI, then it reports whether humans can actually override agent decisions in every documented flow.
- Given a feature documented in Z3 that doesn't work, when the audit runs, then the punch list includes the gap with severity and recommended fix.

**Plan calls.** Skip /design, skip /architecture. This is a read-heavy research task. The auditor must read all product docs, then systematically test each claim against the running system or codebase. Use Explore agents for codebase verification.

**Contracts / constraints.**
- The audit is honest — it does not minimize gaps or rationalize missing features.
- Severity ratings follow: critical = the product story is wrong about a core concept; major = a documented feature doesn't work; minor = a doc is imprecise or a feature is partially implemented.
- The audit document is a living artifact — it should be updated as gaps are fixed.

**Out of scope.**
- Fixing the contradictions (that's follow-up work prioritized from the punch list).
- Performance or security audit (covered by Track I).
- Visual/design audit (covered by Track W).

**Effort.** M (~6h)

---

### Z5 — Architecture Story

**Workpackage.** As a developer evaluating whether to contribute to or build on HyperIdle, I want the architecture explained as a compelling narrative — why three layers, why the fabric, why facilitators, why persistent teams — so that I understand not just what the system does but why it was designed this way.

**Depends on.** None.

**Complexity.** M

**Acceptance criteria.**
- A `docs/product/architecture-story.md` exists that tells the architecture as a narrative, not a reference manual.
- The narrative covers: the three-layer model (Human Interface → Meta Layer → Agent Runtime) and why strict downward dependency matters; the Knowledge Fabric and why materialization beats FUSE; facilitators as first-class agents and why they're the key differentiator; persistent teams and why crew-per-task is an anti-pattern; the kernel/strategy separation and why extensibility requires this split.
- Each architectural decision includes: what we chose, what we rejected, and why — in plain language with concrete examples.
- The narrative is under 3000 words, readable in 15 minutes.
- The document links to the detailed architecture docs in `docs/architecture/` for readers who want the full technical depth.
- The tone is opinionated and honest — acknowledges trade-offs instead of presenting every choice as obviously correct.

**Validation scenarios.**
- Given a backend developer reading the architecture story, when they finish, then they can explain the three-layer model and the kernel/strategy separation to a colleague.
- Given a developer familiar with CrewAI or LangGraph, when they read the "what we rejected" sections, then they understand why HyperIdle chose a different approach.
- Given a reader who wants more detail on any section, when they follow the links, then every linked architecture doc exists and is consistent with the narrative.

**Plan calls.** Skip /design, skip /architecture. Narrative writing informed by `docs/architecture/` and the decision records in the knowledge architecture docs. The writer must understand the "why" deeply before writing.

**Contracts / constraints.**
- The architecture story is a narrative interpretation of the architecture docs, not a replacement. If they conflict, update the story to match the architecture docs.
- No UML diagrams — use simple ASCII diagrams or prose descriptions.
- The document targets developers with 3+ years of experience but no HyperIdle-specific knowledge.

**Out of scope.**
- API reference or schema documentation.
- Deployment architecture (covered by `docs/deployment/`).
- Performance benchmarks.

**Effort.** M (~4h)

---

### Z6 — Human+AI Collaboration Narrative

**Workpackage.** As a potential user or investor, I want a clear articulation of how humans and AI agents collaborate in HyperIdle — not as a technical spec but as a vision of how work actually flows — so that I understand this is fundamentally different from "replace humans with AI" products.

**Depends on.** None.

**Complexity.** M

**Acceptance criteria.**
- A `docs/product/collaboration.md` exists that describes the human+AI collaboration model through concrete scenarios, not abstract principles.
- The document includes at least three worked examples showing a complete collaboration flow: (1) a human CEO shapes a bet and agents execute it, with the human reviewing outcomes; (2) a facilitator agent curates knowledge and a human validates the curation; (3) a human and agent co-create a knowledge item through the review queue workflow.
- The document explicitly positions HyperIdle against Paperclip's "zero human companies" framing: acknowledging what Paperclip gets right (agent orchestration, cost control) while articulating why HyperIdle believes human judgment at the right moments is non-negotiable.
- The document introduces the "judgment gradient" concept: which decisions are fully autonomous (L0/L1), which need human sampling (L2), which require human validation (L3/L4), and why the line is drawn where it is.
- The document describes the attention scoring system in human terms: "the system shows you the 5 items that need your brain, not the 500 that don't."
- The document is under 2000 words, written for a non-technical audience (founder, PM, investor).

**Validation scenarios.**
- Given a non-technical founder reading the collaboration doc, when they finish, then they can describe to an investor how HyperIdle's human+AI model works in practice.
- Given a reader familiar with Paperclip, when they read the positioning section, then they understand the specific differences in philosophy and approach.
- Given a reader who finishes the three worked examples, when asked "when do humans need to be involved?", then they can answer with the judgment gradient (autonomous → sampling → validation).

**Plan calls.** Skip /design, skip /architecture. This is vision writing informed by ETHOS.md (User Sovereignty principle), the knowledge architecture docs (attention scoring, human validation gates), and the process layer docs (bet/task/session flows).

**Contracts / constraints.**
- The positioning against Paperclip is respectful and factual — not dismissive. Acknowledge what they do well.
- The worked examples use realistic scenarios, not toy examples.
- No implementation details — this document describes what the user experiences, not how the code works.
- The judgment gradient is consistent with the actual status machine and promotion pipeline.

**Out of scope.**
- Technical implementation of the collaboration model (covered by architecture docs).
- User research or user testing.
- Comparative analysis with other products beyond Paperclip.

**Effort.** M (~4h)

---

### Z7 — Plugin & Extensibility Story

**Workpackage.** As a developer who wants to extend HyperIdle, I want clear documentation of what's extensible, how to build extensions, and what the extensibility vision is — covering harness adapters, skill-tools, routine types, knowledge kinds, and future plugin surfaces — so that I can build on HyperIdle rather than fork it.

**Depends on.** None.

**Complexity.** M

**Acceptance criteria.**
- A `docs/product/extensibility.md` exists that articulates the extensibility philosophy: kernel is stable, strategy is replaceable, harnesses are pluggable, skill-tools are composable.
- The document maps current extension points: (1) Harness adapters — how to add a new agent runtime (CLI wrapper, SDK integration), referencing X5's adapter interface; (2) Skill-tools — how the 14 meta-layer tools work and how new ones could be added; (3) Knowledge kinds — how the strategy fabric supports new knowledge types without schema changes; (4) MCP bridge — how external tools connect to HyperIdle's meta-layer via MCP (X2).
- The document articulates the vision for future extensibility: out-of-process plugins (inspired by Paperclip's capability-gated plugin model), a skill marketplace, custom routine types, and webhook integrations — clearly labeled as "planned, not yet implemented."
- The document compares HyperIdle's approach to Paperclip's plugin model: both are extensible, but HyperIdle's kernel/strategy split means extensions don't need to touch core schema, while Paperclip's plugin model requires out-of-process workers.
- The document includes a concrete example: "How to add Goose as a harness adapter" — a walkthrough showing the adapter interface, the registration pattern, and the test.
- Under 3000 words.

**Validation scenarios.**
- Given a developer who wants to add a new harness, when they read the extensibility doc, then they can follow the Goose example and understand what interface to implement.
- Given a product evaluator comparing HyperIdle and Paperclip, when they read the extensibility section, then they understand the architectural difference (kernel/strategy vs plugin workers).
- Given a developer reading the future vision section, when they see "planned" items, then each is clearly labeled as not-yet-implemented.

**Plan calls.** Skip /design, skip /architecture. Research the actual adapter interface (X5), skill-tool registry (D4), MCP bridge (X2), and knowledge strategy fabric (O2) before writing. The example must compile against real code.

**Contracts / constraints.**
- The Goose adapter example must reference the actual `HarnessAdapter` interface from the codebase — no pseudocode.
- Future extensibility is vision, not commitment — clearly distinguished from current capabilities.
- The document does not promise an API stability guarantee — that's a separate decision.

**Out of scope.**
- Building the plugin runtime (that's a future track).
- API reference for extension points (auto-generated separately).
- Security model for plugins.

**Effort.** M (~4h)

---

### Z8 — Feature Polish & Launch Readiness Audit

**Workpackage.** As the founder preparing for launch, I want a systematic audit of all implemented features — identifying which are polished and launch-ready, which are built but rough, and which are hidden gems that need surfacing — so that I can prioritize polish work and ensure the product's first impression matches its actual capabilities.

**Depends on.**
- Z4 — Vision Sharpening & Gap Audit. Z4 identifies vision-vs-reality contradictions; Z8 focuses on polish and accessibility of what IS built.

**Complexity.** L

**Acceptance criteria.**
- A `docs/product/launch-readiness.md` exists with a feature-by-feature audit organized by: (1) Launch-ready (polished, documented, discoverable), (2) Built but rough (functional but needs UX polish, better defaults, or surfacing), (3) Hidden gems (powerful features that users won't discover without guidance), (4) Incomplete (scaffolded but not functional end-to-end).
- Each feature entry includes: feature name, current location in UI, accessibility rating (easy to find / hidden / buried in settings), polish rating (launch-ready / needs work / rough), and specific recommendations (what to fix for launch readiness).
- The audit covers at minimum: knowledge management (CRUD, search, scoping, FTS), work tracking (bets, tasks, state machine), conversations/threads, agent configuration (soul prompts, harness, model tier), settings pages, the body editor, cost tracking, org chart, and routines.
- A "Quick Wins" section lists 10 highest-impact polish items that could be fixed in 1-2 days each — things like better empty states, clearer navigation labels, missing loading states, or features that need a single button to become discoverable.
- A "Hidden Gems" section identifies features that are powerful but undiscoverable — e.g., FTS search capabilities, attention scoring, the promotion pipeline — with recommendations for how to surface them (navigation entries, empty-state CTAs, onboarding hints).
- The audit is performed by actually using the running application — not by reading code. Each finding includes a screenshot or specific UI path.

**Validation scenarios.**
- Given the running application, when the auditor navigates every page and settings section, then every implemented feature is categorized into one of the four buckets.
- Given the Quick Wins list, when a developer reads an entry, then they know exactly what to change (e.g., "Knowledge list has no empty state — add 'Create your first knowledge item' CTA when list is empty").
- Given the Hidden Gems list, when a product person reads it, then they can prioritize which features to surface in the UI or documentation.

**Plan calls.** Skip /design, skip /architecture. This is an exploratory audit performed against the running application. Use the dev server (`npm run dev`) and systematically navigate every surface. Take screenshots for evidence. The auditor should approach the app as a first-time user, not a developer.

**Contracts / constraints.**
- The audit is honest — features that look bad are rated honestly, not diplomatically.
- Screenshots are stored in `docs/product/assets/audit/` for reference.
- Recommendations are actionable — "needs polish" without specifics is not acceptable.
- The audit reflects the current state of `main` branch only — no feature branches.

**Out of scope.**
- Fixing the identified issues (this produces the punch list, not the fixes).
- Performance audit.
- Security audit (covered by Track I).
- Mobile responsiveness audit.

**Effort.** L (~2d)
