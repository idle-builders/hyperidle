# AU31 — Rescope verification (post-founder-ruling simplification pass)

Reviewer, read-only. Target: `49ae6bcf` vs parent `872babc8`, worktree `.worktrees/AU31`,
branch `backend/AU31-layer-composition-boundary`. Scope: exactly three questions. The R2
completeness/bypass line of inquiry is out of scope by founder ruling and was not pursued.

**Verdict: Q1 PASS · Q2 PASS · Q3 PASS. 0 blocking. Proceed to build.**

---

## Q1 — Did the reduction cost real-code bite? **PASS**

Executed the committed prototype myself (`probes/p12-r2-escape-predicate/r2-escape-prototype.ts.txt`,
218 lines, run via `tsx` from the session scratchpad against the live worktree; no overlay at any
production path).

| Check | Result |
|---|---|
| Founding violation `layers/core-api/src/index.ts:15` | **flags** — `VIOLATION line 15 — (re-export) (from @hyperidle/knowledge)`, exit 1 |
| Type-only export on the line above (`:14`) | **clean** — not reported |
| 11 attack spellings (A1–A11) | **all flag, exactly once each**, 11 findings, exit 1 |
| 6 controls (C1–C6) | **CLEAN**, exit 0 |
| 3 legal end-state sites (`app.ts`, `service-bootstrap.ts`, `services/tool-handlers-bindings.ts`) | **CLEAN**, exit 0 — no false positive |
| Deep-entry barrels (`routines.ts:20`, `session.ts:9`, `agent-execution/src/index.ts:15`) | **all flag** |
| 3 exported deps bags (`policy-bindings.ts`, `routine-scheduler-bindings.ts`, `task-run-resolver-bindings.ts`) | **all flag** (11 findings total), plus `tool-provider-bindings.ts` (2) |

**The decisive check — reduction cost zero bite.** I swept all 83 production modules of the three
layer root packages (`layers/core-api/src`, `layers/agent-orchestration/src`,
`layers/agent-execution/src`, `__*` excluded) with the reduced rule and compared against the
deleted fail-closed model's own sweep. Identical: **83 files, 75 clean, 17 findings, confined to
the same 8 files**. Every violation that exists in this repo today is still caught, and the
narrower rule introduced no new false positive.

**Evidence integrity.** The committed `outputs.txt` reproduces byte-for-byte against my
independent execution on all four runs — same line numbers, binding names, specifiers, context
strings, and exit codes. The recorded evidence is real, not narrated.

## Q2 — Was anything confirmed-sound disturbed? **PASS**

Range-diffed the artifact section by section rather than trusting the hunk map.

- **§1–§6 byte-identical** (old 34–552 vs new 34–552: `diff` → no output). The six per-service
  verdicts, the seam contract decisions, §3.1's atomicity audit, §4's spelling law + 93-site
  frame, §5's per-file composition map, §6's `agent-execution` face + MCP decision: untouched.
- **§8–§12 identical except the one in-scope gate note.** Only change in the range is §12's
  "Human gate" paragraph (now: held, founder ruled). AU29 `db:util` / `framework → layer [di]`
  rulings, §9 security, §10's AC map incl. the 14 DI sites, §11's end-to-end evidence run,
  §12's wave split and leaves: untouched.
- **§13 items 2–8 and §14 byte-identical** (diff from `AgentOrchestrationPort gains a write side`
  to EOF → no output). Both supersessions, the atomicity item, the split item, the AU29 handoffs,
  and the false-documentation list are unchanged.
- Changed surface is exactly the sanctioned set: header, §7.1's export-map line, §7.2 (R2), §7.3,
  §12's gate note, §13's preamble + §13.1, feasibility header + P12, and the probe set.
- `git diff --name-only origin/main...HEAD` outside `.pipeline/` → **nothing**. No production file
  is touched by this branch at all.

## Q3 — Still coherent and buildable? **PASS**

- **No dangling references.** The deleted fixtures (`fixture-self-attack`, `fixture-residuals`,
  `fixture-founding-respelling`) and the deleted mechanisms (E/N/F grammars, fail-closed carrier
  model, loud statement-kind guard, seven-run ceremony) appear only in the header's and P12's
  explicit "what was deleted" narration — never as a live citation. No surviving section, wave,
  or AC cites a mechanism that no longer exists. All `probes/…` paths resolve, except
  `probes/e2e-run.md`, which §11 prescribes as a build-time output, not an existing input.
- **Every one of the 93 sites keeps a named mechanism and a named leaf.** The inventory
  (`requirements.md` §5.1, 15 groups: 36+15+12+9+7+2+2+2+2+6×1 = 93) maps through §2/§5/§6 for
  mechanism and §12's A1–A3 / B1–B4 for leaf; §10's AC map states the mapping per AC. All of that
  is byte-identical to the pre-pass artifact, so no site could have lost either. The single
  `application → db:util` site remains explicitly assigned to AU29 with AU31 keeping it
  byte-identical (§8) — pre-existing, ruled, unchanged.
- **All five founder rulings recorded as decided** in §13's preamble (and mirrored in
  `progress.json.founderRulings`): (1) R2 narrowed; (2) both supersessions ratified with no extra
  scaffolding; (3) atomicity relinquishment accepted with **no** outbox or other durable
  mechanism, explicitly rejected; (4) two-WP split accepted, waves A then B, sequential; (5)
  `application → layer [import]` narrowing to face-shaped imports ratified. `approvals.concept`
  flipped from `null` to ruled; the R2 scope question is marked `RULED … scope down`.
- **Counts self-consistent.** §7.2, §13.1, P12 and the fixtures all say eleven attacks / six
  controls; I executed exactly 11 findings and 6 clean controls.
- **The boundary's enforcement is not softened.** §1's hard constraints stand verbatim and
  unchanged: zero exceptions, no allowlist, no stateless-provider carve-out, no named-method
  exemption, no transitional facade, no temporary cross-layer import, no "phase 1", no deferred
  promotion step, shrink-only baseline. The two `allowlist` mentions in the new §7 text both
  *ban* one. The founder narrowed R2's ambition only; cross-layer imports, DI, and manifest deps
  remain absolutely forbidden, and that is what the 93 sites are.
- **No WP identifier leakage.** Prescribed rule ids are `layer-exports-resolve-inside-the-layer`,
  `service-values-do-not-escape-the-face`, `deep-imports-die-with-their-entries`. Zero `AU\d+`
  matches across all five `governance/*.json` files; no `detail` string or filename under
  `governance/` names a work package; §13.1 carries the hygiene clause explicitly. (Pre-existing
  `AU28`/`AU21` mentions under `scripts/` are `@lore`/header prose on `main`, untouched here.)

## Non-blocking note (1, cosmetic)

`feasibility.md` P12 states "Four runs" and its Result table carries rows for runs 1, 1, 2, 3;
run 4 is described in prose below the Verdict rather than as a table row. `outputs.txt` has all
four. Presentation only — no claim is unsupported.

## Recommendation

**Proceed to build.** The simplification removed apparatus without removing bite, disturbed
nothing the five prior rounds confirmed sound, and the artifact is internally consistent with
every founder ruling recorded as decided.
