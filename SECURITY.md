# HyperIdle Security Notes

This document captures known security limitations and trust-boundary
notes that operators must understand when running HyperIdle.

## Trust Model — Known Limitation: X-Actor-Id is Asserted, Not Authenticated (L2)

**Status:** Known limitation. Tracked for E-track per-key actor binding.

The `X-Actor-Id` request header is fully client-controlled. Any caller
in possession of `HYPERIDLE_API_KEY` can pose as `actor:ceo` on one
request and `actor:cpo` on the next, simply by toggling the header.

### Implications

- **Spoofing:** Either founder is impersonable by the other, by any
  operator, or by anyone who exfiltrates the API key.
- **Repudiation:** `thread_routing_audit.changed_by` and
  `responses.approver_id` (server-derived from `X-Actor-Id`) record an
  identity the system cannot prove. The audit trail asserts the
  *claimed* actor, not the *authenticated* actor.
- **Authorization bypass:** The L2 founder-conflict check is driven
  entirely by `X-Actor-Id`; a single attacker can record verdicts as
  both founders to drive any item to whichever decision they want
  (subject to the per-thread conflict gate).

### Current mitigations (L2)

- `body.approverId` from the wire is rejected when it matches any
  registered actor row. Only programmatic approvers (e.g.
  `policy_engine`) may write through that field.
- The conflict gate runs in a `BEGIN IMMEDIATE` transaction so two
  concurrent founder verdicts on the same thread are serialised.
- `HYPERIDLE_DEFAULT_ACTOR_ID` is validated at boot; an invalid value
  produces a startup warning rather than silently misattributing every
  request.

### Pending (E-track)

- Bind each API key to exactly one actor. Reject requests whose
  `X-Actor-Id` does not match the bound actor for the key.
- The current abstraction (route handlers read `c.get("actorId")` only)
  makes this swap mechanical — no route code changes once the
  middleware enforces the binding.

### Operator guidance

- Single-tenant single-operator deployments: the limitation is
  tolerable today.
- Multi-operator deployments: do **not** distribute the master API
  key. Wait for E-track binding, or front HyperIdle behind a reverse
  proxy that strips `X-Actor-Id` and re-issues a server-trusted
  variant.

## Audit Append-Only Invariant — Convention, Not Enforcement (WARN-3)

`thread_routing_audit`, `agent_skill_autonomy_audit`, and
`knowledge_edit_log` are logically append-only. Enforcement is via
`@lore` comments + a static-source regression test that greps for
`db.update(<table>)` / `db.delete(<table>)` in server code.

There is no DB trigger, no privilege separation, and no row-version
invariant. A future migration, careless cleanup script, or
`db.run(sql.raw(...))` could wipe rows. When the deployment topology
includes a hostile-insider model, revisit and add a Postgres
`BEFORE UPDATE OR DELETE` trigger.
