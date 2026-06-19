## Architecture Critique: AM2

ARCHITECTURE-SCORE: 8/10  rounds=1  score-line: SA:9 LI:8 AC:8 DM:8 N:9 MD:8 FMC:8 S:7 V:9

### CRITICAL

- None.

### WARNING

- Resolved in round 1: [plan § Type Contracts] The first draft made `HarnessCapabilities extends HarnessRuntimeCapabilities`, which would have made `fileEditing` and `toolUse` required on every existing adapter and test fixture despite the plan claiming a conservative extension. The plan now keeps existing `HarnessCapabilities` fields required and adds descriptor-specific/runtime extra fields as optional.

### SUGGESTION

- [plan § Server Contracts] Builder should keep descriptor construction deterministic and side-effect free. Any future readiness probe that shells out should be behind a separate discovery service, not inside pure descriptor builders.
- [plan § Event Normalization] Builder should prefer shared normalization for generic `HarnessEvent` validation, but keep CLI terminal `result` cost extraction adapter-local as planned so the event union stays closed.

### What's Working Well

- The plan preserves the existing `/api/harnesses` selector contract while making the response a descriptor superset for AM3/AM4.
- The Kernel/Strategy and access-mode boundaries from the concept are carried through into concrete types, route behavior, and tests.
