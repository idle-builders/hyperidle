## Architecture Critique: AU9 remediation

ARCHITECTURE-SCORE: 9/10  rounds=3  score-line: SA:9 LI:9 AC:9 DM:9 N:9 MD:8 FMC:9 S:8 V:9

Targeted post-round-3 factual verification: passed.

### CRITICAL

None.

### WARNING

None.

### SUGGESTION

None.

### What's Working Well

- The assistant production proof now exactly follows repository enforcement: `AU9-assistant-handoff-realbinary.integration.test.ts` is builtin-only, its suffix is registered in `BUILTIN_ONLY_INTEGRATION`, it calls only `requireHarness("builtin")`, uses zero stubs, and makes no cursor-agent or CLI-assistant claim.
- Previously closed contracts remain intact: seven atomic family sources including repeatable task dispatch attempts; source-derived authority and stable errors; one request consumption path; crash-safe unique session adoption; token/lease custody; durable termination reasons; agent-published neutral lifecycle facts; core-owned exhaustive projectors; correlation constraints; retention; and production-path verification.

VERDICT: PASS. C0/W0. Architecture is approved for test authoring.
