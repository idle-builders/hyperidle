# Agent OS, Second Brains & Open Knowledge Formats — trend research for HyperIdle direction

**Date:** 2026-08-09 · **Status:** research input, NOT a work package · **Origin:** live web research (vendor pages, standards bodies, HN threads) cross-checked against `docs/` — vendor numbers are self-reported, treat skeptically. Complements [2026-08-08-agent-ecosystem-feature-ideas.md](./2026-08-08-agent-ecosystem-feature-ideas.md) (F1–F12); new candidates here are numbered G*.

Purpose: three converging meta-trends — the "agent OS", the "second brain", and open knowledge formats/standards — assessed for what HyperIdle should take from them: ideas, features, product directions, and anti-patterns. Nothing here is decided.

### Research summary (TL;DR)

The three trends converge on one architecture: **agents acting inside an OS, reading and writing a shared markdown+git knowledge base, exchanged over open formats.** (1) The agent-OS race is consolidating around event-driven wakes, durable tasks, and artifacts returning to the surface work came from (Charlie Labs CAOS, Rivet agentOS, WUPHF) — but every entrant is per-agent or per-repo; the *organizational* OS (teams, bets, knowledge, routines) is unoccupied, which is exactly HyperIdle's shape. (2) Personal second brains demonstrably failed (HN's 348-comment "I deleted my second brain" thread: Goodhart, write-once-read-never, organizing-as-hobby); what survived — search over structure, zero-friction capture, pruning, plain files, reference notes — is what HyperIdle automates via agent writeback, promotion, attention scoring and decay. The market re-formed as *agent-readable* knowledge (Karpathy LLM-wiki → WUPHF/CodeAlmanac/Hyper), i.e. knowledge maintained by agents for agents. (3) Open formats won: markdown+frontmatter+git everywhere; the protocol stack (AGENTS.md, MCP, ACP, A2A, agentskills.io) consolidated under Linux-Foundation governance; and Google's **OKF (2026-06-12)** gave the knowledge layer its first candidate standard — including trust/provenance/freshness fields that mirror HyperIdle's promotion/decay machinery. **HyperIdle comparison (§below): 10 of 13 trend elements are already built** (five-layer store, markdown projection, writeback, promotion, decay, KCS-style L3, budgeted context assembly, routines, harness abstraction, proposal-gated writes); the gaps are exposure, not invention — OKF-conformant git export (G1), knowledge out over MCP (G2), hygiene/lint + supersedes (G3), event-driven wakes (G4), visible maintenance (G5), provenance attestation (G6), session-economy metrics (G7).

---

## Context snapshot — three trends, one convergence

1. **"Agent OS" is saturated as a label but converging as an architecture.** A dozen Show HNs in six months call themselves an "agent OS" (all low traction, 1–5 points — https://hn.algolia.com search "agent OS", 2026-01…07) while two serious articulations emerged: Charlie Labs' "CAOS: Coding Agents as Operating Systems" (2026-01-30, event-driven runtime, durable tasks, CLI-first, artifacts posted back to the surface where work happened — https://charlielabs.ai/coding-agents-as-operating-systems/) and Rivet's agentOS (OS-as-library: WASM/V8 isolates, per-agent POSIX filesystem with mounts, orchestration, "ACP and A2A at the agent boundary" — https://rivet.dev/agent-os/). The term means whatever the speaker needs it to mean; the *architecture* (scheduler, durable execution, memory, filesystem, permissions) is consolidating.
2. **The personal second brain collapsed; the agent-readable brain rose.** The defining community artifact is "I deleted my second brain" (HN 598 points, 348 comments, 2025-06 — https://news.ycombinator.com/item?id=44402470): a year of PKM failure modes documented by the crowd. One year later the same crowd builds knowledge *for agents*: WUPHF's git-native team wiki (HN #1 of Life-of-Product week, https://github.com/nex-crm/wuphf), CodeAlmanac (agent-maintained repo wiki, YC S26 — https://github.com/AlmanacCode/codealmanac/), Hyper's "company brain" (YC P26 — https://heyhyper.ai/), OpenKnowledge (AI-first OSS Obsidian alternative, 381 points — https://github.com/inkeep/open-knowledge), Files.md (730 points — https://github.com/zakirullin/files.md). The buyer changed: people now maintain knowledge that *their agents* read.
3. **Open knowledge formats won, and the protocol stack crystallized under the Linux Foundation.** Markdown + YAML frontmatter + git is the de-facto interchange format across every camp. MCP was donated to the new Agentic AI Foundation (2025-12-09 — https://www.anthropic.com/news/donating-the-model-context-protocol-and-establishing-of-the-agentic-ai-foundation); AGENTS.md is stewarded by the same foundation (60k+ repos — https://agents.md/); A2A shipped v1.0 under the Linux Foundation with an enterprise TSC (https://a2a-protocol.org/); Goose joined AAIF (see 2026-08-08 doc). Standards are becoming neutral infrastructure, and markdown is the substrate all of them ride on. And since 2026-06-12 the *knowledge layer itself* has a first candidate standard: Google's **Open Knowledge Format (OKF)**, which formalizes Karpathy's LLM-wiki pattern into portable markdown+frontmatter bundles (https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing/).

**The convergence:** agents need an OS to act (trend 1), knowledge to act *well* (trend 2), and open formats to keep both portable and owned (trend 3). HyperIdle is one of very few products that already fuses all three — conversations + bets + routines (OS), five-layer knowledge with agent writeback (brain), markdown-sandbox projection (open format). The strategic question this research answers: which parts of that position to strengthen, expose, and market.

---

## Trend 1 — Agent OS

### What's out there

- **Charlie Labs "CAOS"** (2026-01-30): the strongest written thesis. A coding agent is "an operating system for the model": event-driven runtime (starts from GitHub/Linear/Slack/Sentry events), scheduler + interrupts with durable tasks and single-winner claiming, turn-based durable execution kernel, ephemeral devbox compute, **CLI as primary interface** ("CLI expressiveness beats bespoke LLM tools" — composable, self-documenting), guardrails + visibility, durable artifacts + opt-in cross-run memory. Two hot takes worth stealing: CLI > bespoke JSON tools; open-loop orchestration > rigid workflows. https://charlielabs.ai/coding-agents-as-operating-systems/
- **Rivet agentOS** (2026-04/05): OS as an npm library — per-agent WASM/V8-isolate VM, persistent POSIX filesystem mounting S3/Drive/host dirs, orchestration (workflows, crons, agent-to-agent, HITL), deploys AI-generated apps; claims 92× faster cold starts / 47× less memory / 254× cheaper vs sandboxes (self-reported, methodology published). Runs Claude Code, Codex, OpenCode, Pi in one runtime. Built on ACP + A2A. https://rivet.dev/agent-os/ · https://github.com/rivet-dev/agentos
- **WUPHF by Nex.ai** (YC S26, 1.2k stars): "Slack for AI employees with a shared brain" — CEO/PM/engineer agents visible in channels, arguing, claiming tasks. OS-relevant engineering: fresh session per turn (flat ~87k input tokens vs 124k→484k growth in accumulated-session orchestrators, self-reported), 97% prompt-cache hits, per-role MCP scoping (4 tools in DM vs 27 in full office), push-driven wakes (zero idle burn). https://github.com/nex-crm/wuphf
- **The long tail:** AgentArk, Hollow, Octopoda, Sovereign, earthwalker17/agent-os, saadnvd1/agent-os (multi-Claude-session web UI), OpenCognit, AXION — all Show HNs, all ≤5 points. Signal: the label is free, nobody owns it, and the per-agent-runtime framing is crowded.

### What the community reports

- **What works:** agents that start from *real events* (a mention, a failing build, a scheduled trigger) and return *reviewable artifacts to the surface the request came from* — Charlie Labs' whole flow; WUPHF's "if it feels like a hidden agent loop, something is wrong; if it feels like The Office, you're exactly where you need to be."
- **What doesn't:** accumulated session context (cost blowup measured by WUPHF's benchmark); bespoke one-off JSON tools that can't compose; agent loops hidden behind an API (visibility is the product); "orchestration tax" (re-implementing safety/memory/tool handling per project — recurring Show HN framing).
- **Cost legibility is the emerging battleground:** token/cost benchmarks in READMEs (WUPHF), cache-hit rates, per-role tool scoping to shrink prompts. Matches the 2026-08-08 doc's F3 signal (Databricks cutting AI-coding spend 70%).

### Meaning for HyperIdle

HyperIdle's primitives already *are* an agent OS — Routines (scheduler), Bets/Tasks (durable work units), Sessions (execution), knowledge layers (memory), sandbox files (filesystem). The gap is not architecture but **framing and loop completeness**:

- **Direction D1 — own "the organizational agent OS", not "an agent OS".** Every competitor is per-agent (runtime for one agent) or per-repo (coding OS). Nobody ships the *company-shaped* OS: teams, bets, knowledge, routines, agents as named teammates. The term is saturated with low-traction clones — differentiate on the org layer, never on the label alone.
- **Direction D2 — close the event→artifact loop in conversations.** Charlie Labs proved the loop for GitHub/Linear/Slack. HyperIdle's native version: any message/mention/bet-deadline/routine-trigger wakes an agent; the agent's artifacts land back in *the same conversation* as reviewable items (blocks, diffs, knowledge proposals). This is the conversation-first answer to CAOS and the strongest available product narrative.
- **Direction D3 — keep files, not bespoke tools, as the agent interface.** Charlie's CLI thesis validates HyperIdle's markdown-sandbox projection (docs/knowledge-architecture/the-knowledge-fabric-how-knowledge-moves.md §4 "context assembly, not FUSE"). Resist growing a large bespoke JSON tool surface; `write_memory`-style seams + plain files is the ecosystem-proven shape.
- **Direction D4 — session economy as a visible property.** Fresh-context assembly (AU25's delta work), prompt-cache-friendly prefixes, per-role context scoping — WUPHF's benchmarks show this is now marketing-grade differentiation. HyperIdle already assembles budgeted context (40K-token budget, relevance scoring); surfacing the economy (tokens/bet, cache hits, $) feeds F3/F5 from the 2026-08-08 doc.

---

## Trend 2 — Second brain

### The collapse (what the community reports doesn't work)

From the 348-comment "I deleted my second brain" thread (HN 44402470, 2025-06) — the largest recent dataset of PKM failure reports:

- **Goodhart's law:** the system becomes the goal; unprocessed captures turn a second brain into a todo list; "Second brain is not an archive, it's a process."
- **Organizing becomes a full-time hobby:** "hours in Notion, Obsidian, Vimwiki creating MOCs, unused links, nice little home pages"; gurus with 100k atomic notes "reveal that taking and organizing notes is the only thing they do."
- **Write once, read never:** after 3–4 PARA/Zettelkasten cycles, "I feel like a slave to the system… most of my notes are write once, read never."
- **Collector's fallacy:** "I bought into the illusion that having notes meant I had knowledge. Bigger graph = smarter me… I started reading books just to feed the system."
- **Deferred thought:** the article's most-quoted line — "I deferred the work of thought to some future self who would sort, tag, distill, and extract the gold. That self never arrived."
- **Backlinks/atomic notes collapse:** "all-in on backlinks and atomic notes… it ended up being unsearchable"; PARA collapses to "PR"; Zettelkasten dogma called "procrastination" by multiple commenters; Roam "cult" and tool-hopping fatigue.
- **Corporate wikis fail identically:** "most large orgs buy Confluence, and you cannot find anything in Confluence."

### What the community reports works

- **Search over structure:** one inbox + one archive, "no system, no curation… 0 thought cycles"; "with current search tools, no need for a complex system."
- **Boring defaults stick:** Apple Notes, ~2,500 notes, "the only habit that stuck… KISS on purpose."
- **Reference/how-to notes are the one class that pays:** "about 1 in 100 turn out to be extremely useful when I want to remember how I did something 10 years ago"; "I can't count the number of times my notes have saved me or my team." Keep slow-changing facts (part numbers, renewal dates, decisions-and-why).
- **Capture for the current project, archive on completion** — capture must be near-zero friction or it doesn't happen ("If it takes 1 minute of scrambling in a GUI to find a note, you stop writing new ones").
- **Periodic pruning beats nuclear deletion:** 8–12-week review culls; "if you don't do regular forest fires, one day you will need to nuke everything."
- **Keep sources, not ideas** — future-you re-derives ideas; sources are the durable asset.
- **Plain text as the durable answer:** "plaintext or markdown is the ideal format"; "the draw of Obsidian is plain text notes that are effectively future proof"; proprietary formats rot ("15-year-old RTF files were basically trash"; a deceased parent's notes "locked into various proprietary apps").
- **The center of gravity:** "moderation, not deletion" — capture less, organize less, search more, let AI handle the organization/retrieval layer over plain files you own.

### The AI-era renaissance

- **Agents as the new PKM interface:** commenters restart vaults and use Claude Code/Cursor "to help me decide where stuff should go"; "agentic workflow is really effective outside of coding" (non-technical users organizing interview transcripts); "with GenAI the value of these tools as Knowledge Management goes down, but they're more like a Workspace with work logs and pointers."
- **Knowledge maintained *by* agents, *for* agents:** CodeAlmanac (YC S26) keeps an `almanac/` folder of connected markdown pages auto-updated every 5 hours by an agent reading your conversations, indexed in SQLite, wired into AGENTS.md so future sessions search it first — "relief knowing the decisions I made are written down somewhere their agents will actually read" (https://github.com/AlmanacCode/codealmanac/). WUPHF's wiki: per-agent notebooks promoted to a shared git-native markdown wiki, typed-fact triplets, LLM-synthesized briefs committed under an `archivist` identity, `/lint` that flags contradictions/orphans/stale claims (https://github.com/nex-crm/wuphf).
- **The "company brain" is now a named category:** Hyper (YC P26, https://heyhyper.ai/) ingests Docs/Slack/Email/Calendar into episodes + facts (subject-predicate-object with introduced/invalidated timestamps, `supersedes` edges, provenance, access-control tags, hybrid semantic+FTS retrieval) — founders explicitly frame it as "second brain, but an AI can read it." An Ask HN on AI funding paths lists "Company Brains" as one of six recognized plays (2026-06). Their MCP critique is a gift: (1) session-scoped insight dies with the session, (2) MCP gathering is never comprehensive, (3) no meta-reasoning — it won't learn your taste or *why* a decision was made unless told.
- **Incumbents pivoting:** Mem 2.0 relaunched as "the first AI thought partner" (2025-10 — https://get.mem.ai/blog/introducing-mem-2-0); Khoj continues as OSS second-brain-with-agents (updated 2026-07); Screenpipe (YC S26) records screen/audio as agent-searchable memory; Rowboat pitches "work app, not chat app."
- **Trust shock:** an Obsidian community plugin was abused to deploy a RAT (2026-05, 366 points — https://cyber.netsecops.io/articles/obsidian-plugin-abused-in-campaign-to-deploy-phantom-pulse-rat/), concurrent with Obsidian's own "Future of Plugins" roadmap post (452 points — https://obsidian.md/blog/future-of-plugins/). The plugin/skill ecosystem supply-chain risk is now a *real learning*, not a hypothetical.

### Meaning for HyperIdle

HyperIdle's knowledge architecture is the *answer* to every documented failure mode — the marketing writes itself, if surfaced:

- **Direction D5 — "the second brain that maintains itself".** Every PKM failure mode maps to machinery HyperIdle already has: organizing-as-hobby → agent writeback + facilitators; write-once-read-never → attention scoring + 90-day decay routine; collector's fallacy → promotion needs repetition across 5+ scopes, not volume; deferred thought → agents do the distillation (L1→L3 auto-promotion); pruning anxiety → `builtin:knowledge-decay`. The product story: humans curate, agents organize, knowledge that isn't used retires itself.
- **Direction D6 — knowledge is for agents first, humans second — say it.** The Hyper founders' insight ("a second brain is far more powerful if an AI can read it") is HyperIdle's default state, not an add-on: agents read markdown projections, write proposals, get assembled context per session. HyperIdle should market the L3 practice layer explicitly as KCS-for-agents ("reuse before create" — already credited in docs/knowledge-architecture/the-five-layers.md provenance).
- **Direction D7 — the memory-layer competitors are not OS competitors.** Hyper, Mem, Khoj, OpenKnowledge are memory/knowledge layers with no work primitives (no bets, tasks, routines, teams). Risk is being *bypassed* (their memory plugged into harnesses directly); opportunity is *becoming the memory backend* for external agents too (see G2). HyperIdle's moat is that knowledge is produced by real work (task outcomes, decisions, failures), not ingested from Slack firehoses — Hyper's own critique of MCP ("partial information, no why") is exactly what HyperIdle's decision/failure knowledge kinds solve.
- **Direction D8 — capture happens inline with work, never in a separate app.** Community consensus: capture friction kills second brains. HyperIdle's capture is already inline (conversation → writeback), but any future capture surface must stay zero-friction and agent-assisted — no "add to knowledge" ceremony.

---

## Trend 3 — Open knowledge formats & where standards are going

### The format layer

- **Markdown + YAML frontmatter + git is the settled interchange format.** AGENTS.md = "just standard Markdown, no required fields" (https://agents.md/); llms.txt = structured markdown by spec (https://llmstxt.org/); agentskills.io = SKILL.md markdown folders (see 2026-08-08 doc §F6); ACP's default user-readable format is Markdown (https://agentclientprotocol.com/); WUPHF wiki, CodeAlmanac, wuphf-style "Karpathy wikis" all markdown+git. The HN second-brain thread's plain-files ethos (exit rights, future-proofing, proprietary-formats-rot) and the agent ecosystem converged on the same answer from opposite directions.
- **llms.txt — the pattern matters more than the adoption.** Real adoption is thin (one 1,500-site crawl found 0.2% serve it, 30% block AI bots — https://websiteaiscore.com/blog/case-study-1500-websites-ai-readability-audit), but the *shape* spread: curated, token-budgeted, markdown index into a corpus, with `.md` alternates of HTML pages; Vercel proposed inline LLM instructions in HTML (2025-08 — https://vercel.com/blog/a-proposal-for-inline-llm-instructions-in-html); domain-specific derivatives appeared (CommerceTXT, "robots.txt + llms.txt for transactions", 2025-12 — https://commercetxt.org/). MCP's own docs serve an llms.txt index. The pattern = what HyperIdle's context assembly already does internally (curated, ranked, 40K-budgeted pack per session).
- **Git is becoming the memory substrate.** Letta's context repositories (2026-08-08 doc §F7), WUPHF's wiki (git log as the author chain, `archivist` commits), CodeAlmanac's repo folder. Versioned, diffable, reviewable knowledge is the community's answer to opaque memory blobs.
- **Structured knowledge rides *on top of* markdown, not instead of it.** Hyper's SPO triplets with supersedes edges + provenance; WUPHF's typed facts + contradiction lint; Mozilla.ai's Cq "knowledge units" (standard schema for agent-learned gotchas, local-first SQLite + MCP, HITL review before team visibility, 225 points — https://blog.mozilla.ai/cq-stack-overflow-for-agents/). Notably Cq's authors explicitly reject stuffing CLAUDE.md/AGENTS.md with rules — "targeted information on a particular task… a lot more useful." Retrieval beats accumulation.

### Google's Open Knowledge Format (OKF) — the knowledge layer gets its first candidate standard

**What it is (2026-06-12):** OKF formalizes the LLM-wiki pattern into "a portable, interoperable format… vendor-neutral, agent- and human-friendly" for "the metadata, context, and curated knowledge that modern AI systems need." An OKF **bundle** is a directory of markdown files; each file is a **concept** (table, metric, playbook, runbook, API — anything); file path is identity; concepts link via normal markdown links forming a graph; optional `index.md` (progressive disclosure) and `log.md` (chronological history). Frontmatter carries the queryable fields — v0.1 required only `type` (plus title/description/resource/tags/timestamp); **v0.2 adds trust, provenance and freshness as first-class frontmatter**: `sources` with per-source credibility signals, `generated`/`verified` (from which consumers derive a trust tier), `status`, `stale_after`. Three design principles: minimally opinionated, producer/consumer independence, **format not platform** ("will never require a proprietary account or SDK"). Shipped with a reference enrichment agent, a self-contained HTML graph visualizer, sample bundles; Google Cloud's Knowledge Catalog ingests/serves OKF. Repo: https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf (8.4k stars) · blog: https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing/

**Provenance — Karpathy's LLM-wiki gist (2026-04-04, 5k+ stars/forks):** https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f. The pattern OKF formalizes: instead of RAG re-deriving knowledge per query, the LLM **incrementally builds and maintains a persistent wiki** — "the knowledge is compiled once and then *kept current*". Three layers: immutable raw sources / LLM-owned wiki / schema doc (CLAUDE.md/AGENTS.md) defining conventions. Three operations: **ingest** (a source touches 10–15 pages), **query** (good answers filed *back* into the wiki), **lint** (contradictions, stale claims, orphans, missing pages). "LLMs don't get bored, don't forget to update a cross-reference, and can touch 15 files in one pass… humans abandon wikis because the maintenance burden grows faster than the value." Explicit Memex lineage. This is the same pattern behind WUPHF's wiki and CodeAlmanac (above), now with Google's weight behind interop.

**Community learnings from the gist thread (July–Aug 2026) — real operational scar tissue:**
- **Knowledge rot is the named problem.** Cortexes (https://github.com/XBlueSky/cortexes): "capturing everything is easy; deciding what deserves to become knowledge is the harder problem"; distillation must *fuse into existing pages* ("correcting assumptions and adding caveats") rather than accumulate notes; retrieval = hybrid BM25+vector with reciprocal-rank fusion; durable artifact stays markdown+git.
- **Compiled wikis compound fabrications.** A measured failure mode (https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f, comment by antondzi): a compiled wiki answers more confidently than raw retrieval, so a confident fabrication gets filed back as a page and *becomes a source*. Their measured fix: relevance-threshold rule in the schema — the agent must say "the wiki has no confident answer" instead of synthesizing from low-relevance hits, and such non-answers are never filed back.
- **Trust lifecycle for memories.** Link (https://github.com/gowtham0992/link): review-gated memory ("nothing durable without review"), per-type review windows (project context 3 months, preferences 6, decisions 12 — aged memories get labeled "review due" where agents read them), supersede-based contradiction detection, dedupe/fingerprinting of captures, and a **memory-poisoning benchmark** (15 injection attacks on the memory write path run in CI) — "agent memory is the biggest prompt-injection target there is."
- **Trust boundaries once knowledge moves between machines** (llmwiki, https://github.com/suwonleee/llmwiki): "a clone is not consent"; the installing agent is your least-trusted user; fail closed.
- **Skeptic counterpoint:** the semantic-web camp argues frontmatter isn't machine-executable and RDF/SPARQL already solves semantics (gist comment, GeraldGrootRoessink). Minority view in practice — the ecosystem is converging on markdown anyway — but worth knowing the ceiling of OKF's ambition (interop surface, not content model).

**Read:** OKF is the llms.txt of knowledge bases — thin spec, big gravity, vendor-neutral, explicitly inviting producers/consumers. v0.2's trust/freshness frontmatter is the standard catching up to what maintenance requires. For HyperIdle this is both validation (our fabric is the same architecture) and a concrete conformance target for export (G1).

### The protocol stack (governance consolidation)

| Layer | Standard | Governance | Trajectory |
|---|---|---|---|
| Static project instructions | AGENTS.md (60k+ repos) | Agentic AI Foundation (Linux Foundation) | Won; CLAUDE.md-era files converging into it; even Apple shipped one accidentally (2026-05, HN 384 pts) |
| Agent ↔ tool/context | MCP (spec 2025-06-18) | Donated to AAIF 2025-12-09 | Ubiquitous as the tool seam; "is MCP dead" debate persists (ismcpdead.com, 2026-04) — criticism is about server quality/discovery, not the protocol; debugging tooling emerging (MCPShark) |
| Editor ↔ agent | ACP (Agent Client Protocol) | Zed-originated, multi-vendor | LSP-analogue; JSON-RPC stdio + remote WIP; goose/Nimbalyst support it (2026-08-08 doc) |
| Agent ↔ agent | A2A v1.0 | Linux Foundation; TSC = AWS, Cisco, Google, IBM, Microsoft, Salesforce, SAP, ServiceNow | Spec stable, 6 SDKs; explicitly *complementary* to MCP; enterprise-flavored governance |
| Portable capabilities | agentskills.io (SKILL.md) | Cross-tool de facto (Anthropic/Google/Charm et al.) | Hot (2026-08-08 doc §F6); registries/hubs forming (WUPHF publishes skills to anthropics/lobehub/github hubs) |
| Knowledge interchange | OKF v0.2 (markdown bundles) | Google-published open spec, PRs/issues open, versioned for backward-compatible growth | Brand new (2026-06-12), 8.4k-star repo, Knowledge Catalog ingests it; first serious candidate for the layer every memory product still rolls itself |
| Website ↔ LLM | llms.txt | Answer.AI proposal, informal | Thin adoption, strong pattern gravity |

**Reading of the direction:** (1) every durable standard is landing in neutral foundations — vendor-owned knowledge formats are a dying category (OKF is Google-published but explicitly format-not-platform, no account/SDK); (2) the stack is layering cleanly (instructions → context/tools → client UX → agent interop → capabilities → knowledge interchange) instead of one standard eating all; (3) markdown is the universal substrate; (4) memory/knowledge was the one layer with no standard — **OKF v0.2 is the first credible candidate**, with trust/provenance/freshness fields already in the spec; the race is now about who ships real producers/consumers early.

### Community trust signal worth banking

The Obsidian plugin RAT attack (2026-05) is the ecosystem's first real supply-chain learning for agent-extension marketplaces. ETHOS says security is earned from real learnings, never preemptive — *this is a real learning*. Any HyperIdle skill/knowledge exchange (F6 registry, G2 MCP exposure) should carry provenance (who authored, what it touches, signature/attestation) from day one — not a policy engine, just a verifiable paper trail.

---

## HyperIdle vs the trends — what we already have, what's missing

Side-by-side of each trend element against current HyperIdle (evidence = `docs/` ground truth + code paths cited there). Verdict column: ✅ built · 🟡 partial · ⬜ gap.

| # | Trend element (source) | HyperIdle today | Verdict | Gap → candidate |
|---|---|---|---|---|
| 1 | LLM-maintained wiki: ingest/query/lint operations (Karpathy gist) | Ingest+maintenance exist as agent writeback from sandbox `knowledge/` zone + writeback-processor + facilitators; query exists as budgeted context assembly (`session-knowledge-assembler.ts:77-97`) | 🟡 | **lint operation missing** (contradictions/orphans/stale-claim passes) → G3 |
| 2 | Knowledge as markdown+frontmatter bundles, OKF-conformant (Google OKF v0.2) | Agents already read/write markdown (fabric doc §3; `context.ts:527-536`), but projection is body-verbatim, slugified filenames, **no frontmatter**, DB is the only durable store | 🟡 | frontmatter + OKF-conformant export → G1 |
| 3 | Trust/provenance/freshness fields: `sources`, `generated`, `verified`, `status`, `stale_after` (OKF v0.2) | `version` column + edit log (optimistic locking, fabric doc §2); staleness via 90-day decay (`promotion-pipeline.ts:34`); `needs_human` flag (canonical-store doc) | 🟡 | no supersedes edges, no source-credibility, no review-due labels → G3/G5 |
| 4 | Progressive disclosure: `index.md` per directory, `log.md` chronology (OKF/Karpathy) | `.fabric/manifest.json` tracks versions but is hidden from the agent; no navigable index for external consumers | ⬜ | index generation rides G1/G2 |
| 5 | Promotion: what deserves to become durable knowledge (Cortexes: "the harder problem"; WUPHF notebook→wiki) | Auto-promotion at 5+ distinct scopes on same `(layer, topic, kind)` signature (`promotion-pipeline.ts:27`); L1→L3→L4 ladder (five-layers doc) — *threshold-based*, not agent-judged | ✅ | agent-judged promotion hints (WUPHF-style) are an open question for /refine, not a gap |
| 6 | Anti-rot: fusion over accumulation, decay, contradiction flagging (Cortexes, WUPHF `/lint`, Hyper supersedes) | Decay routine `builtin:knowledge-decay` + promotion routine exist (five-layers doc §L3); `anti_pattern` is a first-class kind (`framework/shared/src/knowledge.ts:41-49`) | 🟡 | contradiction detection + supersession → G3 |
| 7 | Write-path trust: proposals reviewed, poisoning defense (Link's review gates + poisoning benchmark; Obsidian plugin RAT) | Strong position: agents write *proposals* in `knowledge/`, diffed and written back — never direct writes (fabric doc §3); `needs_human` flag for attention triage | ✅ | provenance/attestation only needed at exchange boundaries → G6 |
| 8 | Compiled-wiki fabrication risk: low-relevance synthesis filed back as fact (gist measurement comment) | Writeback captures what agents assert; no relevance-threshold rule on knowledge proposals; no "no confident answer" convention | ⬜ | schema/prompt rule + lint check → folds into G3 |
| 9 | Second-brain failure cures: zero-friction capture, search-over-structure, visible pruning (HN 44402470) | Capture is inline with work (writeback, no separate app); relevance/attention scoring (relevance-and-attention doc); decay prunes silently | ✅ | **invisibility** — none of this is surfaced to users → G5 |
| 10 | Event-driven agent OS: wakes from real events, artifacts back to the surface (CAOS, WUPHF push-wakes) | Routines = in-process schedulers (e.g. `core-api/routine/src/routine-scheduler.ts`); sessions mostly human-initiated | 🟡 | event→agent→artifact loop in conversations → G4 |
| 11 | Session economy: flat context, cache-friendly, cost legible (WUPHF benchmark, Databricks) | Budgeted assembly (40K token budget, `rank()` in `relevance-scoring.ts:209-216`); AU25 delta/resumable-session work; capture seam exists (run-unit-model doc) | 🟡 | nothing surfaced → G7 |
| 12 | Knowledge out over MCP (Recall, Hyper's memory-backend play; MCP = AAIF-governed seam) | MCP bridge exists *inbound* (harness-capability-descriptor doc) — tools into sessions; no outbound knowledge server | ⬜ | HyperIdle knowledge as MCP resources/tools → G2 |
| 13 | Portable conventions: AGENTS.md, agentskills.io (AAIF/cross-tool) | Uses AGENTS.md + SKILL.md skills (`.opencode/`, `.claude/`, `.agents/`); pipeline skills are mature | 🟡 | full agentskills.io conformance + registry → F6 (2026-08-08 doc) |

**Net assessment:** HyperIdle implemented the Karpathy/OKF architecture *before it had a name* — the five-layer store with agent writeback, promotion, decay and markdown projection is the same system the ecosystem is now standardizing, plus two things nobody else has: knowledge produced by **real work** (task outcomes, decisions, failures as first-class kinds) and a **work model** around it (bets, teams, routines). The gaps are all *exposure and hygiene*, not invention: export/conformance (G1), outbound access (G2), maintenance operations (G3), loop completeness (G4), visibility (G5), boundary trust (G6), economy metrics (G7). The strategic risk is timing: OKF is 4 weeks old and the memory-layer standard race is open — an early, local-first, work-produced OKF producer/consumer would be unique in the field.

---

## Takeaways for HyperIdle

### Strategic directions (D1–D8 above, condensed)

1. **D1 — Position as the organizational agent OS** (teams/bets/knowledge/routines), never "an agent OS" (crowded, per-agent, low-traction).
2. **D2 — Close the event→artifact loop in conversations** (CAOS pattern, conversation-first).
3. **D3 — Files over bespoke tools** as the agent interface (validated by CAOS thesis + fabric doc).
4. **D4 — Make the session economy visible** (tokens/cost/cache per bet; feeds F3/F5).
5. **D5 — "The second brain that maintains itself"** — market the existing promotion/decay/attention machinery as the cure for documented PKM failure modes.
6. **D6 — Agents-first knowledge, said out loud** — L3 as KCS-for-agents; knowledge produced by real work beats ingested firehoses.
7. **D7 — Be the memory backend, not just a competitor** — memory-layer startups (Hyper/Mem/Khoj) lack work primitives; expose HyperIdle knowledge instead of being bypassed by them.
8. **D8 — Zero-friction inline capture only** — never a separate capture surface or ceremony.

### Feature candidates (G*)

#### G1 — Git-native knowledge export: L2–L4 as an OKF-conformant markdown repository

**What:** Implement the sketched git export (docs/knowledge-architecture/facilitators.md): human-readable knowledge (product briefs/architecture/principles, practices, factory items) lives as a versioned markdown repo — diffable, reviewable, `git clone`-portable — synced from the canonical store, **conformant to Google's Open Knowledge Format**: one concept per file, YAML frontmatter (`type`, `title`, `description`, `tags`, `timestamp` + v0.2 trust fields `status`, `stale_after`, `sources`, `generated`, `verified` mapped from layer/kind/decay-state/provenance), `index.md` per scope for progressive disclosure, `log.md` from the edit log.
**Background:** Git-as-memory converged from three directions — Letta's context repositories (2026-08-08 §F7), WUPHF's wiki (git log = author chain, archivist commits), CodeAlmanac (repo-folder wiki agents read first) — and Google standardized the interchange shape (OKF, 2026-06-12). The HN second-brain crowd independently demands plain-files+git as exit rights. HyperIdle's fabric doc already states the rule: "if a file is human-readable, a human will actually read it… human-curated knowledge ships as markdown." Conformance is cheap because the projection is already markdown; what's missing is frontmatter + repo shape.
**Relevance:** Exit rights/ownership, any external agent can consume HyperIdle knowledge with zero integration, knowledge becomes a reviewable artifact stream (trust thesis), and HyperIdle becomes an early local-first OKF producer — the memory-layer standard race is 4 weeks old. Subsumes and strengthens F7.
**Size:** M–L. **Open questions:** one-way projection vs bidirectional sync (writeback already solves half); repo per product or per workspace; does the git repo become canonical for L4 (database stays canonical for L0–L2); which OKF `type` vocabulary maps the knowledge kinds?
**Sources:** cloud.google.com OKF blog + github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf (SPEC.md), letta.com/blog/context-repositories (via 2026-08-08 doc), github.com/nex-crm/wuphf, github.com/AlmanacCode/codealmanac, HN 44402470.

#### G2 — HyperIdle knowledge as an MCP server (memory backend for any harness)

**What:** Expose knowledge_items (search, read by scope/layer, propose-write) as MCP resources/tools so Claude Code, Codex, OpenCode, cursor-agent — inside *and outside* HyperIdle sessions — can read the company brain.
**Background:** MCP is the settled tool seam (AAIF-governed); Hyper's launch post documents exactly why raw MCP-on-Slack/Drive fails (session-scoped insight, partial gathering, no why) — a curated store with layers, promotion and provenance is the fix; Recall (MCP memory server, HN 171 pts) shows demand for bolting memory onto harnesses. No standard exists for the memory layer yet (see protocol table) — first credible local-first implementation could shape it.
**Relevance:** Turns HyperIdle from "an app agents live in" into "the brain agents read" — distribution without a browser. Local-first posture intact (server runs beside PGlite). Composes with G1: the same knowledge can be served as OKF bundle (file consumers) *and* MCP resources (live consumers) — producer/consumer independence is OKF's explicit design goal.
**Size:** S–M. **Open questions:** read-only first (write = knowledge proposal through existing writeback path)? Which harness consumes it first — the five supported ones, obviously, but do external IDE agents get the same surface?
**Sources:** modelcontextprotocol.io (spec 2025-06-18), anthropic.com AAIF announcement, heyhyper.ai launch post (HN 48387095), npmjs.com/@joseairosa/recall, OKF SPEC.md.

#### G3 — Knowledge hygiene: contradiction detection, supersedes links, provenance ("wiki lint")

**What:** Lightweight structure on knowledge items: `supersedes` edges, introduced/invalidated timestamps, source provenance, and a routine/lens that flags contradictions, orphans, and stale claims in the Knowledge view.
**Background:** WUPHF ships `/lint` flagging contradictions/orphans/stale claims and typed fact triplets; Hyper ships SPO facts with supersedes semantics ("we'll ship Friday" superseded by "we're shipping Monday", never auto-discarded so you can ask *how* you landed on Monday) and provenance on every fact; OKF v0.2 put the same signals into the standard's frontmatter (`status`, `stale_after`, `sources` credibility, `generated`/`verified` trust tiers); the Karpathy gist thread measured the compounding-fabrication failure mode and prescribes a schema rule ("the agent must say 'the wiki has no confident answer'… never filed back"). HyperIdle already has the decay routine (staleness) and decisions/failures as kinds; it lacks contradiction handling and explicit supersession.
**Relevance:** Directly serves D6 (knowledge agents can trust); makes the Knowledge view a place where truth is *maintained*, not just stored — the anti-Confluence. Aligning field semantics with OKF v0.2 now costs nothing and keeps G1/G2 conformant.
**Size:** M. **Open questions:** contradiction detection = routine, review lens (F10), or facilitator? Supersedes edge = schema column or knowledge kind? Does the lint pass run as sleep-time compute (F2)?
**Sources:** github.com/nex-crm/wuphf (DESIGN-WIKI.md, WIKI-SCHEMA.md), heyhyper.ai launch post, OKF SPEC.md (v0.2 trust fields), Karpathy gist thread (antondzi measurement comment).

#### G4 — Event-driven agent wakes from conversations + artifacts returning to the surface

**What:** Agents wake on real events — @mention, bet deadline, routine trigger, task state change, external webhook — and their output lands back in the originating conversation as reviewable blocks/artifacts, not a side channel.
**Background:** Charlie Labs' CAOS flow (interrupt → normalize → durable task → executor claims → artifacts published back → terminal status + telemetry) is the reference architecture; WUPHF's push-driven wakes (zero idle burn) prove the economics; HyperIdle today is mostly human-initiated sessions + scheduled routines.
**Relevance:** This *is* D2 — the conversation-first agent OS loop. Composes with F1 (review queue) and F9 (interactive blocks).
**Size:** L. **Open questions:** which events first (mention is obvious; bet-deadline approaches? failed task outcomes?); does an event create a task or a session; notification vs auto-act boundary (ETHOS: default is act — review only where chosen/earned).
**Sources:** charlielabs.ai/coding-agents-as-operating-systems, github.com/nex-crm/wuphf (benchmark section).

#### G5 — Surface the self-maintaining brain: usage metrics + visible decay

**What:** Show attention/relevance scores, last-used dates, promotion lineage (L1 discovery → L3 practice), and decay candidates in the Knowledge view; a "knowledge that paid off" digest (which practice was loaded into which session, which task outcome cited it).
**Background:** The PKM collapse was a *visibility* failure — nobody could see which notes earned their keep ("I literally don't access 90% of my notes… of no value other than making me feel something about myself", HN). HyperIdle computes all of this already (relevance scoring, attention score, promotion pipeline, decay) and shows almost none of it.
**Relevance:** Cheapest way to make D5 credible — proof, not promise. Also feeds the sleep-time-compute story (F2): idle agents consolidating knowledge become legible.
**Size:** S–M. **Open questions:** metric granularity per item vs per layer; does "loaded into session" count as usage or only writeback/citation?
**Sources:** HN 44402470 (thread summary), docs/knowledge-architecture/relevance-and-attention.md, promotion-pipeline.ts.

#### G6 — Skill/knowledge provenance attestation for any exchange surface

**What:** Every skill or knowledge item that crosses a boundary (registry install, MCP exposure, import) carries authorship, source, and a signature/checksum — a paper trail, not a gate.
**Background:** The Obsidian plugin RAT campaign (2026-05) is the ecosystem's first real supply-chain learning; ETHOS says friction is added *afterward, narrowly, from real learnings* — this qualifies. WUPHF's skills publish/install (gh-PR-based, pinned SHA256 for bundled binaries) shows the lightweight end of the solution space.
**Relevance:** Precondition for doing F6 (skills registry) and G2 (MCP exposure) without inheriting the plugin-marketplace failure mode. Trust thesis intact: provenance enables trust, it doesn't gate.
**Size:** S. **Open questions:** attestation = git signature (fits local-first) or keypair; does the community flagging ETHOS mentions attach here?
**Sources:** cyber.netsecops.io Obsidian RAT article, github.com/nex-crm/wuphf (skills + privacy sections), ETHOS.md §2.

#### G7 — Session-economy dashboard (tokens, cache, $ per bet)

**What:** Per-session and per-bet visibility into assembled-context size, cache behavior, model-mix cost — the numbers WUPHF markets with.
**Background:** WUPHF's README benchmark table (flat 87k vs growing 484k input, 97% cache hits, $0.06/5-turn) is the new competitive format; Databricks' 70% AI-coding-cost governance story (2026-08-08 §F3) shows the demand at company scale. HyperIdle's context assembly already produces every input number; nothing is surfaced.
**Relevance:** Makes bets economically legible (their original thesis), validates the assembly budget, feeds planner/worker model-mix decisions (F3).
**Size:** S–M. **Open questions:** data source per harness (capture seam exists per docs/architecture/run-unit-model.md — which metrics actually cross the EventBus today?); dashboard in Work view or per-session panel?
**Sources:** github.com/nex-crm/wuphf (benchmark), databricks.com blog (via 2026-08-08 doc).

### Deliberately NOT taking (anti-patterns, for planning context)

- **Vector-store-as-default memory.** Community + practitioners converged on hybrid lexical-first (WUPHF: BM25, "no vector DB"; Hyper: semantic + Postgres FTS with reciprocal rank fusion; HyperIdle's own five-layers provenance credits Google's always-on memory agent: "a structured store beats a vector DB"). HyperIdle's Postgres canonical store is already the right side of this.
- **BASB/PARA/Zettelkasten ceremony for humans.** The documented failure modes are *human-organization* failure modes. Importing any of it (folders, MOCs, weekly review rituals) would import the disease. Agents organize; humans curate; decay prunes.
- **Opaque per-agent memory blobs** (ChatGPT-memory style). Memory must be diffable and reviewable or it violates the trust thesis — git/markdown projection or nothing.
- **A2A adoption (for now).** v1.0 is real but its governance (AWS/SAP/ServiceNow TSC) and use cases are enterprise interop — ETHOS-wrong user. Revisit only if HyperIdle agents need to collaborate with agents outside the workspace.
- **"Agent OS" as marketing label.** Saturated by 1-point Show HNs; the label attracts the wrong comparison set. Lead with the org layer (D1).
- **Chat-shaped AI notes** (Mem 2.0 "thought partner" pivot). The community's verdict on chat-as-PKM is lukewarm at best (HN: "slow response, verbiage, possibly wrong answers"); HyperIdle's conversation layer works because it sits on top of work primitives, not instead of them.

### Cross-references to the 2026-08-08 doc

- **G1 strengthens F7** (git-based memory) with community demand + two shipping references.
- **G6 is the precondition for F6** (skills registry) — provenance before marketplace.
- **G4 is the loop F1 (review queue) and F9 (interactive blocks) hang off.**
- **G7 supplies the data F3 (planner/worker cost) and F5 (observability) need.**
- **F2 (sleep-time compute) gains its clearest use case:** idle agents running G3's hygiene passes and G1's export sync.
- **F12 (agent-first browsing) unchanged.**

---

## Source index (all fetched 2026-08-09 unless noted)

| Source | URL |
|---|---|
| Charlie Labs — CAOS thesis | https://charlielabs.ai/coding-agents-as-operating-systems/ |
| Rivet agentOS | https://rivet.dev/agent-os/ · https://github.com/rivet-dev/agentos |
| WUPHF (Nex.ai, YC S26) | https://github.com/nex-crm/wuphf · https://wuphf.team/ |
| Agent-OS Show HN long tail | HN Algolia search "agent OS" stories, 2025-11…2026-07 |
| "I deleted my second brain" + thread | https://news.ycombinator.com/item?id=44402470 (article URL now 404; thread preserved) |
| CodeAlmanac (YC S26) | https://github.com/AlmanacCode/codealmanac/ |
| Hyper — company brain (YC P26) | https://heyhyper.ai/ · HN 48387095 |
| Mem 2.0 | https://get.mem.ai/blog/introducing-mem-2-0 |
| OpenKnowledge / Files.md / Screenpipe / Rowboat / Atomic | HN stories 2026-04…07 (see Obsidian search batch) |
| Obsidian plugin RAT attack | https://cyber.netsecops.io/articles/obsidian-plugin-abused-in-campaign-to-deploy-phantom-pulse-rat/ |
| Obsidian — Future of Plugins | https://obsidian.md/blog/future-of-plugins/ |
| Mozilla.ai Cq — knowledge units for agents | https://blog.mozilla.ai/cq-stack-overflow-for-agents/ · https://github.com/mozilla-ai/cq |
| MCP spec + AAIF donation | https://modelcontextprotocol.io/specification/2025-06-18 · https://www.anthropic.com/news/donating-the-model-context-protocol-and-establishing-of-the-agentic-ai-foundation |
| A2A v1.0 (Linux Foundation) | https://a2a-protocol.org/ |
| AGENTS.md (AAIF) | https://agents.md/ |
| ACP | https://agentclientprotocol.com/ |
| llms.txt + adoption crawl | https://llmstxt.org/ · https://websiteaiscore.com/blog/case-study-1500-websites-ai-readability-audit |
| Vercel inline-LLM-instructions proposal | https://vercel.com/blog/a-proposal-for-inline-llm-instructions-in-html |
| CommerceTXT (derivative format) | https://commercetxt.org/ |
| Google Open Knowledge Format (OKF) — blog + spec/samples | https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing/ · https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf (SPEC.md v0.2) |
| Karpathy — LLM Wiki gist (OKF's provenance) + community thread | https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f |
| Link — review-gated agent memory (trust lifecycle, poisoning benchmark) | https://github.com/gowtham0992/link |
| Cortexes — capture→distill→fuse→retrieve over markdown+git | https://github.com/XBlueSky/cortexes |
| llmwiki — trust-boundary lessons | https://github.com/suwonleee/llmwiki |
| Ink & Switch (local-first, 10yr) | https://www.inkandswitch.com/ |
| Recall (MCP memory server) | https://www.npmjs.com/package/@joseairosa/recall |
| ismcpdead (MCP sentiment tracker) | https://ismcpdead.com |
| Internal grounding | docs/knowledge-architecture/* · docs/agent-layer/index.md · ETHOS.md · 2026-08-08 research doc |
