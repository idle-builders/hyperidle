# context-assembly — Service-as-Product Audit (AU20)

**Layer:** agent-orchestration · **Owned tables:** 0 · **Events:** none · **Current public exports:** 33
**Consumers:** 1 (`session-lifecycle`, 8 requested methods, via `SessionLifecycleContextAssembly` port)
**Verdict:** **CONSOLIDATE** → fold into `session-runtime` (with `session-lifecycle` + `run-orchestration`).

---

## 1. Existence / Consolidation Verdict

**This is not a product. It is one stage of the session-startup pipeline, carved into its own package as an implementation increment.** The AU19 barrel `@lore` says so outright: "AU19 Increment 0: this package started as a minimal proof-of-mechanism slice." The service-catalog even tags it *"Started as an Increment-0 minimal-mechanism proof-of-slice."*

Test it against the three things that earn a product boundary:

- **Independent consumers?** No. Exactly one consumer — `session-lifecycle` — and that consumer is itself consumed only by `run-orchestration`, which is consumed only by `dispatch`. This is a strictly linear chain `dispatch → run-orchestration → session-lifecycle → context-assembly`. Nothing else in the graph reaches assembly. A product with one caller that sits mid-pipeline is a *function*, not a product.
- **Owned state / lifecycle?** No tables, no events, no scheduler, no independent lifecycle. It is pure compute: given a session about to start, read six domain services through injected ports and write the sandbox's `.fabric/` + `AGENTS.md` + `manifest.json`. It holds nothing between calls.
- **A distinct product responsibility?** The AU19 "why separate" claim is *"assembly is a distinct concern from process management."* That is a **code-cohesion** argument (these functions belong together), not a **product-boundary** argument. Cohesion is satisfied by a module/folder inside a service; it does not require a package boundary with 33 cross-service exports. The load-bearing test — *"who, other than session-lifecycle, ever needs to assemble context independently of running a session?"* — has no answer. Assembly only ever happens as the first act of starting a session.

**Candidate-cluster hypothesis (`session-runtime` = run-orchestration → session-lifecycle → context-assembly): CONFIRMED for this member.** The cluster's counter-argument to test was the "distinct concern" claim. It does not survive: "distinct concern" describes internal decomposition, and decomposition into `admit → assemble → provision → run → terminate` stages is exactly how you'd organize files *inside* one `session-runtime` service. Assembly is the `assemble` stage. The zero-table, single-consumer, mid-chain shape is precisely the "carved as a composition seam, not a product" pattern the frame rejects.

**Why consolidate (fold) rather than dissolve into session-lifecycle only:** the whole three-member chain is one linear flow with no external branch-ins, so the coherent product is the entire `session-runtime` runtime, of which assembly, lifecycle, and orchestration are internal stages. Folding all three at once (vs. only assembly→lifecycle) is what removes the artificial seam count, not just one edge of it. On consolidation, `context-assembly` ceases to exist as a boundary; its logic becomes `session-runtime`'s internal `assemble` module, and its 33 exports collapse to **internal symbols** — zero cross-service surface.

**Infra note:** yes, this is an infra/platform-layer service (its "customer" is another service, `session-lifecycle`). Held to the same bar, it still fails: an infra product must deliver distinct platform value to *named consuming services* — here the single consumer is the very stage it would merge into. No distinct platform value survives the merge.

---

## 2. The Deliberate Target Public API

Even setting the fold aside and asking "what SHOULD this surface be?", the demand is tiny and the 33 exports are almost entirely leaked internals. The real demand is **8 methods from one consumer**, and those 8 are variants-by-session-kind of a single act: *materialize a session's on-disk context.*

The method-per-kind sprawl to collapse:
- `assemblePrompt` / `assembleRoutinePrompt` / `composeAssistantPrompt` — one prompt-composition act, split three ways by session kind (task / routine / assistant).
- `buildSessionContextData` / `buildRoutineSessionContextData` (+ internal `buildSessionContext`) — one context-data build, split two ways by kind.
- `assembleAgentContext` (+ internal `assembleContext`) / `beginAgentWriteback` / `writeSandboxAgentsMd` — the emit-to-sandbox + watch side of the same act.

**Target public interfaces (2), parameterized by intent:**

| Interface | Shape | Subsumes | Why a real shared capability |
|---|---|---|---|
| `assembleSession` | `assembleSession(db, spec: SessionAssemblySpec) → Promise<AssembledSession>` where `spec.kind ∈ {task, routine, assistant}` | `assembleAgentContext`, `assembleContext`, `buildSessionContextData`, `buildRoutineSessionContextData`, `buildSessionContext`, `assemblePrompt`, `assembleRoutinePrompt`, `composeAssistantPrompt`, `writeSandboxAgentsMd`, `beginAgentWriteback` | "Prepare everything a session needs to see, fresh, into its sandbox, and hand back a writeback handle" is ONE capability. Session kind is an intent parameter, not a product boundary. `AssembledSession` carries `{ outcome, prompt, manifestPath, writeback }`. |
| `ContextAssemblyPorts` | injected read-port bundle (`knowledge`/`work`/`users`/`routine`/`filesystems`/`org`) | the 5 `*Reader` port types + filter/scoring/watcher types | The one inside seam to domain services (Mechanism-C DI). Stays as the single composition-root contract. Under the fold this becomes `session-runtime`-internal. |

**Everything else is an internal detail that should NOT be a public export:**
- `stripFrontmatter`, `substituteTemplateVars`, `buildTemplateVariables` — pure prompt-templating helpers, used only inside prompt composition. Leaked; make internal.
- `EMITTED_ROOTS_AGENTS_MD`, `EMITTED_ROOTS_CONTEXT_ASSEMBLY` — **duplicated** definitions; the source of truth already lives in `@hyperidle/filesystems` (`scaffolding-paths.ts`). Delete the copies, import from filesystems.
- `Manifest`, `ManifestEntry`, `ToolSummary`, `ContextAssemblyConfig`, all four `*SessionContext(Config|Data)`, all four `Prompt*(Input|Result)`, `AgentContextAssemblyOutcome`, `AgentWritebackHandle`, `AssembleAgentContextInput`, `AssistantPromptResult` — intermediate step-boundary types that exist only because the one act was sliced into many exported functions. Collapse into `SessionAssemblySpec` / `AssembledSession` (input + output of the single entry) and keep the rest local.
- The per-Reader port types (`KnowledgeReader`, `WorkReader`, `UsersReader`, `RoutineReader`, `FilesystemsReader`, `ContextAssemblyKnowledgeListFilters`, `ContextAssemblyScoringContext`, `ContextAssemblyFileWatcher(Config)`) fold under `ContextAssemblyPorts`.

**Target export count: ~3** (`assembleSession` + `SessionAssemblySpec` + `AssembledSession`), with `ContextAssemblyPorts` internal to the merged `session-runtime`. Down from 33. Under the recommended fold, the *cross-service* surface is **0** — assembly becomes an internal stage.

---

## 3. Inside Lens

As `session-runtime`'s internal `assemble` module, coherence stays high: one public entry (`assembleSession`) dispatching on `spec.kind`, backed by three private helpers (`composePrompt`, `buildContextData`, `emitSandbox`) that no longer need to be exported or type-fenced across a package wall. The Mechanism-C `ContextAssemblyPorts` DI seam stays — it is the genuinely valuable part (domain reads via injected ports, no cross-service imports), now wired once inside `session-runtime`'s composition root alongside lifecycle/orchestration wiring. Removing the package boundary deletes the duplicated `EMITTED_ROOTS_*` constants and the structural-mirror types (`Manifest`/watcher configs) that only exist to dodge cross-service type imports — a large chunk of the 33 was boundary-tax, not capability.

---

## 4. Scaling Argument

Apply the test: *"add dozens more session kinds / callers — do we need more methods?"*

- **Today's shape (fails):** each new session kind adds a triple — `assembleXPrompt` + `buildXSessionContextData` + its input/output types. Task and routine already cost 2 prompt methods + 2 context-data methods + assistant a third prompt method. A fourth kind (say a "review" session) would add another `assembleReviewPrompt` + `buildReviewSessionContextData` + 4 types. Linear method growth per kind.
- **Target shape (scales sub-linearly):** a new kind is a new `spec.kind` value and a private branch inside `composePrompt`/`buildContextData`. The public surface — `assembleSession(db, spec)` — does not change. Ten new kinds add zero public methods. New *consumers* likewise compose the one entry; they don't each get a bespoke method. This is the `list(filter)` / `transition(from,to)` north-star: parameterize by intent, absorb use-cases without new methods.

---

## 5. Key Collapses

1. **3 prompt methods → 1** (`assemblePrompt` + `assembleRoutinePrompt` + `composeAssistantPrompt` → `assembleSession(spec.kind=…)`). Method-per-kind is the exact anti-pattern.
2. **2 context-data methods → folded** (`buildSessionContextData` + `buildRoutineSessionContextData` → internal branch of the one entry).
3. **Sandbox-emit trio unified** (`assembleAgentContext` + `beginAgentWriteback` + `writeSandboxAgentsMd` → one `AssembledSession` result with a `writeback` handle).
4. **~24 intermediate step-boundary types collapse to 2** (`SessionAssemblySpec` + `AssembledSession`); the per-step config/data/input/result types were only exported because the one act was sliced into many exported functions.
5. **Delete duplicated `EMITTED_ROOTS_*` constants** — the source of truth is `@hyperidle/filesystems`; the context-assembly copies are drift-risk.
6. **Fold the whole package into `session-runtime`** — 33 cross-service exports → 0; assembly becomes the internal `assemble` stage of one runtime service, eliminating the boundary-mirror types entirely.
