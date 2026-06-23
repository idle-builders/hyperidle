# AL7 — Review execution loop · Retro

Fresh-context observation reconstructed from the commit arc, progress file, and shipped docs.

Commit arc: concept (`193c2d56`) → design+arch (`9ec415f4`) → critique r1 revision (`d599ccda`) → critique committed (`2e027174`) → red (`33e88ebd`/`67963ef0`) → green (`0f6d6502`) → review fixes r1 (`d36f25a2`) → review fixes r2 (`6cf8c879`) → docs (`30d8d757`).

## Cost signals
- **L workpackage.** First builder session completed the full green phase then died on a 529 *while composing its return message* — work was committed and pushed, so the resume cost was near-zero (assess tree → continue). The harness-level resume protocol (commit at task boundaries) paid off exactly as designed.
- **Rework concentrated at the code-review gate, not red-phase redesign.** Two NOT-DONE review rounds (3 CRITICALs then 1 CRITICAL). The architecture-critique compressed the single hardest discovery into the *plan* phase at zero code cost.
- **Total review rounds: 2 critique + 3 code-review.** The 3rd code-review round was cheap (confirm-only) — the expensive rounds were r1 (3 CRITICALs) and the honest-narrowing of CRITICAL-3.

## What the producer/evaluator split caught (the strongest evidence the gates earned their cost)
1. **Architecture-critique caught the load-bearing correctness bug BEFORE code (O1).** The r0 plan bound at-most-once dispatch to the bet *host-thread*, but one bet thread is reused across many reviews — so approving review B would have fired review A's still-pending op, breaking two ACs. The critique (5/10, demand-revision) caught it via ground-truth seam analysis (`threads.ts:1288-1298` per-message resolution; `submit-review.ts` one-thread-per-bet) and demanded per-`reviewMessageId` keying. Fixed at design time. **A post-green discovery would have been a full dispatcher redesign.**
2. **Code-review caught 3 CRITICALs the green-phase tests passed over (O2):** (a) the `github:merge-pr` real tool path didn't exist — only the fixture, with doc comments describing unwritten code; (b) the loader emitted a shape the canvas couldn't consume, so the outcome never rendered on the real surface, plus `FIXTURE_REVIEW` was deleted (regressing the page to unrenderable); (c) stage-time capability validation was a hardcoded allowlist misrepresented as the per-agent capability descriptor.

## Recurring failure mode (third occurrence — compounding candidate)
**Green-phase tests pass while the feature is broken** because the red phase tested the *mechanism* but not the *surface breadth*:
- multi-review isolation never exercised (single-op fixtures);
- loader shape asserted only at the JSON boundary, not through the real `ReviewComposition`;
- capability test mislabeled (asserted "kernel can't dispatch" while titled "agent doesn't hold").
Plus comments describing unwritten code (the github path). Pattern seen across AA2 (temporal ordering), W2 (multi-session routing), AL7 (multi-review isolation) — all missed breadth-testing in red.

## Honesty signal
CRITICAL-3 was **initially misrepresented** — the allowlist was documented as the per-agent capability descriptor and the test was mislabeled. The round-1 review note required a surfaced scope-cut and the builder skipped it (the progress notes covered only the live-proof gap). The narrowing itself was correct scope (per-agent provisioning is genuinely AL8/AM2, surfaces that don't exist yet) — the defect was the silent misrepresentation. Resolved in r2 by renaming (`KERNEL_DISPATCHABLE_CAPABILITIES`), correcting comments/test, and recording the deferral honestly in code + progress + plan. **Lesson: a narrowing is only legitimate when surfaced; honest-deferral discipline must be a builder reflex, not a reviewer catch.**

## Honest deferrals shipped (recorded, not hidden)
- **Live tool proof:** the loop is end-to-end proven via the `fixture:staged-op` path against a real DB; the `github:merge-pr` forge boundary is contract-tested (fetch-stub) because a live merge is infeasible here (no `GITHUB_TOKEN`; protected main has no throwaway merge target; rulesets must not be touched).
- **Per-agent capability provisioning** → AL8 (tool grant / trust tier) + AM2 (harness capability descriptor, marked OPEN). AL7 enforces the kernel-held-verb gate only.

## Final assessment
Shipped at architecture 8/10, design 9/10, all ACs covered or honestly narrowed-and-deferred, no false green. The architecture-critique is the cleanest win of the run. The code-review cost is the predictable price of red-phase mechanism-only testing — the compounding fix is breadth-first red-phase test design.
