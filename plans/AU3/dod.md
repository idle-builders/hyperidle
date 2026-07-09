# AU3 Definition Of Done

- `.pipeline/work-packages/AU3/requirements.md` exists with DOC-CLASS, required reading, guide draft, scope, nouns, and AC verification.
- `.pipeline/plans/AU3.md` exists with reconciliation, AC verification, ordered tasks, contracts, security/abuse, route checklist, migrations, protected tests, shared files, and risks.
- Implementation writes failing runtime tests for behavior ACs before production code.
- AC2 has a failing `AU3-domain-behavior.integration.test.ts` before production moves, covering knowledge projection read/write, routine manual/fire, notification enqueue/list/drain, git export, and protected routes.
- Static dependency/vocabulary ACs are enforced by lint/type/knip/static scripts, not source-reading tests.
- The Fabric Bootstrap Migration Matrix is followed for every current `bootstrapFabric` registration, including disposer behavior and verification.
- Web/shared knowledge taxonomy/status/scope vocabulary is app-owned, with protected component/static checks for web and design-system surfaces.
- Production boot has no Strategy/Fabric registration path.
- Production server/core has no runtime dependency on `@hyperidle/fabric`, `@hyperidle/strategy-minimal`, or `strategy-registry`.
- Static guards ban direct production imports of `knowledgeStrategyFabric` and `taskStrategyFabric` outside schema, migrations, tests, and explicit compatibility modules.
- Existing Fabric-named durable rows remain readable through app-owned services with no data loss.
- `npm run check`, `npm run lint`, `npm run test`, and before ship `npm run verify` pass.
