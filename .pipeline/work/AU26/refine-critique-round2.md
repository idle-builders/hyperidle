## Refine Critique: AU26 — round 2

**Score:** 8.5/10 (85/100) · **Rounds:** 2 of 3 · **Verdict: PASS** — gate ready.

**Artifact:** `.pipeline/work/AU26/requirements.md` (revision)
**Judged against:** `.pipeline/work/AU26/plan.md`, `.pipeline/work/AU21/architecture.md` (Decisions J/K/L), `.pipeline/AU.md`, round 1's `.pipeline/work/AU26/refine-critique.md`
**Verified at:** `origin/main` @ `75d85687` — every citation below re-traced in source with `rg -a`, not taken from the disposition table.

Zero CRITICAL. Five WARNING, two NOTE. Both round-1 CRITICALs are genuinely closed; the remaining findings are one- and two-sentence fixes, several of which architecture can legally absorb. This is an honest revision, not a disposition table.

---

## Round-1 finding verification

Every disposition claim was checked against source. **No false claim found.** Spot-check results:

- **§2.1's site enumeration is exact.** I re-ran Step 3 independently. `harness-capability-read-model.ts` importers are exactly the 8 route files listed; call sites are exactly `harnesses.ts:86,100,102,114,161` · `connections.ts:204` · `workers.ts:34` · `agents.ts:135,165` · `agent-profile.ts:311,383,386` (`resolveHarnessAvailable` at `:376-387`) · `agent-profile.ts:299` · `teams-routes.ts:273,771`; type-only params exactly as listed. `resolveHarnessAvailable` really is exported from `agent-profile.ts:376` and imported by `teams-routes.ts:66`. `harnessAvailable` → `computeHealthSignals` → response body at `:299-308`, nothing else. **12 direct + 3 transitive + 9 type-only is right, and zero residual is right.**
- **§2.1 re-run 2's trace is exact.** `server-factory.ts:109` import, `:1098` declaration, `:1181` call, `:1257-1259` dispose. Non-test importers: that file only. Tests: `session-activity-gateway.integration.test.ts:36,62,85,111`. `D`-only → `relocates` follows the written rules; the dissolve check correctly fails (the function returns an unregister closure — real lifecycle). **The verdict is right.**
- **W-2 is fixed *and* its correction is correct — I verified both halves.** `createApp(` under `packages/core-api/**/*.integration.test.ts` = exactly 11 ✓. Further `createServer(` test files = exactly the 8 named ✓. `test-utils.ts:13` and `test-fixtures.ts:49` both call `createApp` ✓ and neither is in `plan.md`. `playwright.ah1.config.ts:23` is comment-only ✓. **`packages/eval` calls neither `createApp` nor `createServer` anywhere** — `provision-harness.ts:14` imports `runSession` from `@hyperidle/core-api/session`, scenarios import `fireRoutine`/`provisionTeamRoutines` from `@hyperidle/core-api/routines`. `plan.md:32` was wrong and the artifact's correction is right.
- **W-3/W-5/W-6/N-2/N-3 fixed.** `agent-orchestration-port.ts:22-23` really reads "STRICTLY READ-ONLY (§12)" ✓. Port constraint now appears three times (`:105`, `:181` hard rule 4, `:221`). Human gate is a hard sequencing constraint at `:208`, echoed in success #4 and AC #5. AC #6's three-part proof (re-wired route tests / Playwright painted output / bounded `packages/web` diff) is real and falsifiable. §9 item 6 names `plan.md:30` vs `:46` and states `:46` governs. `worker-ingress.ts:239-279`, `app.get(` at `:259` ✓. Step 0 promotes the charter into the test ✓.
- **W-7 fixed.** §4 C2 and C4 now list sites with no classes attached.
- **W-1 fixed.** `workspace-api` survives only as a rejection rationale (§3), a reading note (§8), recorded drift (§9 item 9) and the disposition log. Zero live uses in §3, §5, §7 or §9's substance. The collision claim is real: `workspaceAdapter` at `server-factory.ts:762` and `desktop/src/boot-server.ts:30` ✓. The asymmetry justification (one noun because exactly one thing is net-new) holds.

**C-1 — genuinely fixed.** I re-ran the test myself on the counter-example and on units the planner did not pick. The taxonomy residual is closed: the widened B plus the tie-break ("apart from the response body, does anything consume the result?") disposes of all three previously-unclassifiable sites, and the residual rule removes the silent-invention escape. Every candidate I threw at it produced a verdict — none went indecisive. That is a materially different state from round 1. Remaining defects are in the *verdict* rules, not the classification, and are W-level (W-1, W-2 below).

**C-2 — genuinely fixed, with one soft spot.** J6's supersession is well-argued and I checked the load-bearing premise: `AU21/architecture.md:844`'s opening clause *is* J6's governing rationale, and J6's second argument (mutations can't ride a read-only Port, so keep them core-hosted) is itself downstream of "agent-orchestration has no HTTP surface" — once C5 exists, both collapse. "Sole rationale" is a fair reading. Superseding it is **within refine's authority here**: round 1 explicitly ordered it, `plan.md:39` already anticipated the split superseding parts of the Port contract, and the deviation is recorded as drift in §9 item 7 rather than silently applied. J7's "stands" is correct. **The sequencing inversion is justified but imprecise** — see W-3.

---

## WARNING

### W-1 — "follows its readers" is undefined when readers straddle the boundary, and the artifact's own J6 supersession guarantees straddling for its flagship re-run.

*(This is the single most important remaining finding.)*

§2 Step 2's seam verdict is "the seam follows its readers. It lives on the reading side of the boundary." §2.1 applies it: `harness-capability-read-model.ts` "stays on whichever side hosts the routes that read it, moves with them if C5 moves those routes." That phrasing assumes one side.

Its readers do not sit on one side after this WP. `routes/connections.ts:204` calls `harnessCapabilityDescriptors` for the inherited projection — and §4 C1 now rules that connections' HTTP surface, reads *and* mutations, is hosted by `orchestration-api`. Meanwhile `agent-profile.ts:299,311`, `teams-routes.ts:273,771`, `agents.ts:135,165` and `users.ts:196` serve charter-fixed core domains and stay on `createCoreApiApp()`. So the seam's readers land on **both** sides of the boundary the seam exists to span, and the test's fourth verdict has no rule for that.

This is not hypothetical and not a hard case I constructed — it falls directly out of two decisions this document makes. It is also the exact verdict the artifact calls "decisive, and independent of how its sites classify."

**Required:** one sentence in Step 2 stating what a seam does when its readers straddle — duplicate, sink to `@hyperidle/shared`, or stay with the majority side and be reached across the boundary. Note the third option collides with `orchestration-api` hard rule 2 (no cross-Layer reads), so this is not a free choice.

### W-2 — For a composition-wired unit the site evidence is inert; Step 0's narrative judgment carries the whole verdict.

`session-activity-gateway.ts` has exactly one non-test site (`server-factory.ts:1181` + dispose), classed D → D-only → relocates. `work-state-push-gateway.ts` is **structurally identical** — same file shape, same `register…(eventBus, wsHub)` signature returning an unregister closure, same single composition site (`server-factory.ts:1122` + `:1260` dispose), same test-only remainder. Run Steps 3-5 on it and you get the same D-only → relocates: a verdict against Work, a charter-fixed core domain.

Only Step 0 stops that, and Step 0 asks "is this unit about an agent?" — an unaided characterization, which is precisely the judgment the mechanical steps exist to replace. There are roughly ten such register-at-boot units in `packages/core-api/src/services/`, so this is a class, not an edge. As written, the test *cannot* produce evidence for or against relocating any of them; it can only ratify Step 0.

**Required:** state that when a unit's only sites are class D, site classification yields no signal and the verdict rests on the unit's own domain — and give the evidence bar for *that* call (what it subscribes to, whose state the payload is, who consumes the broadcast), so it is a traced argument rather than a label. §2.1 re-run 2's Step 6 already does this informally; promote it into the procedure.

### W-3 — §4 C1 contradicts itself on how far the sequencing inversion reaches, and inverts more of Decision J than the argument supports.

`:222` — "C5's `createAgentOrchestrationApp()` skeleton is the **first** increment, and C1's **J3/J4** land onto it."
`:223` — "J1/J2/J3 … are untouched. Only J4's hosting target changes."

Both cannot hold. J3 (stand up the SQL-owning Service, rewire `connection-provisioning.ts` in-layer, delete `CoreApiPort.connections`) touches no HTTP surface at all — `AU21/architecture.md:857` — so it has zero dependency on the app skeleton. Only **J4** re-hosts the management surface, and only J4 needs the skeleton to exist. `plan.md:30` says Decision J's four-increment breakdown is locked and must be built, not re-derived; inverting J1-J3 as well re-derives ordering the plan locked, for no stated reason.

**Required:** narrow `:222` to "J4 requires the skeleton; J1-J3 are unaffected and may still lead." That also preserves `plan.md:32`'s "connections first, largest" intent for the bulk of the work while honouring the no-interim-host rule where it actually binds.

### W-4 — §2.1's found candidate is granted a deferral that AC #5 and §1's failure shape forbid.

`:161` — architecture "must state explicitly whether it rides C5 **or is deferred as a named follow-up**."
`:20` / AC #5 (`:324`) — "every 'relocate' verdict has actually been executed in this WP."
`:25` — a WP that produces "verdicts without moves (deferral dressed as analysis)" is a failed AU26.

§2.1 reached a **relocate** verdict for `session-activity-gateway.ts`. Under the document's own rules that verdict must be executed here; `:161` hands architecture permission to defer it. §6 out-of-scope #1 ("a real find … is not built here") pulls the same way. One of the two must yield.

Recording it as a *found candidate* rather than absorbing it is the **right** call under `plan.md:32`'s cross-cutting rule — that part is correct. The defect is the deferral clause, not the framing. Note the artifact itself calls it "the natural cargo of C5" and "not a sixth build item," which reads as riding C5 — i.e. moved in this WP, AC #5 satisfied. Delete the "or is deferred" clause and the contradiction goes away with no other change.

### W-5 — C1's reasoning cites a rule §3 no longer states; the core-api app now carries zero hard rules.

`:216` grounds J6's supersession in part on "the core-api app's own rule (§3 …): a Layer app hosts no route whose query logic another Layer owns." §3's core-api-app subsection (`:183-191`) states no rules at all — it has an "Is," a naming decision, the `workspace-api` rejection, and the asymmetry note. The rule being cited is the round-1 draft's `workspace-api` hard rule 2, which was dropped along with the noun.

Round 1's W-1 asked explicitly to "keep the two hard rules attached to `createCoreApiApp()`." `orchestration-api`'s four hard rules survived intact and gained rule 4 ✓ — the core-api app's did not. The only surviving statement of the principle is informal, in the guide draft (`:285`, "Neither imports the other's routes"), and `orchestration-api` hard rule 1 covers one direction only.

**Required:** give the core-api app the symmetric pair — (1) it never imports an `agent-orchestration` route module, (2) it hosts no route whose data/query logic an `agent-orchestration` Service owns. Both are already load-bearing: rule 1 is AC #4's observable proof (`app.ts:42`'s import gone — confirmed present at HEAD), rule 2 is the third leg of the J6 supersession.

---

## NOTE

- **N-1 — J8's "declined to touch" reading is slightly self-serving.** `AU21/architecture.md:850` ends "`filesystems` records + `/api/filesystems` routes + `SettingsFilesystems` are otherwise untouched **(F2 stands for filesystems)**." That parenthetical *affirms* F2's stays-ruling for filesystems; `:229` reads it as J8 declining to decide. The outcome (C2 opens the record's verdict) is still right, but on a better ground the artifact already has: `plan.md:46` is the later spec of record and explicitly re-opens it, and §9 item 6 already rules `:46` governs. Re-ground `:229` on `plan.md:46` rather than on a reading of J8's silence — a mischaracterised lock status is exactly what makes architecture re-derive the wrong thing. The rest of the J8 ruling (bounded to the resolver's execution locus; the "via the J6 door" clause superseded) is correct.
- **N-2 — "no logic beyond narrowing, forwarding, or reshaping" is not operationalized, and the flagship unit sits on the line.** `harnessRegistrationMeta` (`harness-capability-read-model.ts:90-104`) synthesizes `maxConcurrent: 1` — a constant invented core-side, present in no source descriptor — and `harnessCapabilitiesForType:85` supplies a default (`returnEnforcement ?? "none"`). A reviewer reading "no decision" strictly could fail the gate on either, flipping the verdict from "follows its readers" to B-only → relocates, which drags `/api/harnesses`, `/api/workers`, agent-profile and the team roster across the boundary. §2.1 asserts "no decision" without addressing them. Say whether a defaulted or synthesized field breaks the seam gate. (Judged as NOTE, not WARNING: the gate's *intent* is clear from the three worked failures, and the units differ by more than this.)

---

## What's working

- **The evidence discipline is now exceptional.** I re-traced roughly thirty `file:line` claims across §2.1, §4 C5 and §9 and found **zero** wrong. The `plan.md` corrections in §9 item 3 are the sharpest part of the revision: the plan's `packages/eval` claim is flatly wrong and the artifact proves it with the actual import (`provision-harness.ts:14` → `@hyperidle/core-api/session`), rather than just adding the missing files. A correction that reverses the plan and is right is worth more than a longer list.
- **The tie-break is a real mechanism, not prose.** "Apart from what is serialized into the response body, does anything consume the result?" plus "an A asserted without naming its effect is not an A" converts the round-1 unclassifiable sites into a mechanical B and closes the circularity that made every core-api unit stay by construction. The residual rule ("the test is defective for that unit — record it, do not invent a class") is the right shape: it fails loudly instead of fabricating an answer.
- **The J6 supersession is the correct call, correctly argued.** It settles the principle at refine altitude, states the three consequences (no Port `connections` family; J7 stands; sequencing), and records the plan deviation rather than applying it silently.
- **Regression check clean.** Verdict-neutrality still holds: C2 (`:226` — "if the engine's verdict were 'stays,' success is the evidenced verdict itself"), C3's per-column framing, C4's four-live-verdicts framing, and W-7's de-classified site lists all survive; the only pre-supplied verdicts are C1's (settled by AU21) and §2.1's (which are the test-re-run proof, not in-list candidates). Scope integrity still holds: §6's fence is now nine items, tighter than round 1's, with the charter promoted into the test itself as Step 0.

**Gate readiness: CLEAR.** W-1 and W-4 are one-clause edits and should land before architecture; W-2, W-3, W-5 and N-1 can ride the architecture pass provided architecture is told to close them rather than inherit them.
