---
paths:
  - "**/*.test.ts"
  - "**/*.test.tsx"
  - "**/*.spec.ts"
  - "**/*.spec.tsx"
---

# Testing Rules

## What a test is

A test imports application code and asserts on its behavior. That's it.

- Call a function, assert on the return value.
- Render a component, assert on the DOM.
- Send a request via the fixture-injected `app`, assert on the response.
- Write via the fixture-injected `db`, read back, assert on the data.

## What a test is NOT

- Reading source files with `readFileSync` to check for string patterns. That's a lint rule.
- Grepping the filesystem with `execSync("grep ...")`. That's a shell script.
- Checking that files exist or don't exist with `existsSync`. That's a build check.
- Spawning child processes to start servers. Use the `app` fixture.
- Validating config files (package.json, docker-compose.yml, tsconfig). That's CI.
- Asserting on documentation content. That's nothing.

If you can't express the assertion as `import { thing } from "../module" → expect(thing(...)).toBe(...)`, it's not a test.

## Structure

- Tests only live in `packages/`. No tests in `scripts/` or project root.
- Unit tests: `<name>.test.ts` in `packages/<pkg>/src/__tests__/`.
- Integration tests: `<name>.integration.test.ts` — use vitest fixtures that inject `{ db, app, eventBus }` per test.
- E2E tests: Playwright for user-facing features (`*.spec.ts`).
- Tests must not depend on execution order.

### Test file naming

| Pattern | Type | Speed |
|---|---|---|
| `*.test.ts` | Unit tests (pure logic, no DB/server) | <1s per file |
| `*.test.tsx` | Component/UI tests (React rendering) | <1s per file |
| `*.integration.test.ts` | DB/API integration (vitest fixtures) | 1-10s per file |
| `*.spec.ts` | E2E (Playwright, separate from vitest) | 5-30s per test |

## Standards

- Write tests first (TDD). Every acceptance criterion that describes runtime behavior gets a test.
- ACs that describe static codebase properties (file locations, naming conventions, config shape) are enforced by lint rules or the type system — not tests.
- Follow AAA pattern: Arrange, Act, Assert.
- Test all paths: success, error, boundary values, edge cases.
- Use `test()` (not `it()`) in integration tests — only `test()` receives fixture injection.
- Never call `createTestDb()`, `createTestApp()`, or `new EventBus()` directly in test files — use fixtures.
- Never write `beforeEach`/`afterEach` for DB setup — fixtures handle setup and teardown automatically.
- `beforeEach`/`afterEach` only for non-DB setup (e.g. `vi.stubEnv`).
- Never write tests that only assert `toBeDefined()` or `not.toThrow()`.
- Design system: every UI component must have a `.stories.tsx` file.

## Fixture pattern (integration tests)

```typescript
// server integration test
import { test, describe, expect } from "../test-fixtures.js";

describe("Feature", () => {
  test("works", async ({ db, app }) => {
    await db.insert(teams).values({ id: "t1", name: "Alpha", slug: "alpha" });
    const res = await app.request("/api/teams");
    expect(res.status).toBe(200);
  });
});
```

```typescript
// db/fabric integration test
import { test, describe, expect } from "@hyperidle/db/test-fixtures";

describe("Feature", () => {
  test("persists", async ({ db }) => {
    await db.insert(teams).values({ id: "t1", name: "Alpha", slug: "alpha" });
    const rows = await db.select().from(teams);
    expect(rows).toHaveLength(1);
  });
});
```

Fixture sources:
- `packages/server/src/test-fixtures.ts` — exports `{ test, describe, expect }` with `{ db, app, eventBus }` context.
- `packages/db/src/test-fixtures.ts` (re-exported as `@hyperidle/db/test-fixtures`) — exports `{ test, describe, expect }` with `{ db }` context.

PGlite pool pre-warms 1 instance per worker and reuses it between tests via `TRUNCATE` (~19ms). No teardown needed in test files.
