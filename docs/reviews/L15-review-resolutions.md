# L15 — Review resolutions (steps 10-13 → 14)

Snapshot of how each MUST/SHOULD finding from the four parallel reviews was handled.

## Architecture review

| ID    | Verdict   | Notes                                                                                                                 |
| ----- | --------- | --------------------------------------------------------------------------------------------------------------------- |
| MF-1  | FIXED     | `clientKey` hoisted to a `useRef` in `TaskRequestPopover.tsx`; rotates only on success or popover close.              |
| SF-1  | FIXED     | `WorkTeam.tsx` no longer casts JSON. New inline `decodeThreadList`; reuses `decodeThreadDetail`.                       |
| SF-3  | FIXED     | `WorkTeamTaskThread` page passes `readOnly` to `ThreadShell`; Composer now hidden. See Security MUST-1.                 |
| SF-2/4/5 | DEFERRED | Surface ergonomics + perf telemetry → follow-ups `kanban-thread-metadata-batched-endpoint`, `kanban-fan-out-perf-budget`. |

## Adversary review

| ID  | Verdict  | Notes                                                                                                                              |
| --- | -------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| M1  | FIXED    | Esc + click-outside + focus-return on popover via document listener (`TaskRequestPopover.tsx`).                                     |
| M2  | FIXED    | Mount-fetch / popover-create race: merge step now preserves `t.threadId` if already set; takes `Math.max` of counts.                |
| M3  | FIXED    | Orphan-thread fallback path: `fetchThreadMetaForTask` returns `{threadId, threadCount: 0}` on detail-fetch failure; covered by added test in `WorkTeam.test.tsx`. |
| M4  | FIXED    | Same as Architecture MF-1.                                                                                                          |
| M5  | FIXED    | Focus-return wired through `close()`. Unmount-mid-flight: AbortController torn down on cleanup (no setState after abort).            |
| S1  | DEFERRED | 800 ms p95 fan-out vitest assertion → follow-up `kanban-fan-out-perf-budget` (would need a perf-harness fixture, not unit-test).    |
| S3/S4 | FIXED  | Same `as`-cast removal as Architecture SF-1.                                                                                        |
| Other SHOULD/NICE | DEFERRED | Surface in retro / follow-ups.                                                                                          |

## Security review

| ID     | Verdict     | Notes                                                                                                                                                                                                                                       |
| ------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MUST-1 | FIXED       | New `readOnly` prop on `ThreadShell`; `WorkTeamTaskThread` enables it. Composer no longer rendered, so user-typed text cannot be silently swallowed.                                                                                          |
| MUST-2 | FIXED       | `decodeThreadDetail` mirrors server `messageRowSchema`: per-message validation of `id / threadId / senderId / type / payload`, plus tombstone field shape checks. Throws `ThreadDetailDecodeError` with index on bad rows.                    |
| MUST-3 | DEFERRED    | Server `POST /api/threads` does not yet enforce a tasks-FK on `hostKind:'task'`. There is no `tasks` table to FK to (L15 still uses `INITIAL_TASKS` fixture). Tracked as inherited L1 risk → follow-ups `team-scoped-tasks-and-agent-membership` + `thread-host-existence-check`. |
| SHOULD-1 | DEFERRED  | `X-Identity` unsigned (inherited L1) → follow-up `signed-identity-header`.                                                                                                                                                                    |
| SHOULD-2 | FIXED     | Same `as`-cast removal as Arch SF-1.                                                                                                                                                                                                          |
| NTH-4    | DEFERRED  | `@<actor> requested:` parser-channel agent-spec call-out → follow-up `agent-side-request-parser-spec`.                                                                                                                                         |

## Design review

| ID    | Verdict | Notes                                                                                                                                                                              |
| ----- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MF-1  | FIXED   | `TaskCard.tsx` divider `mt`/`pt` now literal `4px` (sub-grid) instead of `var(--density-gap)`.                                                                                       |
| MF-2  | FIXED   | Footer divider DIV omitted entirely when `actions === undefined`. `Kanban.renderTask` returns `undefined` for actions when both Request and Thread chip would be absent.            |
| MF-3  | FIXED   | Same as Adversary M1.                                                                                                                                                              |
| MF-4  | FIXED   | `Kanban.stories.tsx` no longer wraps stories in `<MemoryRouter>`; thread chip is a plain `<a href>`.                                                                                |
| MF-5  | FIXED   | `Kanban.stories.tsx` fixtures expanded with `threadId`, `threadCount > 0`, `threadUnread > 0` so all design-review states render in storybook.                                       |
| Other SHOULD/NICE | DEFERRED | Surface in retro.                                                                                                                                                       |

## Follow-ups appended

`docs/work-packages/follow-ups.md` carries:
- `thread-host-existence-check` (Security MUST-3 deferred)
- `signed-identity-header` (Security SHOULD-1)
- `agent-side-request-parser-spec` (Security NTH-4)
- `kanban-fan-out-perf-budget` (Adversary S1)
- `team-scoped-tasks-and-agent-membership` (already exists from RED phase)

## Verification

- `bun run check` — to be run as step 15b.
- `bun run lint` — to be run as step 15b.
- `bun run test` — to be run as step 15b. Pre-existing baseline failure on `runner-otel.test.ts` is unrelated (confirmed twice across the pipeline).
