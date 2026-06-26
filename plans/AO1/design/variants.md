# AO1 — Filesystem attach/inspect surface · variants, scores, recommendation

DESIGN-CLASS: novel · 3 variants · the load-bearing fork = **where it lives + what the attach interaction is**.

All three render ONLY the populated real state (an agent with a `code` repo + a `doc_set` folder, healthy; plus a `needs_attention` code repo whose forge Connection is missing — AC5). No skeleton / empty / error (deferred to build). All compose ONLY catalogued design-system primitives — **zero NEW shapes** (`KindMark` is an inline single-use mark reused exactly as AN1's approved `ServiceMark` precedent, not a DS promotion).

## Open the variants in the viewer (`npm run ds:serve`, then `:8098`)

| Variant | Story `title` | Viewer path | Story file |
|---|---|---|---|
| **A — Settings "Filesystems" section** | `SettingsFilesystems` | `http://localhost:8098/#SettingsFilesystems` | `packages/web/src/settings/SettingsFilesystems.stories.tsx` |
| **B — Inline on agent config** | `AgentFilesystemsInline` | `http://localhost:8098/#AgentFilesystemsInline` | `packages/web/src/settings/AgentFilesystemsInline.stories.tsx` |
| **C — Connection-first attach flow** | `FilesystemAttachFlow` | `http://localhost:8098/#FilesystemAttachFlow` | `packages/web/src/settings/FilesystemAttachFlow.stories.tsx` |

(Each appears in the viewer catalog under **Settings**. Variant name shown in the page header is `POPULATED`.)

---

## Variant A — Settings "Filesystems" section (grouped by agent)

**Home + interaction.** A dedicated Settings section, sibling to **Connections** (AN1). Filesystems listed **grouped by agent**; each group has a `+ Attach`; a page-level `+ Attach filesystem` dialog drives kind → connection → resource. The Connections twin — re-applies the founder-approved AN1 grouped-list idiom verbatim.

**Signature.** Connections-and-Filesystems are matching sibling Settings sections — one mental model for "what this agent can reach (auth) vs. what it authors into (files)". The two ⟂ axes sit next to each other in the same place.

**Filesystem ⟂ Connection legibility.** Title-line = the resource (repo@branch / folder) + kind Tag; subtitle = `Auth via <Connection>` · write-back note. The auth axis lives in the subtitle, never merged into the resource.

**Best at.** Fleet view — scan every agent's filesystems + their health in one dense list. Lowest learning cost (mirrors Connections). Lowest new surface.
**Worst at.** Detached from where the agent is otherwise configured (harness/model live in the agent panel, not here). The attach dialog must re-pick the agent each time (an extra field) since the page isn't agent-scoped.

## Variant B — Inline on the agent's config panel (KeyValue inspect)

**Home + interaction.** Filesystems are a **section of the agent's own config panel** (where role / harness / model already live). `+ Attach` sits in that section header. Each attachment is a card-row that expands into a **`KeyValue` inspect grid** (Kind / State / Resource / Branch / Write-back / Connection as six separate labeled fields).

**Signature.** The expand-to-inspect `KeyValue` grid — every property of the filesystem is a first-class labeled value, so **Filesystem ⟂ Connection is structurally legible**: "Connection: GitHub" and "Resource: acme/storefront" are literally separate rows. Closest to the literal task "attach a filesystem to THIS agent."

**Best at.** Configuring one agent end-to-end without leaving its panel; the richest single-attachment inspect (write-back + connection + branch all named). The attach is already agent-scoped (no re-pick).
**Worst at.** No cross-agent fleet view — you can't scan all filesystems + health at once. More vertical space per attachment when expanded. Couples AO1 to the agent-config panel surface (which exists but is heavier to land in than a standalone Settings section).

## Variant C — Connection-first attach flow (Vercel/Linear-style import)

**Home + interaction.** A **stepped flow** keyed on the Connection: a left step-rail (1 Connection · 2 Resource · 3 Agent) drives one working pane. Pick the connected account → browse its repos (attached / selected / available) → assign branch + agent. Reachability surfaces at step 1 (a `needs_attention` connection is flagged before you can browse it).

**Signature.** The connection IS the entry point — the flow's spine is literally the ⟂ composition (auth → resource → agent), borrowed from Vercel's "Connect a repository" import grammar.

**Best at.** First-time attach, especially for someone who thinks "I want to wire up my GitHub repos." Makes "browse a connection's resources" first-class (the only variant that lists what a connection *offers*, not just what's attached).
**Worst at.** It is an *attach* flow, not an *inspect/manage* surface — it doesn't answer "show me everything attached + its health" (that needs a separate list anyway). Heaviest interaction. Introduces a wizard pattern not used elsewhere in Settings (coherence cost). Step 2's "browse a connection's repos" implies a repo-listing capability the AN/AO1 contract does NOT provide in v1 (architecture: reachability is structural, no live forge calls; AO1 never lists remote repos) — so this variant's signature step is partly aspirational for v1.

---

## 9-dimension rubric (0–10 each)

| Dimension | A — Settings section | B — Inline agent config | C — Connection-first flow |
|---|---|---:|---:|
| 1 Hierarchy (eye lands right) | 9 — agent group → resource → state, clean | 9 — agent frame → filesystems section → inspect | 7 — flow steps compete; eye split across 3 sections |
| 2 Spacing (6px grid, density) | 9 — AN1 grid exactly, dense | 8 — inspect grid adds height when expanded | 7 — wizard is airier; more whitespace earned-less |
| 3 Typography (scale, mono use) | 9 — mono resource+branch, tags, caps labels | 9 — same + KeyValue tabular | 8 — same, but more body copy |
| 4 Color (semantic, halation) | 9 — StatusChip healthy/behind only | 9 — same + amber attention reason | 8 — accent-green on selected step/conn (correct, but more accent) |
| 5 Coherence (1 grammar) | 10 — IS the AN1 grammar, sibling to Connections | 8 — agent-panel section grammar (also exists) | 6 — wizard grammar new to Settings |
| 6 States (populated + attention) | 9 — reachable + needs_attention, severity-sorted | 9 — both + inline reason in inspect | 8 — both, attention at the connection source |
| 7 A11y (roles, focus, kbd) | 8 — Row/ItemList/Menu a11y inherited | 8 — same + expand toggle | 7 — clickable Rows as step targets need care |
| 8 Anti-slop (no AI aesthetic) | 9 — dense, purposeful, no card-grid | 9 — same | 7 — a two-pane wizard flirts with the "setup wizard" cliché |
| 9 Premium polish | 8 — proven, unsurprising | 9 — the inspect grid is a genuinely nice touch | 8 — the flow is slick but heavier |
| **Total** | **80 / 90** | **78 / 90** | **66 / 90** |

---

## Recommendation: **Variant A — Settings "Filesystems" section**, pulling in Variant B's KeyValue inspect.

**Why A.** Highest total (80). It is the *same* founder-approved grammar as AN1 Connections placed *next to* Connections — the two orthogonal axes (auth vs. files) become matching sibling sections, which is the cleanest expression of the concept's "Filesystem ⟂ Connection compose" hard rule. It carries zero new shapes, zero new interaction grammar, and the lowest learning cost. It satisfies every AC directly: attach (dialog), inspect (row + chip), list (grouped), detach (row menu), needs_attention (severity-sorted amber chip + group caption).

**Pull in from B.** The **`KeyValue` inspect grid** as the row's expand state (or the `GET /:id` detail). A's row subtitle is good for scanning; B's grid is the right *inspect* depth (Kind/State/Resource/Branch/Write-back/Connection named separately). Recommendation: A's grouped list is the surface; clicking a row (or a Row "Inspect" action) reveals B's KeyValue grid inline. This keeps the fleet-scan of A and the inspect-depth of B.

**Reject (so it isn't re-litigated):**
- **Variant C's connection-first wizard** — rejected as the *primary* surface. It is an attach-only flow that introduces a Settings-novel wizard grammar (coherence −) and whose signature "browse a connection's repos" step assumes a remote-repo-listing capability AO1's contract explicitly does NOT have in v1 (structural reachability only, no live forge calls). The *useful* idea from C — surfacing reachability **at the connection** — is already covered by A/B's per-row `needs_attention`. If a guided first-attach is wanted later, it can be a thin entry *into* A's dialog, not a replacement surface.
- **Per-product grouping / a portfolio grid** — Product is deferred (concept); scope is the Team. Group by agent, not product.
- **Branch picker as a live dropdown of remote branches** — needs a live forge call AO1 doesn't make; branch is a typed Input in v1.

---

## Open questions for the critique
1. **Inspect depth in the row vs. a detail route.** Recommendation folds B's `KeyValue` grid into A as an inline row-expand. Is inline-expand right, or should inspect be a `GET /:id` detail panel? (Architecture exposes `GET /:id` — either works. Inline keeps it on one surface.)
2. **Attach dialog agent-picker.** Because A's page is team-scoped (not agent-scoped), the attach dialog re-picks the agent. Acceptable, or should each agent group's `+ Attach` pre-fill that agent? (Recommendation: pre-fill from the group's `+ Attach`; the page-level button starts unfilled.)
3. **`doc_set` connection source in v1.** Architecture Q3 notes a v1 `doc_set` is realistically a bare local folder (no Drive/Obsidian Connection exists yet). The design models a connection-backed folder but renders the local case as primary. Confirm that's the right default to show.
4. **Settings placement.** A lands as a new Settings section adjacent to Connections. Confirm Settings is the home (vs. the Team/Work view). The concept calls the binding "agent-within-a-team"; Settings is where Connections/Agents/Harnesses already live, so it's the consistent home — but the founder owns this call.
