# Accepted Survivors

Rows that were convicted by the AU20 audit but cannot be removed without violating an enforced
architectural boundary. Each entry records the row, the boundary, and what would need to change
for a future deletion to succeed.

---

- `BakedWorkIntentRequest` — deleting the local mirror forces session-requests to import @hyperidle/work-intent-port, whose enforced audience excludes it. The duplication is real but the fix is a boundary change, not a deletion.

- `BakedContextKnowledgeItem` — local mirror of the same type in @hyperidle/work-intent-port; same boundary constraint as BakedWorkIntentRequest above. Cannot be deleted independently (BakedContextBundle references it).

- `BakedContextBundle` — local mirror of the same type in @hyperidle/work-intent-port; same boundary constraint as BakedWorkIntentRequest above. Used internally by BakedWorkIntentRequest.

- `triggerResolutionHistory` — table row (bundle-01, row 45). Table deletion is stage 3 only, after every reader and writer is gone. The type aliases `TriggerResolutionHistoryRow` and `NewTriggerResolutionHistoryRow` were deleted in this bundle; the table itself waits for the stage-3 pass.

- `filesystemCaptures` — table row (bundle-01, row 46). Table deletion is stage 3 only. The type aliases `FilesystemCaptureRow` and `NewFilesystemCaptureRow` were deleted in this bundle; the table and its INSERT site in mounter-registry wait for the stage-3 pass.

- `extractBuiltinKind` — bundle-05, routine row 15. Cannot delete: `fireBuiltinRoutine` (PLUGIN, BA9) calls it directly (`const kind = extractBuiltinKind(routineId)`). Deletes when BA9 removes `fireBuiltinRoutine`.

- `BuiltinRoutineId` — bundle-05, routine row 16. Cannot delete: return type of `extractBuiltinKind` (survivor above). Deletes with `extractBuiltinKind`.

- `RunBuiltinResult` — bundle-05, routine row 17. Cannot delete: return type of `fireBuiltinRoutine` (PLUGIN, BA9). Deletes when BA9 removes `fireBuiltinRoutine`.

---

## AU44 Batch 0 additions (AU43 close-out, 2026-08-19)

### KEEP-restored routes — added during AU43 but never recorded here

The AU43 delete pass restored these symbols while marked KEEP in the audit. They are intentionally
present and were never added to this list as required.

- `listOrgEdges` — restored with org chart feature during AU43. Intentional survivor.
- `deleteOrgEdge` — restored with org chart feature during AU43. Intentional survivor.
- `upsertOrgEdge` — restored with org chart feature during AU43. Intentional survivor.
- `UpsertOrgEdgeInput` — restored with org chart feature during AU43. Intentional survivor.
- `ActiveTeamMembersWithTeamName` — restored with org chart feature during AU43. Intentional survivor.
- `listDismissedHints` — restored with hints feature during AU43. Intentional survivor.
- `dismissHint` — restored with hints feature during AU43. Intentional survivor.
- `DismissedHint` — restored with hints feature during AU43. Intentional survivor.
- `listConfiguration` — restored with filesystems settings page during AU43. Intentional survivor.
- `writeConfigurationOverride` — restored with filesystems settings page during AU43. Intentional survivor.

### Auth substrate — boundary belongs to the auth work package

The A7 ruling changed standing for the invite/session substrate. The shared backend needs the session
half; the invite half remains convicted but splitting it is the auth work package's call.

- `createInvite` — convicted by AU20; A7 ruling defers to auth work package. Deletes when auth WP removes invite-based login.
- `claimInvite` — same as `createInvite` above.
- `createLoginSession` — convicted by AU20; session substrate the shared backend requires. Deletes with auth WP login-session removal.
- `validateBearerToken` — convicted by AU20; used by auth middleware on every request. Deletes with auth WP.
- `revokeLoginSession` — convicted by AU20; session substrate needed by shared backend. Deletes with auth WP.
- `InviteRole` — type parameter of `createInvite`; deletes with it.
- `INVITE_ROLES` — runtime guard inside `createInvite`; deletes with it.
- `LOGIN_SESSION_TTL_MS` — constant used by `createLoginSession`; deletes with auth WP session removal.
- `INVITE_CODE_TTL_MS` — constant used by `createInvite`; deletes with invite removal.
- `NewLoginSession` — inferred insert type for the login_sessions table; deletes with auth WP.
- `NewInviteCode` — inferred insert type for the invite_codes table; deletes with invite removal.

### PostBetRetroArgs — blocked by PLUGIN neighbours

- `PostBetRetroArgs` — input type for `postBetRetro`. Its direct callers `fireBuiltinRoutine` and `registerBuiltinRoutineHandlers` are PLUGIN rows (BA9). Deletes when BA9 removes those two.

---

## Coverage lost, worth re-establishing

Not survivors — these are gaps the pass created and did not fill.

- **Review participant routing** (`AD1-session-review-routing.integration.test.ts`, deleted). It covered
  adding human reviewers to a thread's participants via team edges, deduplicating and sorting them.
  The risk-tier review creation it was built around is correctly gone, but participant routing itself
  **survives** — the org re-audit kept `resolveReviewRecipients`, rescoped to the agent's team. That
  behaviour now has no integration coverage. Whoever finishes the approve-then-act loop should
  re-establish it against the surviving producer.
- **Session-review unsubscribe** (`session-review-creator.integration.test.ts`, deleted). Five of its
  six tests covered the risk-tier gate and died correctly with it. The sixth asserted that the
  subscriber returns a working unsubscribe function; the liveness subscriber it now guards is live and
  is part of the approval loop being finished.

- **`POST /api/harnesses/redetect` now has no throttle.** Not a survivor and not a coverage gap — a
  security posture change worth stating on its own. That route spawns roughly ten CLI probes, each
  with a fifteen-second timeout, and carried a dedicated one-call-per-five-seconds limiter for exactly
  that reason. The limiter died with the rest of the rate-limiting middleware, which was convicted
  fairly: it ran pre-auth, was principal-blind, and behind a proxy collapsed a whole team into one
  bucket. But the two uses were different in kind — the global limiter was a wall built first, this
  one guarded a real amplification path in the product's own design. If redetect ever becomes a
  problem, that is the learning that earns a narrow guard back, and it should be scoped to the route
  rather than reinstated globally.

- **Harness capability flags: deleted, and the UI regression they caused is fixed differently.**
  The audit found the runtime flags were "never branched on at runtime" — true of the backend, and
  wrong overall. Their one reader was `provenCapabilities`, behind `hasCaps`, which decided whether a
  harness row opens. Deleting them stubbed that function to return nothing, so a CLI harness declaring
  no models stopped being clickable and its login command — the one thing a user needs to authenticate
  it — became unreachable. Two component tests caught it.

  The flags stay deleted: nothing else read them, and resurrecting a type for one gate is worse than
  fixing the gate. The detail pane now opens when there is a login command to show, which restores the
  behaviour the pass broke rather than the mechanism it removed.

  The lesson generalises past this row. A stub written to keep a build green is a silent behaviour
  change, and this pass produced two of them — the other was caught before merge because it broke a
  type contract instead of a render path. Type checks catch the first kind; only tests and a running
  app catch the second.
