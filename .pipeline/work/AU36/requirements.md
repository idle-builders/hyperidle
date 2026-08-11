# AU36 Requirements — reach is a Connection fact, not a harness field

Refined against the live worktree at `origin/main@58b2877a` (AU26 and AU34 landed since plan.md was
written). All file:line citations verified in this tree. plan.md remains authoritative; this artifact
explains its ACs and settles the noun **reach** plus the destination decision plan.md delegates to it.

---

## 1. Value and intended impact

Today the answer to "what can this agent reach?" is assembled inside the harness capability
descriptor: boot-time probes write `inheritedTools` onto each descriptor
(`layers/agent-execution/harness-registry/src/harness-capability-descriptors.ts:159,187,208,238`),
each entry carries a `harness:` field, and the Connections view is a projection of that
(`layers/agent-orchestration/connections/src/service-connection-projection.ts:34`). So a permission
(what an agent may touch) is modelled as a property of the thing that runs the model.

The cost: there is nowhere to add a second inherited service, nowhere to hang a future per-agent
grant, and no way to answer the reach question without going through the harness registry —
`agent-execution`, the layer that runs models, is in the business of describing GitHub logins.

After this WP: reach facts live in the connections domain with their own source; the harness
capability descriptor describes only the harness; the Connections view reads reach from the
connections domain directly and looks identical to the user. This is placement, not product change.

## 2. Success — mapped to every plan AC

1. **"Reach answerable without reading anything about harnesses; descriptor carries no reach
   field."** The only production reader of `descriptor.inheritedTools` today is the connections
   projection (verified: no other production read site exists). After: the GET /api/connections
   answer is assembled from connections-domain state (held rows + inherited facts) with no harness
   registry, descriptor, or adapter-pool read in the path. `HarnessCapabilityDescriptor`
   (`framework/harness-capability/src/harness/harness-capability-descriptor.ts:156`) loses
   `inheritedTools` entirely — no compatibility field, no dual-write (plan constraint). A reach
   fact may still carry a plain-string provenance ("which harness config it was found in") because
   that is *where the auth lives* — display data, not a dependency on the harness model.
2. **"Harness change leaves reach identical, proven by exercising both."** Reach is not
   per-agent today (held is per-user, inherited is per-machine — see §5 boundaries) and must stay
   harness-independent: an agent switched harness A → B → A has identical reach at every step,
   proven by exercising that switch.
3. **"Connections view unchanged — verified on the rendered surface."** Same services, same
   states, same grouping (`SettingsConnections.tsx` fetches only `/api/connections`,
   `layers/core-ui/src/settings/SettingsConnections.tsx:106`). Includes the refresh lifecycle:
   today inherited reach re-probes at boot and on `POST /api/harnesses/redetect`
   (`adapter-pool.ts:85` → `discoverLocalHarnesses`), and the user guide tells users to use that
   Refresh after changing harness config (`docs/guides/user/connections.md:63`). The existing
   re-probe moments must keep refreshing inherited reach with identical observable effect; how the
   trigger reaches the relocated probe is architecture's call.
4. **"Probe never obtains a token value."** AN1 hard-rule 4 survives intact: `gh auth status
   --json hosts` (never `--show-token`, `harness-discovery.ts:1075`); the MCP-config probes read
   names/keys only, never values (`harness-discovery.ts:1006-1011`). The identity-only type shape
   (no secret/token/env/command field) remains the invariant, enforced at the type level.
5. **"`npm run verify` green; first boot on a logged-in GitHub CLI detects it exactly as today."**
   Boot-time detection moment and result unchanged: GitHub appears in the Inherited group,
   `health: working`, `removable: false`.

## 3. Scope and non-goals

**In scope:** relocating the inherited-reach fact off the harness descriptor into the connections
domain; relocating the probes that produce it; migrating the projection's input; deleting the
descriptor field with no compatibility residue.

**Non-goals (plan.md, restated):** no second inherited service beyond GitHub (the model must
*permit* one — a reach fact's shape must not be GitHub-specific — but none is provided); no
per-agent grants (made expressible, not built); no change to held connections' encryption/storage;
no change to the filesystems or filesystem-mounting packages; no change to the Connections UI;
governance WPs (AU29–AU32, AU34) and AU35 untouched.

## 4. Current behavior and the genuine delta

**Current behavior (verified):**
- Four boot-time probes produce inherited facts: `inspectClaudeTools`, `inspectCodexTools`,
  `inspectOpenCodeTools` (harness MCP-config file readers, names only) and `inspectInheritedTools`
  (the `gh` CLI probe, `harness-discovery.ts:1067`). `discoverLocalHarnesses` merges them into the
  discovery result per harness type (`harness-discovery.ts:1148-1154`); descriptor assembly copies
  them onto each `HarnessCapabilityDescriptor.inheritedTools`.
- `GET /api/connections` (`layers/agent-orchestration/src/routes/connections.ts:208-222`) returns
  held DB rows ∪ `projectInheritedConnections(cachedDescriptors)` — inherited first. Inherited
  entries are never DB rows (AN1 Phase-0 decision; `docs/architecture/connection-model.md:70`),
  `removable: false`, health `unknown` → displayed `working`.
- The connections package (`layers/agent-orchestration/connections`) already owns the held half
  (`service_connections` table, store, resolver, spawn-time read — AU26 E2/E3) and already hosts
  the inherited projection. Only the inherited facts' *source* lives on the harness.
- Nothing else consumes inherited reach: no UI reads `descriptor.inheritedTools` for display (core-ui
  mentions are test fixtures, all `[]`); provisioning applies only *held* connections
  (`held-connections-for-provisioning.ts`) — inherited tools ride the real `$HOME`
  (`docs/architecture/run-unit-model.md:13`), HyperIdle never injects them.
- Stale plan citation: plan.md points at `framework/shared/src/harness/harness-capability-descriptor.ts`;
  AU34 split `shared`, the file is now `framework/harness-capability/src/harness/harness-capability-descriptor.ts`.

**The genuine delta:** one misplaced source. The inherited half of AN1's connection concept is
produced by, cached on, and read from the harness model. Everything downstream (projection, route,
view, vocabulary) already treats it as a connection. The delta is: probes serve the connections
domain; the descriptor loses the field; the route stops reading descriptors for reach. Note AC1
forces **all four** probes' outputs off the descriptor, not only `inspectInheritedTools` — plan.md's
"relocate inspectInheritedTools" is shorthand for the whole inherited-fact production.

## 5. Load-bearing noun: reach

**Settled interpretation.** "Reach" is the *question* — "what can this agent touch?" — not a new
entity. It has two kinds of answers, already modelled as two separate concepts that compose:

1. **Connections** (service reach): "the fact of availability plus a pointer to where the auth
   lives" (`docs/architecture/connection-model.md:3`), per user × service, with the closed
   auth-source set `token | mcp | inherited` (`framework/domain-model/src/connection.ts:16`).
   Held and inherited are two auth sources within ONE concept — they share the view shape, route,
   surface, and vocabulary, and differ only in who holds the auth (HyperIdle vs the user's own
   machine/harness config).
2. **Filesystems** (file reach): registered team-scoped file sources, injected per bot, mounted at
   spawn — a separate primitive with its own lifecycle, surface, and scoping, which *consumes* a
   Connection for auth (`filesystems.connectionId`). `docs/process-layer/filesystem-primitive.md:54`
   rules: "**Not a Connection** — Connection is auth + tools; filesystem is files. Compose, never
   merge."

**Inherited reach is a Connection fact.** It fits the connection definition exactly (availability +
auth pointer: "the harness/environment config holds it"), and AN1 already files it under
`authSource: "inherited"`. The founder's ruling — *"what the agent can reach is permissions or
filesystem not harness"* and *"harness is only llm harnesses nothing else"* — names the two answer
kinds (permissions = connections, filesystem = filesystems) and excludes the harness.

**Destination decision (requirements-level, per plan.md's delegation): the existing `connections`
package — no new package.** Reasons: the concept already has a name, doc, closed vocabulary, and a
home that owns both halves (held store + inherited projection + unified route); the founder's
ruling splits reach into connections + filesystems, and the filesystem half already has its own
home and must not be merged; extending the existing owner is the boring solution that satisfies
every AC. "Reach gets its own home" (plan.md) is satisfied by the inherited half moving into the
connections domain — the home the held half already lives in.

**AU26's test applied.** "Does core/the app operationally consume this for its own purpose, or only
administer it / hold an implementation exercised exclusively on behalf of an agent's
session/environment?" Inherited reach fails the core-consumption test: the app only displays it
(Connections view) and reflects it; HyperIdle never provisions it (it rides the real `$HOME`),
never stores auth material for it. So its home is agent-orchestration (where connections already
live post-AU26), never core-api — and it is an administered environment fact, which is why it stays
a live projection, never a DB row.

**Lifecycle.** Detected at boot and on the existing re-probe trigger (redetect); cached; projected
into the Connections view at GET time; never persisted, never user-creatable/removable; health
`unknown` displays `working`, `needs-attention` only on explicit probe evidence. Unchanged by this
WP.

**Boundaries.** Reach scoping stays as today: held = per-user, inherited = per-machine (visible to
every user of that deployment). Per-agent grants are NOT built; this WP only makes them expressible
by giving reach an identity independent of the harness. Filesystems are untouched. Harness
discovery keeps its real job (readiness, version, auth state, models, runtime capabilities).

**Rejected interpretations.**
1. *Reach is ONE permissions concept spanning connections + filesystems → build a new package.*
   Rejected: ground truth says compose, never merge (filesystem-primitive.md:54); the two differ in
   scoping (team vs user), lifecycle (mount/writeback vs health validation), surface
   (Settings → Filesystems vs Settings → Connections), and filesystems consume connections — a
   dependency edge, not identity. Nothing today consumes the union; a spanning package would be the
   false abstraction plan.md warns against.
2. *Inherited tools are a harness capability (status quo).* Rejected by founder ruling; a harness
   runs a model, reach survives switching harness, and AC2 requires proving exactly that.
3. *Inherited reach is a third, brand-new thing needing its own new package.* Rejected: it already
   IS a connection (`authSource: "inherited"`); the projection, view, and vocabulary exist. Extend,
   don't invent.
4. *Reach means per-agent permission grants.* Rejected: out of scope (plan.md); expressible only.
5. *Only `inspectInheritedTools` (the gh probe) moves; the MCP-config probes stay on the
   descriptor.* Rejected by AC1: any reach field on the descriptor is forbidden, so all four probe
   outputs leave it.

**Constraints carried forward (plan.md + AN1):** probe never reads token values; HyperIdle never an
OAuth app — inherited stays inherited; no compatibility field/dual-write; no production export only
tests consume; Connections view unchanged.

## 6. DOC-CLASS

`DOC-CLASS: update` — after this change, `docs/architecture/connection-model.md` (§"The descriptor
seam — where inherited connections come from", §Projection) and
`docs/agent-layer/harness-capability-descriptor.md` (`inheritedTools` field, §"Inherited-tool
enumeration") describe the old location and become false.

---

**Proposed plan amendments:** none. (The stale `framework/shared` path in plan.md is corrected by
§4 above; it is a citation fix, not a scope change.)
