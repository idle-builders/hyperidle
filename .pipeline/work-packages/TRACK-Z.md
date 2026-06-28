# Track Z: Vision & Documentation

Tell the HyperIdle story. Produce external-facing documentation that communicates what HyperIdle is, why it exists, how it works, and how to get started — with the clarity and narrative quality of the best developer-facing product docs (Paperclip, Linear, Vercel). The track also audits the current product against its stated vision and fixes contradictions.

**Key narrative:** HyperIdle is NOT "zero human companies." It is an operating system where humans and AI agents collaborate as equals, with AI amplifying human judgment — not replacing it. The CEO is human. Management is human. Knowledge is co-created. This is the core differentiator from Paperclip and must be woven through every document.

**Constraint:** Internal architecture docs in `docs/architecture/` etc. are reference material, not replaced. The product docs tell the story; the architecture docs contain the truth. No contradictions between them. `npm run verify` must pass after each workpackage merges.

See `CLAUDE.md` for tech stack and `.pipeline/work-packages/pipeline-manifest.yaml` for the dependency graph.

---

### Z0 — Documentation Site (VitePress)

**Workpackage.** As anyone reading HyperIdle's product documentation, I want the docs rendered in a professional, navigable documentation site — not raw markdown on GitHub — so that the reading experience matches the quality of the content and I can search, navigate between sections, and read on any device.

**Why this matters.** Raw markdown on GitHub signals "internal notes," not "product documentation." The product story (Z1) and all subsequent docs (Z2–Z8) need a rendered surface that communicates professionalism, enables search, provides navigation, and can be deployed as a static site. Without it, the documentation funnel leaks at the first impression — readers bounce before content quality can matter. VitePress is the natural fit: Vite-based (matches the monorepo stack), renders markdown with zero config, has built-in search, and deploys as static.

**Depends on.** None.

**Complexity.** S

**Acceptance criteria.**
- VitePress is installed and configured in the monorepo, pointed at `docs/product/` as the content source.
- `npm run docs:dev` starts a local documentation site on a dev port.
- `npm run docs:build` produces a static build in a `dist` directory suitable for deployment.
- The site renders all existing product docs (Z1 output) with working navigation between them.
- The site has a sidebar matching the `docs/product/index.md` structure.
- Search works across all documentation pages.
- The site uses a theme consistent with HyperIdle's visual identity (dark theme, factory-dark palette where possible).
- `npm run verify` passes — VitePress does not break existing tooling.

**Validation scenarios.**
- Given a user runs `npm run docs:dev`, when they open the browser, then they see a rendered documentation site with sidebar navigation and all Z1 product docs.
- Given a user searches for "bet" in the search bar, then results from relevant docs appear.
- Given a user runs `npm run docs:build`, then a static `dist` directory is produced with all pages.

**Plan calls.** Skip /concept, skip /design. Tooling setup — install, configure, verify.

**Contracts / constraints.**
- VitePress config lives alongside the docs, not in a separate package.
- The docs site is additive — does not modify or move existing markdown files.
- No custom Vue components in the first pass — use VitePress defaults.

**Out of scope.**
- Deployment to a hosting provider (separate concern).
- Custom theme development beyond color configuration.
- Documentation for non-product docs (architecture docs stay in `docs/` for internal reference).

**Effort.** S (~2h)

---

### Z1 — Product Story & Landing Documentation

**Workpackage.** As a developer or founder discovering HyperIdle for the first time, I want a clear, compelling product story that explains what HyperIdle is, why it exists, what makes it different, and what I can do with it — so that I can decide in under 5 minutes whether this is relevant to me and worth exploring further.

**Why this matters.** A developer or founder evaluating the product has no way to make an informed decision without a clear product story — they will move on within minutes. Without this document, every discovery interaction ends in confusion or a misclassification as "another AI chat app." The cost of not building it is zero qualified evaluators, which means zero users. This workpackage cannot be skipped; a product that cannot explain itself does not exist in the market.

**Depends on.** None.

**Complexity.** L

**Acceptance criteria.**
- A first-time reader who has never heard of HyperIdle can explain in their own words what it does, why it exists, and how it differs from Slack+Linear+Notion+GitHub after reading the product documentation entry point.
- A reader familiar with Paperclip or other agent frameworks can articulate how HyperIdle's human-in-the-loop approach differs from "zero human companies" and workflow DAG orchestration.
- Every core primitive (team, bet, task, session, knowledge, routine, agent) is introduced with a concrete example — not just a definition.
- The human+AI collaboration model is front and center: humans as founders and team leads, agents as team members, facilitators as curators, and the judgment gradient (which decisions are autonomous, which need human validation).
- The documentation covers features that exist today, clearly distinguishing "available now" from "coming soon" where applicable.
- No marketing superlatives. Factual, specific, concrete. The voice is direct and opinionated.
- Each document is under 2000 words — concise enough to read in one sitting.
- All cross-references between product docs and architecture docs are consistent — no factual conflicts.

**Validation scenarios.**
- Given a developer evaluating agent OS options, when they finish reading the product story, then they can list 3 specific ways HyperIdle differs from alternatives they know.
- Given a non-technical founder, when they read the human+AI collaboration section, then they can describe to an investor how human judgment stays in the loop.
- Given a reader who reads all product docs, when they cross-check against `docs/architecture/`, then no contradictions exist.

**Plan calls.** Skip /design, skip /architecture. This is narrative writing informed by existing architecture docs, ETHOS.md, and the running system. The concept pass should identify which primitives need explanation and verify terminology against canonical vocabulary.

**Contracts / constraints.**
- Product docs are the story layer; architecture docs are the truth layer. If they conflict, update the product docs to match reality.
- All examples use HyperIdle's actual primitives, not generic placeholders.
- No internal jargon or acronyms without expansion.

**Out of scope.**
- API reference documentation.
- Deployment guides (covered by `docs/deployment/`).
- Contributor documentation.

**Effort.** L (~3d)

---

### Z2 — Getting Started Journey

**Workpackage.** As a new user installing HyperIdle for the first time, I want a step-by-step guide that takes me from zero to experiencing the core value loop — my first team, first bet, and first agent producing real output — so that I understand what this product does by doing, not just reading.

**Why this matters.** Without a getting started guide, every new user hits the same wall: a running server and no idea what to do next. The product may be entirely functional, but the absence of a guided first experience makes it feel broken. New users who can't reach "aha" in the first session do not return. This is the single highest-leverage documentation workpackage for user retention.

**Depends on.** None.

**Complexity.** M

**Acceptance criteria.**
- A new user with Node.js installed can reach a running HyperIdle instance within 10 minutes following only the documented steps.
- The guide reaches the "aha moment" — the user sees an agent produce real output on a task they defined — as quickly as possible.
- Every step includes: the exact action (command or UI click), what the user should see after completing it, and a troubleshooting note for common failures.
- The guide uses zero-ops local setup (SQLite, no external API keys required for the initial walkthrough — built-in harness suffices).
- After completing the guide, the user knows where to go next for their specific goals (knowledge management, agent configuration, routine setup).
- The guide works end-to-end on a fresh macOS and Linux machine — verified by actually running it, not assumed.
- Commands are copy-pasteable — no `<placeholder>` syntax without explaining what to substitute.

**Validation scenarios.**
- Given a developer on a fresh macOS machine, when they follow the guide step by step, then they have a running instance with one team, one bet, and one completed agent session within 30 minutes.
- Given a step fails (e.g., migration error), when the user reads the troubleshooting note, then they can resolve the issue without external help.
- Given a user finishes the guide, when they ask "what can I do next?", then the guide points them to 3+ specific next steps relevant to different user goals.

**Plan calls.** Skip /design, skip /architecture. Tutorial writing — the author must actually run through the flow end-to-end on a clean environment to verify every step works. If steps break, fix the documentation or file issues against the underlying feature.

**Contracts / constraints.**
- The guide describes the system as it works today — no aspirational features.
- Screenshots are optional but recommended for UI steps.
- The guide does not require external API keys for the initial walkthrough.

**Out of scope.**
- Production deployment.
- Multi-user setup.
- Desktop app installation.
- Advanced configuration (model gateway, notification adapters).

**Effort.** M (~6h)

---

### Z3 — Feature Documentation Suite

**Workpackage.** As a user who has completed getting started, I want detailed documentation for each major feature area — so that I understand the full capabilities of each subsystem and can configure them for my team's needs.

**Why this matters.** Getting started converts a visitor to an active user; feature docs convert an active user to a power user. Without them, users plateau after the tutorial and never discover knowledge curation, routine configuration, or agent autonomy levels — the features that justify switching from Slack+Linear. The cost is high churn at the 7-day mark when users hit their first real task and have no reference. The alternative — no docs, rely on intuition — only works for products with far simpler interaction models.

**Depends on.** None.

**Complexity.** L

**Acceptance criteria.**
- Each major feature area (knowledge management, work tracking, agent execution, conversations) has documentation that a user can follow to set up and use that feature without needing to read source code.
- Each feature doc follows a consistent structure: what it is (one paragraph), how it works (walkthrough with concrete actions), configuration options, and real examples.
- A user reading the knowledge management docs understands: how knowledge flows from agent sessions to team practices to factory principles, how the review queue works, and how to create and curate knowledge items.
- A user reading the work tracking docs understands: what bets are, how tasks relate to bets, how sessions execute tasks, and how cost tracking works.
- A user reading the agent docs understands: how to configure an agent (soul prompt, harness, model tier), what roles exist, and how agents collaborate in teams.
- All feature docs describe implemented behavior only — no "coming soon" features mixed in.
- Configuration options are presented as tables (setting, type, default, description).
- All cross-links between feature docs resolve to existing documents.

**Validation scenarios.**
- Given a user who wants to set up agent-driven knowledge curation, when they read the knowledge docs, then they can configure a facilitator agent and see it produce knowledge items.
- Given a user who wants to create their first bet, when they read the work tracking docs, then they can create a bet with tasks and trigger an agent session.
- Given a new feature doc, when it references another doc, then the link resolves correctly.

**Plan calls.** Skip /pipeline:design, skip /pipeline:architecture. Research the actual implemented features (read routes, UI components, and existing architecture docs) before writing. Each feature doc must describe what actually works today — run the dev server and verify claims.

**Contracts / constraints.**
- Feature docs describe implemented behavior only.
- Each doc is self-contained (readable without context) but links to prerequisites where needed.
- Code examples use actual API endpoints and request/response shapes from the running system.

**Out of scope.**
- API reference (auto-generated from route definitions).
- Internal architecture (stays in `docs/architecture/`).
- Changelog or release notes.

**Effort.** L (~5d)

---

### Z4 — Vision Sharpening & Gap Audit

**Workpackage.** As the founder, I want a systematic audit identifying contradictions between the stated vision and the actual product — so that I can prioritize fixes and ensure the product tells a coherent story from docs to UI.

**Why this matters.** Docs rot silently. Without a deliberate audit, the product story drifts from reality as features ship, get cut, or get renamed — and neither the author nor users notice until trust is already broken. The founder is the only person with enough context to judge severity. The cost of not auditing is compounding misinformation: each new workpackage is designed against a fiction, and external evaluators find contradictions that destroy credibility. This is a one-time investment with lasting maintenance value.

**Depends on.**
- Z1 — Product Story. The product story establishes the canonical narrative to audit against.

**Complexity.** M

**Acceptance criteria.**
- Every contradiction between product docs, architecture docs, ETHOS.md, and the actual implemented system is cataloged with: what the docs say, what the system does, severity (critical/major/minor), and recommended resolution.
- Features documented but not implemented are identified.
- Features implemented but not documented are identified.
- The audit produces a prioritized punch list ordered by user-facing impact, with enough detail per item that a developer knows exactly what to fix.
- Severity ratings: critical = product story is wrong about a core concept; major = documented feature doesn't work; minor = doc is imprecise or feature is partially implemented.

**Validation scenarios.**
- Given the product docs claim facilitators automatically organize knowledge, when the audit checks the system, then it reports whether facilitator routines actually run and produce visible results.
- Given the ETHOS.md says "User Sovereignty — AI recommends, humans decide," when the audit checks the UI, then it reports whether humans can override agent decisions in every documented flow.
- Given a gap in the punch list, when a developer reads it, then they know exactly what to change without further investigation.

**Plan calls.** Skip /design, skip /architecture. Read-heavy research task. The auditor must read all product docs, then systematically verify each claim against the running system or codebase.

**Contracts / constraints.**
- The audit is honest — does not minimize gaps or rationalize missing features.
- The audit document is a living artifact — updated as gaps are fixed.

**Out of scope.**
- Fixing the contradictions (follow-up work from the punch list).
- Performance or security audit.
- Visual/design audit.

**Effort.** M (~6h)

---

### Z5 — Architecture Story

**Workpackage.** As a developer evaluating whether to contribute to or build on HyperIdle, I want the architecture explained as a compelling narrative — why three layers, why the fabric, why facilitators, why persistent teams — so that I understand not just what the system does but why it was designed this way and what was rejected.

**Why this matters.** Contributors and technical evaluators don't read architecture docs — they read architecture stories. The `docs/architecture/` folder contains the truth but not the argument; without the narrative, developers either misapply the system or dismiss it as over-engineered. The cost is a contributor base that fights the architecture instead of working with it, and a technical audience that cannot distinguish HyperIdle's design from an elaborate LangGraph wrapper. A developer who understands the "why" builds in the right direction without needing to ask.

**Depends on.** None.

**Complexity.** M

**Acceptance criteria.**
- A developer reading the architecture story can explain the three-layer model, the kernel/strategy separation, and the facilitator concept to a colleague who hasn't read any HyperIdle docs.
- Every major architectural decision includes: what was chosen, what was rejected, and why — with concrete examples of the tradeoff.
- The narrative is under 3000 words, readable in 15 minutes.
- Every link to detailed architecture docs resolves to an existing, consistent document.
- The tone is opinionated and honest — acknowledges tradeoffs rather than presenting every choice as obviously correct.

**Validation scenarios.**
- Given a developer familiar with CrewAI or LangGraph, when they read the architecture story, then they understand why HyperIdle chose persistent teams over crew-per-task and materialization over FUSE.
- Given a reader who wants more detail on any section, when they follow links, then every linked architecture doc exists and is consistent.

**Plan calls.** Skip /pipeline:design, skip /pipeline:architecture. Narrative writing informed by `docs/architecture/` and decision records. The writer must understand the "why" deeply before writing.

**Contracts / constraints.**
- The architecture story is an interpretation of the architecture docs, not a replacement. Conflicts → update the story.
- Targets developers with 3+ years of experience but no HyperIdle-specific knowledge.
- No UML diagrams — use simple ASCII diagrams or prose descriptions.

**Out of scope.**
- API reference or schema documentation.
- Deployment architecture.
- Performance benchmarks.

**Effort.** M (~4h)

---

### Z6 — Human+AI Collaboration Narrative

**Workpackage.** As a potential user or investor, I want a clear articulation of how humans and AI agents collaborate in HyperIdle — through concrete scenarios, not abstract principles — so that I understand this is fundamentally different from "replace humans with AI" products.

**Why this matters.** Without this narrative, HyperIdle looks indistinguishable from Paperclip to a non-technical evaluator — both run agents on tasks, both produce outputs. The human+AI collaboration model is the entire thesis: that AI amplifying human judgment produces better outcomes than AI replacing it. If that thesis is not articulated clearly and early, the product gets filed under "agentic workflow tool" and evaluated on feature count rather than philosophy. Founders and investors who miss this framing do not become advocates.

**Depends on.** None.

**Complexity.** M

**Acceptance criteria.**
- A non-technical founder can describe to an investor how HyperIdle's human+AI model works in practice after reading this document.
- At least three worked examples show a complete collaboration flow: (1) human shapes a bet, agents execute, human reviews outcome; (2) facilitator agent curates knowledge, human validates; (3) human and agent co-create knowledge through the review workflow.
- The "judgment gradient" is articulated: which decisions are fully autonomous (L0/L1), which need human sampling (L2), which require validation (L3/L4), and why the line is drawn where it is.
- The positioning against Paperclip is respectful and factual — acknowledges what Paperclip gets right while articulating why human judgment at the right moments is non-negotiable.
- The document is under 2000 words, written for a non-technical audience.
- The judgment gradient is consistent with the actual status machine and promotion pipeline.

**Validation scenarios.**
- Given a reader who finishes the three worked examples, when asked "when do humans need to be involved?", then they can answer with the judgment gradient.
- Given a reader familiar with Paperclip, when they finish the positioning section, then they understand the specific differences in philosophy.

**Plan calls.** Skip /pipeline:design, skip /pipeline:architecture. Vision writing informed by ETHOS.md (User Sovereignty), knowledge architecture docs (attention scoring, human validation gates), and process layer docs.

**Contracts / constraints.**
- Worked examples use realistic scenarios, not toy examples.
- No implementation details — describes what the user experiences, not how code works.
- Positioning against Paperclip is respectful.

**Out of scope.**
- Technical implementation of the collaboration model.
- Comparative analysis with products beyond Paperclip.

**Effort.** M (~4h)

---

### Z7 — Plugin & Extensibility Story

**Workpackage.** As a developer who wants to extend HyperIdle, I want clear documentation of what's extensible, how to build extensions, and what the extensibility vision is — so that I can build on HyperIdle rather than fork it.

**Why this matters.** When developers can't find an extension point, they fork. Forks fragment the ecosystem, create divergent deployments, and never contribute improvements back. The kernel/strategy split exists precisely to make HyperIdle extensible without forking — but that design intent is worthless without documentation that surfaces it. The cost of not building this is a closed ecosystem that developers treat as a black box to copy, not a platform to build on. This workpackage is only worth building if HyperIdle genuinely intends to support third-party extensions; if that goal has changed, the workpackage should be cut.

**Depends on.** None.

**Complexity.** M

**Acceptance criteria.**
- A developer reading the extensibility documentation can identify which parts of HyperIdle are extension points today (harness adapters, skill-tools, knowledge kinds, MCP bridge) and which are planned but not yet implemented (out-of-process plugins, skill marketplace).
- The kernel/strategy split is explained as the extensibility architecture: kernel is stable, strategy is replaceable — and a developer understands what that means for their extension.
- At least one concrete example shows how to add a new harness adapter, referencing the actual adapter interface from the codebase.
- Planned extensibility is clearly labeled as "not yet implemented."
- The document is under 3000 words.

**Validation scenarios.**
- Given a developer who wants to add a new agent runtime, when they read the extensibility doc, then they can follow the example to understand what interface to implement.
- Given a product evaluator comparing HyperIdle to Paperclip, when they read the extensibility section, then they understand the architectural difference (kernel/strategy vs plugin workers).

**Plan calls.** Skip /pipeline:design, skip /pipeline:architecture. Research the actual adapter interface, skill-tool registry, MCP bridge, and knowledge strategy fabric before writing. The harness adapter example must reference real code.

**Contracts / constraints.**
- The example references the actual HarnessAdapter interface from the codebase — no pseudocode.
- Future extensibility is vision, not commitment.

**Out of scope.**
- Building the plugin runtime.
- API stability guarantee.
- Security model for plugins.

**Effort.** M (~4h)

---

### Z8 — Feature Polish & Launch Readiness Audit

**Workpackage.** As the founder preparing for launch, I want a systematic audit of all implemented features — identifying what's polished, what's rough, and what's hidden — so that I can prioritize the final push and ensure the product's first impression matches its actual capabilities.

**Why this matters.** Without a deliberate audit, the first impression is determined by whatever the user happens to navigate to first — which may be an empty state with no CTA, a broken edge case, or a powerful feature buried five clicks deep. The founder is running blind on launch day. The cost is squandered first impressions with early adopters whose word-of-mouth matters most. This workpackage produces no code, only a prioritized punch list — its value is entirely in what the founder does with it afterward, so it should only be built if there is genuine capacity to act on the findings.

**Depends on.** None.

**Complexity.** L

**Acceptance criteria.**
- Every implemented feature is categorized as: launch-ready (polished, discoverable), built but rough (functional, needs UX polish or better defaults), hidden gem (powerful but undiscoverable), or incomplete (scaffolded, not functional end-to-end).
- Each feature entry includes: name, where to find it in the UI, how easy it is to discover, what's rough about it, and a specific recommendation for what to fix.
- A "Quick Wins" section lists the 10 highest-impact polish items fixable in 1-2 days each — concrete enough that a developer knows exactly what to change (e.g., "Knowledge list has no empty state — add a CTA when the list is empty").
- A "Hidden Gems" section identifies powerful features that users won't find without guidance, with recommendations for how to surface them (navigation entries, empty-state CTAs, onboarding hints).
- The audit is performed by actually using the running application — each finding includes the specific UI path or a screenshot as evidence.
- "Launch-ready" classification requires that the feature has test coverage — a feature that works in the UI but has no tests is "built but rough."

**Validation scenarios.**
- Given the running application, when the auditor navigates every page and settings section, then every implemented feature is categorized.
- Given the Quick Wins list, when a developer reads an entry, then they know exactly what to change.
- Given the Hidden Gems list, when a product person reads it, then they can prioritize which features to surface.

**Plan calls.** Skip /design, skip /architecture. Exploratory audit against the running application (`npm run dev`). Approach as a first-time user. Take screenshots.

**Contracts / constraints.**
- The audit is honest — features that look bad are rated honestly.
- Recommendations are actionable — "needs polish" without specifics is not acceptable.
- Reflects the current state of `main` branch only.

**Out of scope.**
- Fixing the identified issues (produces the punch list, not the fixes).
- Performance, security, or mobile responsiveness audit.

**Effort.** L (~2d)
