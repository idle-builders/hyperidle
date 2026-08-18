/**
 * L14 — Bet state machine: actor field in RevisionLogEntry (AC-5, T1).
 *
 * All tests in this file tested the revision log actor field.
 * The revision log write code was removed (write-only ledger, row 5 of bundle-07).
 * The `bets.revisionLog` column is retained for stage 3 (DB cleanup).
 * Tests gutted here; coverage for transitionBet/updateBetField lives in
 * bet-state-machine.integration.test.ts.
 */
