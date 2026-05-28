# S1 Architecture — Approved

**Status:** Locked for implementation
**Score:** 8.3/10 (PASS)
**Critique:** `plans/S1/architecture-critique.md`
**Date:** 2026-05-29

## Summary

The S1 architecture plan is approved. It covers all acceptance criteria from TRACK-S.md, follows existing codebase conventions, and makes sound technical decisions.

## Contracts locked for Phase 4 review

The following contracts from the plan are now binding. Phase 4 code review will verify implementation against these:

1. **Schema:** `loginSessions` and `inviteCodes` tables match section 1.1 and 1.2 exactly (text PKs, text timestamps, FK references with stated `onDelete` policies).
2. **Token mechanics:** 256-bit random, SHA-256 hash stored, plaintext returned once, never stored, never logged.
3. **Middleware:** Dual-strategy in shared mode (Bearer first, X-API-Key fallback). Local mode unchanged.
4. **Routes:** `POST /api/auth/invite` (admin-only), `POST /api/auth/claim` (public, pre-auth), `POST /api/auth/logout` (LoginSession auth), `GET /api/auth/me` (unchanged), `POST /api/auth/ws-token` (updated identity source in shared mode).
5. **File inventory:** New and modified files per section 8.
6. **Immutable contracts:** Per section 9 — HarnessAdapter untouched, admin key survives, local mode unchanged, plaintext never stored/logged, constant-time comparison.

## SHOULD FIX items for builder attention

- SF-1: Remove `verifyTokenHash` or clarify its role in the validation flow.
- SF-3: Do not create `AUTH_ERROR_CODES` in `auth.ts` — add error codes only to `API_ERROR_CODES`.
- SF-4: Clarify rate-limiting posture for the public claim endpoint relative to `skipPaths`.
