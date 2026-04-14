---
paths:
  - "**/*.test.ts"
  - "**/*.test.tsx"
  - "**/*.spec.ts"
  - "**/*.spec.tsx"
---

# Testing Rules

- Write tests first (TDD). Every acceptance criterion must have at least one test.
- Target 100% test coverage of all new code — backend and frontend.
- Unit tests: `<name>.test.ts` in `packages/<pkg>/src/__tests__/`.
- Integration tests: `<name>.integration.test.ts` — use `createTestDb()` for database, `createTestApp()` for API.
- E2E tests: Playwright for all user-facing features. Every UI story must have E2E tests proving the feature works through the browser.
- Follow AAA pattern: Arrange, Act, Assert.
- Test all paths: success, error, boundary values, edge cases. Not just happy paths.
- Never mock what you can use `createTestDb()` or `createTestApp()` for.
- Never write tests that only assert `toBeDefined()` or `not.toThrow()`.
- Tests must not depend on execution order.
- Tests are evidence. Every feature must be independently verifiable by an agent running the test suite. If you can't prove it with a test, it's not done.
