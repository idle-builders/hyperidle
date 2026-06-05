# Z2 Concept: Getting Started Journey

## Verdict: No new or reshaped nouns

Z2 is a tutorial doc. It walks a new user through existing primitives in the order they encounter them. It does not introduce, rename, or reshape any noun. Every concept the guide will reference already has a canonical definition in the process layer and user guide.

---

## Canonical Terminology for Z2

The getting started guide must use these terms exactly as defined. No synonyms, no abbreviations, no casual alternatives.

### Process Layer Primitives (from `docs/process-layer/the-five-primitives.md`)

| Canonical Name | What It Is | NOT called |
|---|---|---|
| **Product** | A codebase or digital product the AI team works on | project, app, workspace |
| **Team** | Persistent group of agents bound to a product | crew, squad, group |
| **Bet** | Shaped, committed, time-boxed unit of work | sprint, epic, story, task (at the bet level) |
| **Task** | Unit of work picked up by an agent, child of a bet | ticket, issue, item, to-do |
| **Session** | A single agent's bounded run on a task | run, execution, job |
| **Routine** | Recurring trigger attached to a named agent | cron job, scheduled task, automation |

### Additional Nouns the Guide Will Use

| Canonical Name | What It Is | NOT called |
|---|---|---|
| **Agent** | An AI team member with identity, skills, memory | bot, assistant, worker |
| **Knowledge** | The factory's institutional memory (five layers L0-L4) | docs, documentation, wiki, notes |
| **Pitch** | A shaped bet proposal before commitment | proposal, draft, idea |
| **Artifact** | An output produced by a task (code, copy, config) | deliverable, output, result |
| **Review** | A conversation item needing a human verdict | approval, PR, check |
| **Verdict** | The human's decision on a review item (Approve/Reject/Request Changes/Snooze) | action, response, decision |
| **Rail** | The always-visible right sidebar (HUD) | sidebar, panel, dashboard |
| **Icon Rail** | The left navigation sidebar | nav bar, menu, sidebar |
| **Factory** | The entire HyperIdle instance (portfolio of products + agents) | organization, workspace, company |
| **Portfolio** | The collection of all products | — |

### Agent Role Names

| Canonical Name | Scope |
|---|---|
| **Product Manager** | Per-product team lead |
| **Builder** | Per-product implementation agent |
| **Growth Agent** | Per-product analytics/experiments |
| **Ops Agent** | Per-product deployment/monitoring |
| **Chief of Staff** | Factory-wide, strategic |
| **Practice Facilitator** | Factory-wide, one per discipline |

### Knowledge Layers

| Layer | Scope | Canonical Name |
|---|---|---|
| L0 | Session | Working context (ephemeral) |
| L1 | Task | Task learnings |
| L2 | Product | Product knowledge |
| L3 | Practice | Cross-product patterns per discipline |
| L4 | Factory | Principles and strategy |

### Knowledge Scopes (navigation)

Three scopes in the Knowledge view: **Practice**, **Product**, **Factory**.

### Autonomy Levels

L1 (every action approved) through L4 (fully autonomous). Used consistently across `docs/guides/user/settings.md` and process layer.

---

## Terminology Inconsistencies Found

### 1. Missing file: `docs/guides/user/the-rail.md`

The user guide index (`docs/guides/user/index.md`) lists "The Rail" as a section link to `./the-rail.md`, but the file does not exist. The Rail is described briefly in `the-interface.md` (4 bullet points), but there is no dedicated page. The getting started guide should reference the Rail by its description in `the-interface.md`, not link to the missing file.

**Severity:** Minor. The guide can describe the Rail inline without depending on this missing file.

### 2. "Product Factory" vs "factory" capitalization

The user guide index uses "Product Factory" (capitalized, compound noun) in its opening line. Elsewhere in the user guide, lowercase "factory" is used generically (e.g., "the factory's institutional memory," "Factory budget," "Factory-wide agents"). The process layer docs use "agent factory" (lowercase).

The getting started guide should use lowercase "factory" as the generic noun and reserve uppercase only for the L4 knowledge scope label ("Factory") and the product's self-description ("Product Factory").

**Severity:** Minor. Cosmetic, but the guide should be consistent.

### 3. Density toggle documented but removed

`docs/guides/user/settings.md` lists "Density (compact/default/comfortable)" under Appearance settings. Per project memory, the density toggle has been removed — HyperIdle uses a single default density. The getting started guide should not reference density settings.

**Severity:** Minor for Z2 (the guide won't cover settings in depth). Worth flagging for Z3 (Feature Documentation) or Z4 (Gap Audit).

### 4. "Artifact view" usage in user guide

The user guide uses "artifact view" in three places (`three-core-views.md`, `handling-common-situations.md`) to describe the review interface panel showing what changed. This is consistent with the process layer's Artifact primitive. No inconsistency, but the guide should be careful to distinguish "Artifact" (the primitive — a produced output) from "artifact view" (the UI panel showing that output during review).

**Severity:** None — consistent usage, just a note for the Z2 author.

### 5. "Comment thread" vs "thread"

`three-core-views.md` uses "comment thread" when describing Bet Detail. The canonical primitive is "thread" (defined in `docs/human-interface-layer/thread-primitive.md`). The getting started guide should use "thread" consistently, not "comment thread."

**Severity:** Minor.

---

## Nouns the Guide Introduces in Order of Encounter

Based on the getting started flow (install, create product, explore interface, create bet, see agent output), the guide will introduce nouns in this sequence:

1. **HyperIdle** (the product)
2. **Product** (what you create first)
3. **Team** (auto-provisioned when you create a product)
4. **Agent** (the team members — Product Manager, Builder)
5. **Icon Rail** / **Rail** (interface orientation)
6. **Conversations** / **Work** / **Knowledge** (the three views)
7. **Bet** (what you commit to start work)
8. **Task** (decomposed from the bet)
9. **Session** (agent's work run on the task)
10. **Review** (what surfaces in Conversations)
11. **Verdict** (Approve/Reject/Request Changes/Snooze)
12. **Artifact** (the output the agent produced)
13. **Knowledge** (what gets captured from the work)

This ordering matches the natural first-use journey. No new nouns are needed.

---

## Conclusion

Z2 is a pure consumer of existing vocabulary. It introduces no new primitives, reshapes no existing ones. The five terminology inconsistencies above are minor and do not block Z2 — three are cosmetic, one is a missing file (workaround: describe inline), and one is a stale setting reference (the guide won't cover it).

The canonical terminology table above is the contract the Z2 author must follow. Any deviation from these names in the getting started guide is a bug.
