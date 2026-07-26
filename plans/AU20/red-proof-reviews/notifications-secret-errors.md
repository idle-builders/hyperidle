# AU20 F9 notification secret errors — RED proof review

VERDICT: accept

Reviewed base `e68a170757d71476ba147995247ac8be2d4a97e2`.

## Isolation

- Authored runtime test only: `packages/core-api/notifications/src/__tests__/install.test.ts`.
- Authored proof only: `.pipeline/work/AU20/red-proofs/notifications-secret-errors.json`.
- Original frozen product SHA-256: `0383969cc297053d157bb2d2b08277ae9e9fe8668c6b519e9973a18be04428ac`.
- Existing implementation candidate SHA-256: `ab20be1c9551852bbaa4d03445ad056534e9b847c84be250557e8ac80c420b9a`; this re-review did not modify it.
- Protected integration contract remains unchanged at SHA-256 `cf48978c014fe1863ca096ef7c6522864a761457531b55c8f68c07862d7b21ab`.
- Corrected test SHA-256 matches proof: `42e6a99fbe7fa76fcd1004251d929bffe77b88738dfa9c14d5a8f7226dd92208`.
- Proof SHA-256: `313e03ec67454bba1b271f9a6d6cefbc1ffc2523ed7b32310f2e0f7efe4cdfdf`.
- No census or measurement script changed.

## Contract coverage

| Requirement | Result |
|---|---|
| Suppress only coded `MISSING_ROOT_SECRET`; zero upserts | PASS |
| Arbitrary cipher error rejects; zero upserts; no false-success continuation | PASS on frozen implementation candidate |
| Credential-store upsert failure rejects; no continuation | PASS |
| Successful encryption writes once and returns redacted result | PASS |

The original red failure was causally specific: frozen production caught the arbitrary cipher error and `updateConfig` resolved. Corrections changed only the semantic suite title, completed the server-config fixture, and corrected mock typing/shape. Assertions remain unchanged.

## Reproduction

- Focused on existing candidate: `cd packages/core-api/notifications && npx vitest run --config vitest.config.ts src/__tests__/install.test.ts` → exit 0; 4 passed.
- Notifications package typecheck → exit 0.
- Protected: `npx vitest run --config vitest.integration.config.ts --project service packages/core-api/src/__tests__/notifications/notifications-completeness.integration.test.ts` → exit 0; 20 passed.
- Repository check → exit 0; all 37 packages.
- Repository lint → exit 0.
- Repository unit tests → exit 0; 356 files, 3561 tests.
- Test naming guard → exit 0.
- Corrective-map validator → exit 0; 604 identities, 181 diagnosed former unknowns, 0 unresolved.
- Surface census → exit 0; 23 services, 231 methods, 181 types, total 412.

RED proof re-review accepted independently of implementation review.
