# BA9d — The rituals become a plugin, and `strategy` is purged

Split from BA9 (2026-08-25, founder decision). Read `.pipeline/work/BA9/plan.md` first — it carries
the founder decisions and the evidence. **Depends on BA9a, BA9b and BA9c**, and BA9's end-to-end
proof lands here.

## Outcome

The rituals *about* the work leave core and return as an installable plugin: an agent and its
routines, carrying prompts, using ordinary machinery. The `strategy` agent category goes, and so
does the built-in routine mechanism. Installing the plugin gives a team working retros and knowledge
upkeep; not installing it leaves a coherent product with no holes. Founder's bar: *"the concept of
strategy is completely purged and the plugins are proven to be working — and to end that means
installing a plugin and seeing the agents work."*

## What travels, what dies, what stays

The test is Ruling 3 — *is this the machinery of working, or a ritual about the work?* — plus this
package's own constraint: **nothing already convicted as broken or dead travels.**

| Candidate | Verdict | Reason |
|---|---|---|
| Five seeded facilitator personas | DROP | All carry `role: "facilitator"`, `communityForRole` falls back to `ops`, and `community` only builds a display name. Not five things. |
| Contradiction detector inside promotion | DROP | Short-circuits on empty `forbids`, and `meta` has one writer no route or tool supplies — it can never run. |
| Portfolio retro | DROP | Its thread lists only an agent and `GET /api/threads` refuses a foreign participant, so no human can open it. |
| Flag-for-review | DROP | The record contradicts itself; the service rows that read the implementation say "dead door end to end". |
| `POST /api/org/team-routines`, builtin routines | DROP | The first only seeds the second, and the second is what is replaced. |
| Automated post-bet retro | TRAVEL (needs BA9c) | Not an ordinary routine until an event-fired routine can learn which bet. |
| Knowledge merge / split | REBUILD | `DEAD` is the caller-trace column; the *verdict* column says `PLUGIN`, and AU44's ledger calls their deletion a scope breach to undo. |

Decay, promotion and the scheduled attention recompute travel too — scheduled ceremony with visible
output. **Staying in core:** practice communities, because `communityForRole` decides which L3
knowledge every session loads (BA9's plan called communities absent from the product; true only of
the facilitator agents); the attention score with its ranking and manual `PATCH`, a weight in every
agent's bundle that would silently degrade context if moved; `POST /:id/recompute-attention`, the
seam behind `score_attention(mode:"recompute")`; and the human bet-retro form. So the plugin ships
one agent and three routines: decay, promotion-with-recompute, and the post-bet retro.

## The per-team trap — read before touching scope

The BA9 plan and the BA track registry both say per-team duplication of global sweeps was fixed at
its cause by BA1's owner-agent change. **That is wrong**, and building on it reintroduces the bug.
What stopped the duplication is an explicit `scope: "team" | "once"` field on the builtin specs,
seeding a `"once"` spec under a bare id so the second team's attempt no-ops under
`onConflictDoNothing`. **Deleting the builtin specs deletes that field**, so whatever seeds the
plugin's routines must decide "one row globally" versus "one per team" itself.

## Acceptance criteria

1. Global upkeep runs **once**, by a mechanism stated rather than inherited.
2. No agent can be created, stored, sent or displayed in a `strategy` category, and none is
   stranded. Rewrite the category and mark the agent inactive rather than deleting — `users.id` is
   referenced with `restrict` from `items.sourceAgentId` and `routines.ownerAgentId`, so a delete
   fails wherever a retro ran; likewise soft-delete `builtin:*` rows, since `routine_runs.routineId`
   is `onDelete: "restrict"`.
3. The scheduler dispatches no hardcoded built-in routine — specs, ids, dispatcher and seed rows
   gone, with `StrategyEvent`, `KernelEvent` and `PostBetRetroArgs`. No normal caller can subscribe
   to every event; the sole wildcard subscriber left is the runtime wake-up hint, a latency shortcut
   over a one-second drain.
4. **The "App-managed" edit lock is deleted, not moved** (D5), replaced by detach-and-restore: it
   was never enforced server-side and its warning was backwards, since the system prompt is
   overwritten on **every** launch for any role with a template.

**Out of scope.** A marketplace or distribution; reworking the knowledge store; whether teams should
hold retros; the five events with no emitter (BA8); `knowledge_app_projection` and its `@lore O2`
columns. **Open for the founder:** do knowledge merge and split come back? The recommendation is to
rebuild them as agent-reachable doors recovered from `3efc6c573^`, dropping flag-for-review.

# As built

**A routine can name a transition, not only an event type** (D8/D11), stored in the existing
`trigger_config` as JSON — no new column, because it is filtered in memory and never needs an index.
A routine naming a transition on an event type that never carries one is **rejected at creation**
rather than silently never firing.

**Decay and promotion keep their deterministic operation.** The sweep is an agent-callable tool
(`run_knowledge_sweep`) the plugin's routines instruct the Librarian to call — the split the plan
drew for attention scoring: the **ritual** (weekly, at 3am) belongs to the plugin, the **operation**
stays in core where it is tested. An earlier version made the routines prompt-only, orphaning the
tested sweep and reducing upkeep to an LLM approximating it. `writeAgentRunConfigIfAbsent` also
makes the run-config and prompt write first-boot only, so edits survive.

**Two mechanisms not to delete by accident.** "Global upkeep runs once" lives in the id hash —
`agentItemId`/`routineItemId` include the install scope, so a factory-scoped install yields one
constant id and a team-scoped one yields one per team; a `@lore` sits where they are derived. And
**the demo world must not seed the rituals**.

**Only the running product found the last two defects.** The first proof run showed seven routines
where there should have been four — the demo world seeded the rituals and the plugin added its own,
and every test passed because each set was individually correct. The re-run then found migration 65
never applying, its journal `when` written in seconds not milliseconds (see BA9a).

## Known limitations

- A brownfield upgrade soft-deletes the old builtin routines, so an existing install **loses
  automated knowledge upkeep until it installs the plugin**. By design, but it belongs in release
  notes.
- `parsePluginAgent` accepts any string as `agentCategory`, so a plugin could declare a value the
  API would reject — deliberate per ETHOS, but the one surface that could reintroduce the purged
  value.
