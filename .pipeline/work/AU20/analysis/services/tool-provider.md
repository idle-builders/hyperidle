# tool-provider — Service-as-Product Audit (AU20)

**Layer:** agent-execution (Mechanism-B: deps = `@hyperidle/shared` only, never `@hyperidle/db`)
**Owned tables:** none
**Current public exports:** 25
**Verdict:** **CONSOLIDATE** → fold into the merged agent-execution runtime platform (`harness-execution-platform`, with `harness-registry` + `mcp-provider`).

---

## 1. Existence / Consolidation Verdict

**The number is the finding, in miniature.** Of 25 public exports, **22 are pure pass-through
re-exports of `@hyperidle/shared`** (`toRegistered`, `toClaudeToolSpec`, `classifyReversibility`,
`composeWorkflowAllowDeny`, `canonicalJson`, `identityHash`, `toolsForRole`, `wrapForRegistry`,
`err`, `ok`, plus every cross-boundary type). Only **THREE symbols originate here**:

- `buildToolRegistry` — the dispatch/workflow-router closure (`tool-registry.ts`, ~200 lines of real control flow).
- `returnStatusTool` — the AL6 `hyperidle_return_status` bridge tool (one `ToolDefinition` + `.forRegistry` factory).
- `ReturnStatusResult` — result type for the above.

Of the 22 re-exports, real consumers **do not even route through tool-provider** — the production
binding (`core-api/src/services/tool-provider-bindings.ts:26`) imports `toolsForRole` straight from
`@hyperidle/shared`, not from tool-provider. And four re-exports — `classifyReversibility`,
`composeWorkflowAllowDeny`, `canonicalJson`, `ReturnStatusResult` — have **zero non-test consumers
anywhere**. The barrel is a redundant façade over `@hyperidle/shared`.

**AU19's separateness claim ("the C1 resolution's other half — what stays inside the strict
Mechanism-B boundary, holding erasure/classification/dispatch machinery") is stale.** The
erasure/classification machinery it names (`toRegistered`/`toClaudeToolSpec`/`classifyReversibility`/
`canonicalJson`/`identityHash`/`toolsForRole`) **already moved to `@hyperidle/shared`** (its own
barrel comment, index.ts:13-19, admits this). What physically remains in the package is two runtime
symbols. A whole npm package + barrel + build target for **two real symbols**, wrapped in 22
redundant pass-throughs, is precisely the over-fragmentation this audit exists to collapse.

**Product purpose (real):** deliver the *harness-facing tool-execution surface* — "given the DI-wired
tool bodies + a per-invocation context, hand a harness a registry it can role-filter, validate
against, and invoke, with the AL7 review router inline." Consumers: `session-lifecycle` (builds the
per-session registry) and `dispatch`'s assistant path — both via the `core-api` composition-root
binding. This is genuine platform value, but it is **not a distinct product from the rest of the
agent-execution zero-DB runtime.**

**Cluster hypothesis (harness-execution-platform = harness-registry + mcp-provider + tool-provider) —
evaluated:** CONFIRMED for tool-provider. The frame's steer ("audit tool-provider vs. pushing its
wire-types into `@hyperidle/shared`") is already answered by reality — the wire-types *are* in shared.
What's left (the dispatch closure + the enforcement bridge tool) is the same Mechanism-B-safe
(shared-only) dep profile as `harness-registry`, and is literally *"what a harness invokes"* sitting
next to `harness-registry`'s *"what harnesses are available."* Same layer, same security seam, same
single consuming surface. The **Mechanism-B boundary is a genuine earned seam** (untrusted
remote-worker, zero-DB) — but that seam is a *package-level dependency constraint*, preserved just as
well by the merged platform. tool-provider's *separate* boundary buys nothing; it costs a package for
2 symbols. Fold it in.

(`tool-handlers` correctly stays out — it needs `@hyperidle/db`, so it cannot cross into the
Mechanism-B package. The tool *wire/dispatch* half lives in the platform; the *body* half stays
DB-side. That split is real.)

---

## 2. The Deliberate Target Public API

Post-redesign, tool-provider contributes **2 exports** to the merged platform (down from 25). The 22
`@hyperidle/shared` pass-throughs are **deleted from the barrel** — consumers import them from
`@hyperidle/shared` directly (most already do).

| # | Interface | Shape | Subsumes | Why a meaningful shared capability |
|---|-----------|-------|----------|-----------------------------------|
| 1 | `buildToolRegistry` | `(defs, ctx, options, workflow?) → ToolRegistry` where the returned `ToolRegistry = { definitions, invoke(name,args), toClaudeToolSpecs() }` | `buildToolRegistry`, `toolsForRole` (role filtering is an internal step keyed by `options.role`), `toClaudeToolSpec` (folded into `ToolRegistry.toClaudeToolSpecs`), the `invoke` method | The **one** general dispatch factory. Already parameterized by intent/filter: `ctx` (per-invocation), `options` (role, extraTools, useOnlyExtraTools, sessionWorkflow), `workflow` (injected review port). Every harness / role / tool / workflow-mode composes through arguments — never a new method. |
| 2 | `returnStatusTool` | `ToolDefinition` constant + `.forRegistry(registry)` factory | `returnStatusTool`, `ReturnStatusResult` (make internal; 0 external consumers) | An enforcement *tool descriptor as data*, injected via `options.extraTools`. Composes into #1; not a separate method surface. |

**Deleted (moved fully to `@hyperidle/shared`, or dead):** `toRegistered`, `toClaudeToolSpec`,
`classifyReversibility`, `composeWorkflowAllowDeny`, `canonicalJson`, `identityHash`, `toolsForRole`,
`wrapForRegistry`, `err`, `ok`, and all 12 re-exported types. Four of these had **zero consumers**
today.

**Target export count: 2** (both re-homed inside `harness-execution-platform`).

---

## 3. Inside Lens

- `buildToolRegistry` is one pure closure over injected ports (`ProposedCallWorkflowPort`) + passed-in
  tool definitions. Zero DB, zero domain import. New behaviour = a new `options` field or a new
  injected port method, not a new file or export. The control flow (classify → capture-if-irreversible
  → CAS-consume-grant → run → record) is a single readable pipeline.
- `returnStatusTool` is self-contained tool data; new enforcement/bridge tools follow the same
  "descriptor + `.forRegistry`" shape and inject via `extraTools` — they never widen the barrel.
- Folded into the platform, the **single INSIDE invariant** is the package-level Mechanism-B dep
  constraint (shared-only) — a lint on one package rather than a boundary maintained across three
  micro-packages. The security seam gets *stronger* (one wall, not three).

---

## 4. Scaling Argument

Apply the test: *add dozens more services and hundreds more calls — do we need more methods?* No.

- **New tool** → append a `RegisteredTool` to the `defs` array passed in. Zero new exports.
- **New role** → `toolsForRole(defs, role)` already filters by the `role` string param. Zero new methods.
- **New harness** → it calls the *same* `buildToolRegistry`. Zero new methods.
- **New review/workflow behaviour** → a different `ProposedCallWorkflowPort` impl injected + an
  `options.sessionWorkflow` shape. Zero new methods.
- **New wire format** (beyond Claude spec) → one more projector method on the returned `ToolRegistry`,
  or a param — bounded by *formats*, not by *use-cases*.

This is the parameterized-by-intent north-star: `buildToolRegistry(defs, ctx, options)` absorbs new
occasions through its arguments. Contrast the current barrel, which embodies the anti-pattern at the
export level — "surface one symbol per thing a consumer might reach for," redundantly with shared.
Collapsing 22→0 pass-throughs and 3 dispatch-shaped concerns into 1 factory is the sub-linear move.

---

## 5. Key Collapses

1. **22 pass-through re-exports → 0.** Consumers import from `@hyperidle/shared` (most already do).
   4 of them (`classifyReversibility`, `composeWorkflowAllowDeny`, `canonicalJson`, `ReturnStatusResult`)
   have **zero consumers today** — pure dead façade.
2. **The whole package dissolves.** 2 real runtime symbols move into the merged
   `harness-execution-platform` (with `harness-registry` + `mcp-provider`); the standalone package,
   barrel, and build target disappear. The Mechanism-B seam survives as the merged package's dep rule.
3. **`toolsForRole` + `toClaudeToolSpec` + `invoke` absorbed into the single `buildToolRegistry` /
   `ToolRegistry` surface** — role-filtering and spec-projection become internal steps / registry
   methods, not top-level exports. 25 → 2.
