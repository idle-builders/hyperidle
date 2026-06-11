# Architecture Critique: AF8 — Notification delivery backend + popover/Settings

## ROUND 2 (revised plan @ `74186f5b`) — APPROVED

ARCHITECTURE-SCORE: 8/10  rounds=1  score-line: SA:8 LI:9 AC:9 DM:8 N:8 MD:8 FMC:8 S:8 V:9

**Verdict: APPROVED.** Overall 8.1, no CRITICAL. All 5 prior findings resolved; verified each against the real code, not the plan's word. Builder proceeds to Phase 3.

### Finding resolution (verified)

1. **CRITICAL (cost-breach/quiet-hours split) — RESOLVED.** New § "Cost-breach silence split" splits the single boolean into two predicates: `isFactorySilenced` (silence_mode + per-product, NO window) for the bypass, `isInSilenceWindow` (already exported, confirmed `silence-policy.ts:84`) for deferral. Per-row decision is correct against hard rule #8: `cost_breach` defers iff `inQuietHours`, else flushes (bypassing factory silence); `blocking` defers on either; `digest` always flushes. New **AC12** covers BOTH cases (a: silence_mode set, no window → sent; b: window set, no silence_mode → deferred then sent past window). `isSilenced` retained as OR-of-both for the `blocking` path (back-compat for policy-engine) — correct, the split is additive not destructive.
   - **Protected-test analysis verified TRUE against code.** `dispatcher.integration.test.ts` hard-breach test (123-156, plan cites 137-156) calls `enable(db)` (42-60) which sets ONLY `notifications.*` keys — no `silence_mode`, no `silence_product_*`, no `silence_window_*`. So it does NOT encode "breach bypasses everything" and stays green under the split. Confirmed it is a direct-send `route()` test (`eventBus.emit`), and `route()`'s quiet-hours gate (`dispatcher.ts:655`) keys on `prefs.quietHoursEnabled` (alert-prefs, default off in test), not `isSilenced` — so the new flushQueue split cannot touch it. Plan's step-6 instruction to also fix `route()` 651-655 (`!prefMeta.isHardCostBreach &&` currently lets a hard breach skip the quiet-hours enqueue) is correct and necessary to mirror the split on the direct-send path; the protected test never enables `quietHoursEnabled`, so no protected assertion changes. The plan even pre-flags the conditional: if any existing assertion DID depend on a breach paging in quiet hours, flag+change it consciously. Honest and accurate.

2. **WARNING (AF10 inflation honesty) — RESOLVED.** New "Known inflation until AF10 lands" paragraph (§ Design-it-twice A) states explicitly the surfaced value is real-but-inflated until AF10 fixes its quadratic delta bug, fails-safe-to-over-alert (warns early, never late), disappears automatically when AF10 ships. Carried into task 7's `@lore` requirement and R2.

3. **WARNING (`kind` discriminator) — RESOLVED.** Now MANDATORY (`kind: "attention" | "auto_unblock"`, not optional), set at both emit sites; compiler is the enforcement. Message-string fallback explicitly and emphatically rejected ("Drop it entirely"), with the rationale (copy is not a contract). Listener filters on `kind` only. AC3 asserts the filter must not rely on message text.

4. **WARNING (corrected source link) — RESOLVED.** AC2 now pins `sourceLink` EXACTLY equal to `` `/conversations/${item.threadId}` `` (thread-keyed), explicitly NOT `/conversations/item/<id>`, and states the old shape 404s (router has only `/conversations/:threadId`). Reconciliation table + listener doc both flag the broken `dispatcher.ts:178` shape and forbid copying it. `threadId`-null fallback to `/conversations` (not a 404-shaped link) is a sensible add.

5. **WARNING (mute rate-limit) — RESOLVED.** Now justified positively on the route's own properties: idempotent set-to-value, founder-tier single-trust-tier auth, no fan-out/egress. `/test` precedent cited as "limiters where fan-out exists," not an appeal-to-absence. Tight and correct.

### New findings (round 2)
None material. NIT: AC numbering is non-sequential (AC12 listed between AC4 and AC5 in the table) — cosmetic, harmless. The `nq_inapp_idx` urgency-sort note from round-1 NIT is unaddressed but was NIT-level and cap-50 bounds it — not a gate.

---

### ROUND 1 (original)


Reviewer persona, cold read of `plans/AF8/architecture.md` against the locked concept (`concept.md`, `concept-notes.md`, `notification-primitive.md`), the spec (`TRACK-AF.md` → AF8 + AF10 cost contract), `approved.md`, and verified the Plan reconciliation table against the actual code (grep/read of `dispatcher.ts`, `silence-policy.ts`, `cost-sentinel.ts`, `cost-cap.ts`, `policy-engine.ts`, `dependency-watcher.ts`, `events.ts`, `schema.ts`, `router.tsx`, `notifications-routes.ts`).

ARCHITECTURE-SCORE: 7/10  rounds=0  score-line: SA:8 LI:9 AC:8 DM:8 N:8 MD:8 FMC:5 S:8 V:8

**Verdict: NEEDS-REVISION.** Overall 7.4 but there is **one CRITICAL** (concept hard-rule violation the plan does not flag). Fix the CRITICAL and the plan ships. Everything else is WARNING/NIT and well-handled. The plan is otherwise strong: the reconciliation table is honest (every claim I spot-checked against code is true), design-it-twice is real (not theatre), and the AF10/AF15 contract seams are well-reasoned.

---

## CRITICAL

- **[§ ACs / AC4 + § Phase 0.4 + concept hard rule #8] The existing `flushQueue` silence logic VIOLATES concept hard rule #8, and the plan reuses it without flagging the divergence.** Hard rule #8: *"a hard cost breach bypasses factory silence but respects quiet hours."* But the actual code (`dispatcher.ts:399`) computes `silenced = isSilenced(db, …, now)` where `isSilenced` (`silence-policy.ts:31-76`) returns `true` for **EITHER** `factory_settings.silence_mode` (factory silence) **OR** the `silence_window_start/end` window (quiet hours) — the two are collapsed into one boolean. The flush loop then does: `if (silenced && severity === "blocking") defer; cost_breach + digest flush through unconditionally`. Consequence: **a `cost_breach` row flushes through even during quiet hours** — exactly the case hard rule #8 forbids. The plan's AC4 says "Reuses existing `flushQueue` silence-aware logic" and Phase 0.4 says the drain "respects silence/quiet-hours," but it never notices that the existing logic bypasses quiet-hours for cost breach. 

  **Fix:** Add a plan task + AC that splits the cost-breach exception: cost-breach (`cost_alert` immediate) bypasses *factory silence* (`silence_mode` / per-product) but is **held during the quiet-hours window** (`silence_window`). This requires `isSilenced` (or the flush gate) to distinguish "factory-silenced" from "in quiet-hours window" rather than returning one merged boolean — today they cannot be told apart at the call site. Add an integration AC: *quiet-hours window active + a cost_breach row → drain defers it; factory silence_mode=true (window clear) + a cost_breach row → drain delivers it.* Without this, AF8 ships a delivery path that contradicts its own locked concept, and the violation is invisible because the existing test (`dispatcher.integration.test.ts`, listed protected) likely asserts the current (wrong-per-concept) behavior — so green ≠ correct. Flag whether the protected test encodes the now-superseded rule.

---

## WARNING

- **[§ Design-it-twice A / § Phase 0.2 — AF10 collision risk] The `recordFactoryCost` write at the tail of `recordCostAndCheck` is sound on the value definition but the plan under-weights the double-write / merge-order hazard.** Verified: `users.costActual` is the authoritative per-agent running total (`cost-cap.ts:239` increments it), so `SUM(users.cost_actual)` is the correct factory aggregate, and `cost-sentinel.ts:108` + `routine-scheduler.ts:188` both read `factory_settings.cost_actual` unchanged — A1 fixes both consumers (Z8-008). Good. **But:** AF10's AC1 says session cost *currently over-counts quadratically* (passes running total as a delta). If AF8 lands first, `recordFactoryCost` will faithfully `SUM` the **inflated** per-user totals — so the cost sentinel fires off a number that is real-but-wrong until AF10 lands. The plan's R2 flag covers the *call-site preservation* contract but does not state that **the value AF8 surfaces is only correct once AF10 fixes the delta bug**. Add to R2: "until AF10 lands, `cost_actual` reflects the pre-fix (possibly inflated) per-user totals; the sentinel will alert on real-but-inflated spend — acceptable (fails safe toward over-alerting), but note in the `@lore`." This is a coordination honesty issue, not a blocker.

- **[§ Security & abuse cases — rate-limiting] `PUT /notifications/mute/:key` rate-limit dismissed as "N/A for v1" is too quick given the precedent exists.** The file already has a per-process token bucket (`notifications-routes.ts:111` `@lore`, applied to `POST /test`). The mute write is idempotent and founder-tier, so blast radius is genuinely low — the N/A is defensible — but the plan should state the *positive* reason (idempotent + authenticated founder + no fan-out + no external egress triggered) rather than only "existing `/flush`,`/digest` have no limiter either" (an appeal to an absence, not a justification). NIT-adjacent; tighten the wording. The `:key ∈ NOTIFICATION_TYPES` zod-enum and `:id` UUID validation ARE specified — input-trust boundary is addressed.

- **[§ ACs / AC2 — source link is a real improvement the plan should call out as a fix, not just a column] The old `deepLink` was `/conversations/item/${item.id}` (`dispatcher.ts:178`) — an *item-keyed* route, but the router only has `/conversations/:threadId` (`router.tsx:57`). The old link would 404.** The plan's `sourceLink="/conversations/<threadId>"` (built from `items.threadId`, which exists and is the FK to threads) is correct AND silently fixes a latent routing bug. Verified `items` has `threadId`, `verb`, `riskTier`, `blocking` — everything the listener needs to derive type + urgency + link. Good. WARNING only because the plan presents this as "persist the deepLink" when it is actually "persist a *corrected* link" — make AC2 assert the link is thread-keyed (`/conversations/<threadId>`), not item-keyed, so the builder doesn't copy the old broken shape.

- **[§ Type registry + interfaces — `kind` discriminator] The recommended `kind?: "attention" | "auto_unblock"` field on `NotificationEvent` is the right call and the plan should make it MANDATORY, not "recommended."** Verified the two emitters: policy-engine `push` emits `targetId=itemId, message="Item … requires attention"` (`policy-engine.ts:208-216`); dep-watcher emits `streamId===targetId===taskId, message="… auto-transitioned … all dependencies are done"` (`dependency-watcher.ts:87-93`). The fallback discriminator (message-string match on "auto-transitioned"/"dependencies are done") is brittle — message copy is not a contract and will drift, silently re-classifying auto-unblock as a notification (re-breaking hard rule #6). The `kind` field is a 1-line shared-type change set at both emit sites and tested by AC3. **Fix:** promote it from "recommended" to the required approach; drop the message-matching fallback from the plan (or keep it only as a defense-in-depth secondary). Task 5 already sets `kind` at both sites — make the listener filter on `kind` exclusively.

- **[§ Failure-Mode / states — the popover API GET `/inbox` query] AC10 says "urgency-then-recency sort, cap 50, `readAt IS NULL` rows."** The index added is `nq_inapp_idx ON (readAt, createdAt)` (§ Schema). That index supports the `readAt IS NULL ORDER BY createdAt` filter but NOT the `urgency`-first sort (urgency is a separate column, not in the index, and is sorted in-memory after the query). For 50 rows this is fine; note it so the builder doesn't add a redundant composite index chasing the urgency sort. NIT-level; the cap-50 bounds it.

---

## NIT

- **[§ Schema] 5 nullable columns + 1 index, all back-compat — correct and reversible.** `ALTER TABLE ADD COLUMN` nullable on Postgres is non-blocking; matches the spec's dual-driver concern (these are plain `text` columns, no JSONB/SERIAL dialect trap). `gate: ci-required` is justified (migration + `db:migrate` + shared `schema.ts`/`events.ts`/`bootstrap.ts`). Agreed.
- **[§ Out-of-scope] Clean.** No scheduler (AF6), no AF10 cost-fix, no retention/TTL (AF16), no history/test-send UI. The `recordFactoryCost` helper is the *minimum* AF10 touch and is explicitly bounded. No creep.
- **[§ Mute interface] `MutePreferenceReader.isTypeMuted(typeKey)` → AF15 gains `userId`.** The seam is clean: AF8 consumes only `isTypeMuted(key)`; AF15 swaps a per-user impl behind the same interface and AF8's drain/listener/popover inject it. The factory-level default (reads `factory_settings.notifications.mute_<key>`, fail-open) is acceptable for single-founder near-term per concept-notes §4. This is the right level of abstraction — one method, not a premature per-user generic. AF15 swaps in without rework. Confirmed sound.
- **[§ Protected tests] Populated and correct:** egress `dispatcher.integration.test.ts`, `R8-signal-to-noise`, `routine-digest`, DS `NotificationRow.test.tsx` (popover does NOT use it). One addition needed: see CRITICAL — verify `dispatcher.integration.test.ts` does not encode the now-superseded cost-breach-bypasses-quiet-hours behavior; if it does, that test must change (and that change must be conscious, not silent).

---

## Hard-check results (the prompt's explicit checklist)

| Check | Result |
|---|---|
| Policy respected (drain honors silence/quiet-hours; cost-breach bypasses factory silence but respects quiet hours) | **FAIL → CRITICAL.** Existing `flushQueue` flushes cost_breach through quiet hours; plan reuses it unflagged. |
| Source link persisted, not reconstructed at render | PASS. `sourceLink` column, persisted at enqueue; popover reads column + `navigate()`, no route-building. AC7 covers both halves. |
| Event listener consumes `notification`, filters auto-unblock as ambient (hard rule #6); `kind` discriminator assessed | PASS (with WARNING). `kind` field is the right discriminator; make it mandatory, drop message-matching. AC3 proves the filter. |
| Cost signal reads a value the system writes; AF10 coordination sound, collision risk | PASS (with WARNING). `SUM(users.cost_actual)` is correct; both readers fixed; value is real-but-possibly-inflated until AF10's delta fix — note it. |
| Lease recovery automatic, not manual flush | PASS. `flushQueue` calls `recoverStuckLeases` at its top (`dispatcher.ts:385`); the drain interval invokes `flushQueue` → recovery is automatic. AC5 drives it via the scheduled tick. No new recovery code. |
| Mute enforcement — muted type yields no popover entry + no egress; AF15 seam clean | PASS. Listener honors `isTypeMuted` before enqueue (no row → no popover, no egress). Interface is the clean AF15 swap point. |
| Schema migration delta correct + reversible; `ci-required` justified | PASS. |
| AC coverage — every AC maps to a task + verification method | PASS (11/11 ACs mapped to integration/component/unit). Add the quiet-hours-cost-breach AC from the CRITICAL. |
| Out-of-scope respected (no scheduler/AF10-fix/retention/history-UI creep) | PASS. |

---

## What's Working Well

- **The reconciliation table is honest.** Every spec⇆reality claim I grep-verified is true: zero `notification` listeners, `deepLink` built-but-never-inserted, `cost_actual` has zero writers (only 2 readers), `flushQueue` exists without a timer, `severity` drives egress. This is exactly what the reconciliation section is for, and it didn't fabricate (no CC-007 drift).
- **Design-it-twice is real, not theatre.** Section A (factory cost: derived-write vs sentinel-computes-sum) has a genuine second option with a non-strawman reject reason (A2 leaves `routine-scheduler.ts:188` silently broken — verified that second reader exists). Section B (new columns vs overload severity) likewise. Both chosen options trace to a hard rule.
- **The AF10 and AF15 contract flags are the right altitude.** AF8 ships the minimum seam (one helper for AF10, one read/write interface for AF15) and documents the merge-order and signature-evolution contracts without building AF10/AF15's work. This is disciplined coordination, not scope creep.
