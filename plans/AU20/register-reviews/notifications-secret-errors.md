# AU20 F9 notification secret errors — implementation review

VERDICT: accept

## Finding

`packages/core-api/notifications/src/install.ts` SHA-256 `ab20be1c9551852bbaa4d03445ad056534e9b847c84be250557e8ac80c420b9a` implements the narrow contract:

- catches only a non-null object carrying exact code `MISSING_ROOT_SECRET`;
- propagates every other cipher exception unchanged;
- never reaches credential upsert after any cipher exception;
- propagates credential-store upsert failures unchanged;
- preserves successful one-write and redacted-result behavior.

Diff is confined to the private `writeSecret` catch branch: 10 inserted lines, 2 removed lines. No export, type, route, schema, or service-surface change.

## Verification

- Focused notification contract: exit 0; 4/4.
- Protected notification integration: exit 0; 20/20.
- Notifications package typecheck: exit 0.
- Repository check: exit 0; 37/37 packages.
- Repository lint: exit 0.
- Repository unit suite: exit 0; 356 files, 3561 tests.
- Corrective-map validator: exit 0; 604 identities, 181 diagnosed former unknowns, 0 unresolved.
- Test naming guard: exit 0.
- Surface census: 23 services, 231 methods, 181 types, total 412.

No forbidden measurement script changed.
