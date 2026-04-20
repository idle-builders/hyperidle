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
- Design system: every UI component must have a `.stories.tsx` file rendering key states at `/designsystem`. A component without stories is not verifiable in isolation.
- Tests are evidence. Every feature must be independently verifiable by an agent running the test suite. If you can't prove it with a test, it's not done.

## Anti-Rationalization Table

| Excuse | Rebuttal |
|--------|----------|
| "I'll write the tests after the implementation" | Tests written after encode the implementation's bugs as expected behavior. Write the test that describes what SHOULD happen, then make it happen. |
| "This function is too simple to test" | Simple functions have the most surprising edge cases. `isEmpty("")` — is that empty? What about `" "`? What about `null`? |
| "Mocking is faster than createTestDb()" | Mocks test your assumptions about the database. createTestDb() tests the actual database. You got burned before — don't repeat it. |
| "The happy path is enough for now" | The happy path is what the user does 80% of the time. The error path is what creates incidents 100% of the time. |
| "This is just a refactor, tests aren't needed" | Refactors that don't break tests aren't refactors — they're rewrites. If existing tests still pass, you've proven the refactor is safe. If no tests exist, write them first. |
| "E2E tests are slow, I'll skip them" | E2E tests catch what unit tests miss — integration failures, UI state bugs, real user flows. The 30 seconds they add prevent the 3-hour debugging session. |
| "I reviewed the JSX, the UI looks correct" | You looked at code, not pixels. Take a screenshot. The app was a white screen for months while code review said it was fine. |
| "The Playwright tests exist, they'll catch it" | Tests that have never been executed are not tests. Run them. Verify they pass. |
