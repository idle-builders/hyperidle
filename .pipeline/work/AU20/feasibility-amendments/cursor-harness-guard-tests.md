# AU20 feasibility amendment — Cursor harness guard tests

Targeted Vitest reproducibly reports 2 failed files and 11 failed / 60 passed tests.
All failures are coverage-first: production guard correctly identifies
`cursor-agent` missing from four-family test fixtures, masking three later AR7
assertions behind the earlier coverage violation.

The registry, real harness fixtures, discovery, adapter, and integration lanes already
include Cursor. No guard change is required.

**Verdict: GO.** Align the two unit-test fixture matrices and expectations with the
existing five-family source of truth.
