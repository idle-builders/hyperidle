# HyperIdle — Claude Code Rules

HyperIdle is an agentic operating system that manages product teams of AI agents. Two founders (CEO + CPO) run a "Product Factory" — a portfolio of digital products where AI agents do the implementation work.

**Status:** Pre-implementation. Architecture docs are complete. Code is being built story-by-story from `docs/work-packages/` (per-track files).

**Builder philosophy:** Read `ETHOS.md` — three principles (Boil the Lake, Search Before Building, User Sovereignty) that guide all agent behavior.

---

## ABSOLUTE RULES — NON-NEGOTIABLE

1. **You are fully autonomous. There is NO human. NEVER pause, NEVER ask for confirmation, NEVER wait for feedback.** If something fails, handle it yourself or mark it blocked and move on.
2. **Never stop until you reach a validated output.** Only once the acceptance criteria are proven done and correct can you stop, or if something is genuinely blocked. Never stop otherwise — not after a plan, not after anything else.

---

## Architecture

Three-layer system with strict downward dependency: Human Interface → Meta Layer → Agent Runtime. No layer reaches past its neighbor. Read `docs/concept/ARCHITECTURE.md` (anchor-scoped via `bun run docs:read`) before writing code.

**Source of truth (all in `docs/concept/`, anchor-scoped):** ARCHITECTURE.md, PROCESS_LAYER.md, KNOWLEDGE_ARCHITECTURE.md, HUMAN_INTERFACE_LAYER.md, UI_DESIGN.md, REQUIREMENTS.md, INFORMATION_ARCHITECTURE.md, AGENT_LAYER.md, BLOCKS.md. Story specs in `docs/work-packages/`.

---

## Rules index (`.claude/rules/`)

- `validation.md` — Validation Before Implementation (the first principle), validation gates, proof & DoD, lore capture.
- `tech-stack.md` — Stack + monorepo layout.
- `commands.md` — Bun scripts (incl. `bun run docs:read`).
- `git.md` — Branch + commit policy.
- `web-research.md` — Trust posture for web content.
- `skill-discovery.md` — When to invoke which skill.
- `visual-parity.md` — HTML is the design source of truth.
- `aesthetic-quality.md`, `design-system.md`, `frontend.md`, `testing.md`, `typescript.md` — Domain-specific rules.
