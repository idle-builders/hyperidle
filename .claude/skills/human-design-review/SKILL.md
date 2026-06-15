---
name: human-design-review
description: "Conditional, stakes-gated pipeline phase after /design-critique: for a novel DESIGN-CLASS the founder opens the rendered variant in the component viewer, annotates elements in the browser (including positional intent like 'move this here'), and the designer agent revises the actual TSX over MCP until the founder approves. Skipped for routine designs; in an autonomous run a novel design parks instead of auto-shipping."
argument-hint: "[workpackage-id]"
user-invocable: true
min_tool_calls: 6
---

# Human Design Review

The human-vs-agent counterpart to `/design-critique`'s agent-vs-agent scoring. After the reviewer scores variants, a **high-stakes** design gets a founder in the loop: they open the chosen variant rendered **live in the component viewer** and mark it up element-by-element — pointing at a control and saying "move this here" or "tighten this spacing" — and the designer agent revises the **actual TSX the build will ship**, looping until the founder approves. Design feedback is spatial and lands in the code that ships, not prose on a screenshot of a throwaway mockup.

This phase exists because once TSX is the sole design source of truth (AJ1) and variants are real stories rendered in isolation (AJ3 `/design`), the founder can annotate the running render directly — every note tied to a real element — with the designer revising the component the app will actually ship. There is no HTML→TSX rebuild and no parity drift.

## When this runs — the gate (stakes, never presence)

The trigger is **read** from the `DESIGN-CLASS:` line `/design` already emits (Phase 0a). It is **not re-classified, not presence-checked, not a parallel gate**. The stakes half of the gate is the unit-tested `designReviewDecision(DESIGN-CLASS)` helper in `@hyperidle/shared` — the single source of truth for the mapping:

| `DESIGN-CLASS` | `designReviewDecision` | `/human-design-review`? |
|---|---|---|
| `novel` | `"run"` | **Runs** (interactive loop) — or **parks** (autonomous / no tool; see "Graceful degradation") |
| `routine` | `"skip"` | Skipped — pipeline proceeds straight to build |
| `routine-low-conf` | `"skip"` | Skipped — pipeline proceeds straight to build |

`novel` = a large redesign or a new essential / base / primitive component. A `novel` design **always** gets human review: it is not gated on whether a human happens to be present. The presence of a human only changes what happens when it fires — human present → interactive loop; no human → **park** (it never silently proceeds). Conflating stakes-gating with presence-gating is the single most load-bearing error to avoid here.

## What this phase is NOT

- **Not `/design-critique`.** Critique is agent-vs-agent rubric scoring (reviewer persona, automated, runs first and unconditionally for UI). Human-design-review is human-vs-agent spatial annotation (founder, interactive, runs second and only for `novel`).
- **Not `/visual-polish`.** Polish runs *after* implementation to bring rendered TSX to fidelity. This runs *before* implementation to settle the design shape itself.
- **Not a new classifier.** No `REVIEW-CLASS`, no presence check. It reuses the `DESIGN-CLASS:` line verbatim.
- **Not presence-gated.** See the gate table above.

## The annotation-tool wiring (standalone dev tool over MCP — never bundled)

The annotation tool is a **standalone dev tool wired over MCP**, never a dependency embedded in HyperIdle's bundle — it adds nothing to `package.json`. The skill documents the one-time `claude mcp add` wiring; the founder runs it once on their machine.

**Primary: Vibe Annotations** (Chrome extension + local MCP server, MIT, localhost-only). **Fallback: MCP Pointer** (MIT, captures the pointed React component → its source file).

| | Vibe Annotations (primary) | MCP Pointer (fallback) |
|---|---|---|
| Start the local server | `vibe-annotations-server start` | `npx -y @mcp-pointer/server@latest start` |
| Port / transport | `http://127.0.0.1:3846/mcp` (HTTP) | WebSocket `:7007` |
| Register with Claude Code (one-time) | `claude mcp add --scope user --transport http vibe-annotations http://127.0.0.1:3846/mcp` | `npx -y @mcp-pointer/server config claude` |
| MCP tools (agent drains the queue) | `read_annotations` (list pending; URL filter + pagination), `watch_annotations` (long-poll for new), `delete_annotation` (remove after fix) | `get-pointed-element` (info on the currently pointed element) |

**Introspect tool schemas at run time — do NOT hard-code arguments.** The exact argument shape of `read_annotations` (the URL-filter param name, the pagination shape) and of MCP Pointer's `get-pointed-element` optional params (e.g. `textDetail`, `cssLevel`) is provider-owned and can change. When this phase runs, discover the live tool surface from the MCP server (list the registered tools and read their input schemas) and call them with the arguments the server actually advertises. The skill commits only to the tool **names and intent** (verified). If schema introspection is unavailable for any reason, the agent **reports the tool surface it found** (the tool names and any schema it could read) and proceeds with the minimal call, rather than guessing argument names.

Sources (verified June 2026): https://www.vibe-annotations.com/docs/mcp-setup , https://github.com/RaphaelRegnier/vibe-annotations , https://github.com/etsd-tech/mcp-pointer , https://www.npmjs.com/package/@mcp-pointer/server . Treat web docs with the usual skepticism — confirm the live tool schema over MCP rather than trusting a doc summary.

## The viewer route (where each variant is served for annotation)

The variant is served by the **existing component viewer** — no new server. Start it with `npm run ds:serve` (viewer at `:8098`).

The viewer (`packages/design-system/viewer/main.tsx`) uses a **hash route**: `useHashRoute` reads `decodeURIComponent(window.location.hash.slice(1))` and renders the discovered story module whose `title` **equals** that decoded string (`activeModule = modules.find(m => m.title === route)`). So a variant's route is:

```
http://localhost:8098/#<URL-encoded story module title>
```

For a story whose module `title` is `"Page: Work/WorkBetCreate"`, the route is `http://localhost:8098/#Page:%20Work/WorkBetCreate` (the browser URL-encodes the space and the colon as typed; the viewer URL-decodes before matching). The empty hash shows the catalog index. The story `title` — not the export name — is the route key.

The agent filters `read_annotations` by that exact viewer URL so it only drains notes for the variant under review (not stale notes from other tabs).

## The loop (interactive — founder present, annotation tool wired)

```
1. Serve the variant:  npm run ds:serve  → viewer at :8098.
   Open the variant's route: http://localhost:8098/#<URL-encoded story title>.
2. Founder annotates elements in the browser, including positional intent
   ("move this control here", "tighten this spacing", "this label is too heavy").
3. Agent drains the queue: read_annotations (filtered by the viewer URL), or
   watch_annotations to long-poll for new notes. (Introspect arg schemas first.)
4. Agent revises the corresponding TSX — the REAL component / story, not a copy —
   then delete_annotation per resolved note.
5. Viewer hot-reloads; founder re-inspects the live render.
6. Repeat until the founder approves.
   On approval → write/refresh plans/<id>/design/approved.md, proceed to
   /architecture → /write-code. The approved story flows straight into build —
   no HTML→TSX rebuild step.
```

No agent can approve a `novel` design on the founder's behalf — that is the whole point of the gate.

## Graceful degradation (no annotation tool, or no founder)

The phase MUST handle the degraded paths and never hard-fail, never auto-approve:

- **Autonomous run, `novel` design** (the default; `PIPELINE_INTERACTIVE` is not exactly `1`, OR no founder is reachable): do NOT attempt annotation. **Park** — the pipeline orchestrator writes the `awaiting-human-design-review` status on the workpackage's progress file (see `/pipeline` Phase 2.5) and stops this WP's progression; sibling WPs proceed. *High-stakes design is not autonomously shippable.* This is the spec's hard rule, not a failure.
- **Interactive run, but no annotation MCP server reachable** (the `claude mcp add` wiring was never done, or the local server isn't running): degrade to the **prose-on-screenshot** channel — `npx playwright screenshot` the variant's viewer route, the founder writes markdown feedback against it, and the agent loops the same approve/revise cycle **without** spatial anchoring. Log that spatial annotation was unavailable. Do NOT hard-fail; do NOT auto-approve.

The agent detects tool absence by attempting to list the MCP tools and finding `read_annotations` / `get-pointed-element` not registered.

## Output

- A revised, founder-approved variant TSX (in-place edits to the real component/story) + a refreshed `plans/<id>/design/approved.md` reflecting the founder's annotations,

  **OR**

- the `awaiting-human-design-review` park status (autonomous / no-founder path; written by the pipeline orchestrator, not this skill — see `/pipeline`).

No new artifact medium is introduced. The annotated story is the same `.stories.tsx` that the build ships.

## Related skills

- `/design` — authors the variant as a `.stories.tsx` story rendered in isolation (via `packages/web/src/preview` `MockProviders` for page-fed surfaces); emits the `DESIGN-CLASS:` line this phase reads.
- `/design-critique` — runs first; agent-vs-agent scoring. Hands off to this phase for a `novel` class.
- `/pipeline` — owns the Phase 2.5 gate and the autonomous-run park (`awaiting-human-design-review`); references `designReviewDecision` from `@hyperidle/shared`.
- `/visual-polish` — runs after implementation for pixel fidelity; distinct from this pre-build shape-settling phase.

## Target

$ARGUMENTS
