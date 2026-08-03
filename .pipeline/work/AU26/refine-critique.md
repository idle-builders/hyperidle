# AU26 — Refine critique

**Artifact:** `.pipeline/work/AU26/requirements.md`
**Judged against:** `.pipeline/work/AU26/plan.md` (spec of record), `.pipeline/AU.md`, `.pipeline/work/AU21/architecture.md` (Decisions J/K/L), `docs/architecture/runtime-simplification.md`
**Verified at:** `origin/main` @ `75d85687` (matches the artifact's own claimed base)

**Score: 72 / 100** — **VERDICT: REVISE** before the human requirement gate.

Two CRITICALs, seven WARNINGs, three NOTEs. Both CRITICALs are targeted edits, not a rewrite. The evidence discipline is genuinely strong; the primary durable artifact (the test) is not yet finished, and the requirement contains a rule that forecloses a question it simultaneously declares open.

---

## Strengths (recorded, because they are load-bearing)

- **Every load-bearing drift claim in §9 is TRUE.** Spot-checked at `75d85687`: `hono` at `run-orchestration/package.json:18`; `app.get("/ws/worker")` really is owned by `worker-ingress.ts` (`:259`, in `registerWorkerWsRoute` `:239-278`) on a Hono app handed in from core-api; `plugin-configuration.ts:727` is a real second non-test connections consumer; **all ten `users` line numbers are exact** (`kind:50`, `status:61`, `maxConcurrentSessions:62`, `systemPrompt:74`, `harnessType:76`, `modelTierPreference:78`, `modelId:84`, `modelProvider:92`, `systemPromptPath:53`, `skills:60`); `server-factory.ts:1006` / `:1110`; `remote-server/src/index.ts` 51 lines, `desktop/src/boot-server.ts` 70; `.mount()`/`.captureBack()` non-test callers are exactly `filesystem-provisioning.ts:78` and `provisioner.ts:527`. `modelTierPreference` is a real catch — it is a sixth column of identical shape absent from `plan.md`. This is the best part of the artifact.
- **Verdict-neutrality (task question 3) is genuinely met.** `requirements.md:141` ("If the engine's verdict were 'stays,' success is the evidenced verdict itself — the AC is not unmet"), `:145` (per-column, migration costed only *if* relocate), `:149` ("all three live… a hypothesis, not a default to confirm"), `:20` ("every 'relocate' verdict"). No success criterion requires the answer to be "relocate". **No CRITICAL here.**
- **The disqualifier list (`:75`) is the sharpest thing in the document** — it correctly bans "UI locality", "it's infra", "the sibling moved", and "core-api is the Layer with the HTTP surface". Those are precisely the rationalizations that produced the wrong answers historically.
- **Scope fence (task question 4) holds.** `:195` "In: the five candidates in §4, and only those" is a hard fence, and all four named drift risks are explicitly out: blanket per-Service audit (`:199`), LLM-key catalog (`:200`), `model-gateway` (`:201`), AU27 (`:202`). Architecture cannot legally drift into any of them. See W-2/W-3 for the opposite problem (under-scoping).

---

## CRITICAL

### C-1 — The test failed on the first out-of-list candidate I applied it to. It is not yet re-applicable without re-derivation.

*(Task question 1 — I ran the exercise rather than judging the prose.)*

Candidate chosen from core-api, not in §4's list: the harness-capability read model, `packages/core-api/src/services/harness-capability-read-model.ts` (a `Pick`-narrowed read-only view over agent-execution's `AdapterPool`; agent-environment-shaped, exactly the shape §2 claims to decide).

Step 1 (name the unit) and Step 2 (`rg -a` enumerate) worked cleanly — 9 non-test consumer sites. Step 3 (classify into **exactly one** class) is where it broke:

| Site | Class under §2:58-61 | |
|---|---|---|
| `routes/harnesses.ts:86,102,114,161` | **B** | clean — a human editing harness config |
| `routes/connections.ts:204` | **B** | clean |
| `routes/agent-profile.ts:299` (`resolveHarnessAvailable` → `computeHealthSignals`) | **unclassifiable** | |
| `routes/agent-profile.ts:311` (`harnessCapabilitiesForType` → profile display) | **unclassifiable** | |
| `routes/teams-routes.ts:273`, `:771` (roster operational status) | **unclassifiable** | |

**4 of 9 sites fit no class.** Class **A** (`:58`) requires core's "own domain behavior… depends on the result." Class **B** (`:59`) is narrowed to "display/validation read whose **only consumer is a human editing configuration**." A human *viewing* an agent's health signal or a team roster's operational status is neither — they are not editing configuration, and no core domain decision depends on the result. §2 Step 3 mandates a closed taxonomy ("exactly one class") with no residual bucket, and Step 4 has no rule for "no class fits". Step 4's escape hatch — "any **genuine** A" (`:64`) — leaves "genuine" undefined, reintroducing exactly the judgment the test exists to remove.

The stakes are not academic. If those 4 sites are B, the unit is B-only → **relocates**, and via `workspace-api` hard rule 2 (`:102`) it drags `/api/harnesses`, the agent-profile route and the team-roster route out of `core-api` onto `orchestration-api`. If they are A, everything **stays**. Two opposite, high-blast-radius verdicts, and the written test does not pick.

Contrast with the four in-list candidates, where the test *does* decide — because each has an unambiguous A or an unambiguous C. I confirmed this holds even where it is non-obvious: the filesystem **record** has a genuine class-A site at `packages/core-api/src/routes/knowledge.ts:186` (`getFilesystem(db, scopeId)` labelling a knowledge scope — the knowledge domain consuming the record for its own purpose), so the record correctly resolves to "stays" on evidence rather than on `plan.md`'s disqualified "human-administered → stays" rationale. That is the test working. But it works on the cases it was reverse-engineered from.

**Required:** a fifth class (or an explicit widening of B) for *human-facing read-only display that is not configuration editing*, plus a stated tie-break when a site is arguably A and arguably B. Until then the WP's stated primary deliverable — "one re-applicable test" (`:13`) — is not delivered.

### C-2 — §3's own hard rule forecloses the J6 question §4 C1 declares open. Architecture can legally choose an option this requirement forbids.

*(Task question 6.)*

`requirements.md:102` — `workspace-api` **Hard rule 2**: "It hosts no route whose data/query logic is owned by an `agent-orchestration` Service."

`requirements.md:138` — §4 C1: "J6 ruled connections' HTTP surface **stays core-api-hosted, delegating**. The later API split may supersede that. Architecture must state explicitly which of the two governs… it may not leave both standing."

C1's entire premise is that connections' data/query logic becomes an agent-orchestration Service. So option "J6" = a `workspace-api`-hosted route whose query logic is owned by an agent-orchestration Service = **a direct violation of hard rule 2**. One of the two options architecture is told to choose between is already illegal under this same document.

It is worse than a latent tension. `AU21/architecture.md:844` states J6's rationale verbatim: *"core-api is the Layer with the HTTP surface; agent-orchestration has none of its own."* That exact sentence is on §2's disqualifying-rationalizations list at `requirements.md:75`. **The requirement bans J6's reasoning on one page and preserves J6 as a live option on another.**

**My view on the deferral (asked directly): deferring was wrong.** Refine's job is to settle the principle; it did — twice, at `:75` and `:102` — and then failed to apply it. The requirement should state: *J6 is superseded; its rationale is disqualified by §2 and its outcome is forbidden by `workspace-api` hard rule 2. Connections' routes go to `orchestration-api`. Architecture designs the move, it does not re-open the choice.* Leaving it open invites an architecture that either re-derives a banned answer or silently breaks a hard rule.

**Also unaddressed:** Decision J8 (`AU21/architecture.md:850`) already locked "filesystems reachability co-moves (bounded)". §4 C2 (`:141`) demands "an independently-written verdict for the record + reachability-probe UI", and §8 (`:227`) tells the reader J0–J8 are "locked… build it, don't re-derive". J8 is never named. Same collision shape as J6, one level down. (Logged again as W-6.)

---

## WARNING

### W-1 — `workspace-api` is pinned as a concept with no code manifestation. That is the weakest of the three available resolutions.

*(Task question 2 — judging the collision resolution specifically.)*

`orchestration-api` **is** properly pinned: is (`:108`), is-not (four exclusions, `:110-114`), three hard rules (`:117-119`), and a committed code identifier `createAgentOrchestrationApp()`. Real noun.

`workspace-api` is not. `:104`: "`workspace-api` is the **conceptual** name… The code identifier stays the plan's settled `createCoreApiApp()`. Architecture may not introduce a `Workspace*` symbol for this concept." So the noun appears in exactly zero lines of code, while the tier table at `:128` lists both as peers of a new "Layer app" tier. Asymmetric — one peer is a symbol, the other is a footnote.

The tell is in the artifact's own guide draft: it cannot use the word without glossing it (`:182` "the surface we call **workspace-api**", `:183` same construction), and `:189` requires a permanent disambiguation note against `HYPERIDLE_WORKSPACES_DIR`. A noun requiring a footnote at every use is a noun a maintainer will not find and will not adopt.

There were three options: (a) commit `workspace-api` to code and eat the collision, (b) drop it and name the artifact after the symbol that already exists and already reads correctly — `createCoreApiApp()` / "core-api app" — which collides with nothing and matches the Layer name, (c) keep it conceptual-only. The artifact chose (c), the only one that pays the collision cost *and* the not-findable cost while buying nothing. `workspace-api` carries no meaning that "core-api's own app" does not already carry. Recommend (b): delete the noun, keep the two hard rules attached to `createCoreApiApp()`, and keep `orchestration-api` (which earns its name — it *is* net-new).

### W-2 — `plan.md`'s enumerated API-split blast radius is entirely absent.

`plan.md:32` names the collateral by file: `packages/eval/src/provision-harness.ts` + 3 eval scenario files, `packages/web/scripts/{ah1,ah5,ah6}-test-server.ts`, and 11 `*.integration.test.ts` under `packages/core-api` that construct `createApp()` directly. `requirements.md` §4 C5 (`:152-155`), §6, and §7 row 4 mention none of it. For an L-sized WP whose sizing risk `plan.md:52` explicitly flags ("its own investigation may reveal it's larger than it first looks"), dropping the one concrete enumeration of blast radius is a real under-scope.

### W-3 — `plan.md`'s `AgentOrchestrationPort` read-only constraint is dropped.

`plan.md:39`: "`AgentOrchestrationPort` stays strictly read-only… mutations stay HTTP-hosted in core-api, delegating to the relocated Service, **never routed through a read-only seam**." `requirements.md` mentions the Port only at `:113` (its gateway may become redundant). The read-only constraint appears nowhere in §2's destination rules (`:79-82`), §3's hard rules, or §4 C1. It is load-bearing precisely for C1 — connections CRUD is mutating.

### W-4 — `plan.md`'s human gate on the verdicts, before their relocations are built, is dropped.

`plan.md:28`: "the `filesystems`-engine, `users`-columns, and workspace-api/orchestration-api verdicts are real, consequential domain calls the founder must confirm **before those relocations (if any) are built**, not accepted from an agent's audit alone." `requirements.md:20` makes execution unconditional ("every 'relocate' verdict has actually been executed in this WP") with no gate between verdict and build, and §1/§4/§7 never restate the sequencing constraint. `DOC-CLASS: significant` triggers a gate on *this* document; it does not gate the architecture-time verdicts, which is what `plan.md` asked for.

### W-5 — AC #6 has no proof shape anywhere.

AC #6 requires the Settings connections/filesystems/agents pages and the session live-activity UI to "work identically end-to-end, with zero required frontend behavior changes." Coverage is `:21` ("behave identically end to end") and `:203`, plus §7 row 6's note about a second base URL. Neither names a class of proof. This is the one AC whose risk is a silent regression from re-pointing a base URL, and CLAUDE.md's first principle requires a verification method per criterion. §4's other candidates all state observable proof (`app.ts:42` import gone, the add-after-emit test, `file:line` verdicts) — this one does not.

### W-6 — Decision J8 reopened without acknowledgement; §9's "no contradiction" claim is overstated.

Two parts. (a) J8 (`AU21/architecture.md:850`) locked the reachability probe's co-move; `:141` demands an independent verdict for it; §8 declares J0–J8 locked. Unreconciled — see C-2. (b) `:248` states "No contradiction found between `plan.md` and `docs/` ground truth" — but `plan.md` contradicts *itself* on the filesystem record: `:30` says it "stay[s] core **regardless**", `:46` says "not a foregone 'stays' conclusion either way." The requirement silently adopts the second reading (`:141` opens the verdict) and records no deviation in §9. Adopting the evidence-first reading is the right call — §2's disqualifier list rightly bans `plan.md:30`'s "human-administered → stays" rationale, and `knowledge.ts:186` supplies a genuine A that makes the record stay anyway. But refine's job is to *name* the plan's internal contradiction and state which reading governs, not to resolve it silently while asserting none exists.

### W-7 — §4's pre-supplied evidence summaries thumb the scale on the verdicts §4 works hard to keep neutral.

`:142` ("No class-A site found in core-api") and `:150` ("which read as class A") are verdict-shaped conclusions delivered before the trace they are supposed to constrain. Both are labelled ("a floor for architecture, not a substitute for its trace"; "Architecture must still classify each site"), and both are factually correct — I confirmed the mounter has no non-test core-api caller, and `WsConnectionHub`'s consumers are `routes/ws.ts`, `routes/threads.ts`, `services/work-state-push-gateway.ts`. But given that the WP's stated failure shape is "moves without evidence" (`:25`), handing architecture a pre-written conclusion is in tension with the discipline the same section demands. Downgrade both to a bare site list without the classification.

---

## NOTE

- **N-1 — Candidate count is inconsistent.** `:13` and `:20` say "four candidates"; `:195` and §4 say five (C1–C5). Reconcilable only if "four" silently means "the four still open". State it.
- **N-2 — `:241` cites `worker-ingress.ts:232-282`** for the route registration; the range starts at the doc comment and `app.get("/ws/worker")` is at `:259` (function `:239-278`). Cosmetic; the substantive claim is correct and is the artifact's best find.
- **N-3 — `plan.md:36`'s charter constraint** (Work/Conversation/Knowledge/Users-identity/Settings are fixed as core domains, not re-openable) is only implied by `:199`'s out-list. Worth restating as an explicit boundary, since §2's mechanical test is otherwise capable of producing a verdict against a charter-fixed domain.

---

## Direction check — did refine sharpen the right way?

Yes on evidence, yes on scope, yes on verdict-neutrality, **no on the primary deliverable**. The WP's whole reason to exist is one durable, re-applicable test; the requirement produced a test that is decisive on the four cases it was derived from and indecisive on the first fifth case tried. That plus the self-contradiction at `:102` vs `:138` is what blocks the gate. Both are bounded fixes.

**Gate readiness: NOT CLEAR. Revise C-1 and C-2, then re-gate.**
