# L7 — Brief

## Scope (interrogated)

L7 is a **backend story**. The acceptance criteria split:

- 5/7 criteria are server-side (persistence, harness event, tests, fixture replacement, green CI).
- 2/7 criteria touch UI: (a) the response must not be recorded locally as committed when the server didn't accept it, and (b) network failures surface a clear error.

The story spec line 253 explicitly says: *"the designer picks any optional UI affordances around responding"*. The plan-call carves the UI surface down to the response-commit affordance.

## What changes for the user

Today, the user clicks a verdict button or sends a composer message and the change appears in the thread (or it silently does nothing — the no-op being closed by L7). After L7, the same click round-trips to the server.

The user's task is **unchanged**: pick a verdict / type a reply. L7 only changes the *failure modes* around that task. So the design surface is:

1. **In-flight feedback** — between click and server ack, the user must know the system received their input and is working.
2. **Failure feedback** — on rejection, the user must know it didn't commit and what to do.
3. **Sync vs async** — the spec separates sync (unblocks now) from async (recorded for next pickup). The UI may or may not signal this.

## Anti-scope

- **Not** redesigning the thread page. ThreadShell, ReviewVerdictBar, Composer, ThreadHostBanner are locked.
- **Not** designing undo / auto-advance.
- **Not** adding a new component. The component budget is closed; we extend existing ones via props.
- **Not** optimistic-UI bragging (story constraint line 261).

## Decision tree (resolved)

| Question | Answer |
|---|---|
| Who and what decision? | Reviewer responding to a thread. The decision is the verdict (or the reply content). L7 doesn't change the decision shape. |
| Smallest UI surface? | Pending + error states on `ReviewVerdictBar` and `Composer`. That is it. |
| Primary state in real use? | Populated thread, single-click verdict commit, server returns 200 in <500ms. |
| New primitive vs extension? | Extension. `disabled` already exists on `ReviewVerdictBar`; we add a `pending` flag and an inline error region. |
| Overflow / truncation? | Error message must fit one row in the verdict bar at desktop width; truncates with title= attr on overflow. |
| Existing component fit? | `ReviewVerdictBar` (props), `Composer` (props), `Toast` (DaisyUI) for transient ack of async-recorded responses. |
| Sync vs async signal? | Sync = the head verdict bar disappears (the head resolves). Async = inline ack in the bar; no transient toast. The user already gets the strongest possible signal — the bar going away — when the response unblocks the agent now. |

## Conclusion

The design space is genuinely trivial: a pending state on existing buttons + an inline error region above the verdict bar / inside the composer. Anti-convergence would force three flavors of "where the spinner goes," which would be theatre, not design.

Skipping the three-variant generation. Producing a single approved spec.
