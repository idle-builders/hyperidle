## Testing

### Test Commands

```bash
npm run test                     # unit + component tests only (fast, excludes *.integration.test.ts)
npm run test:integration         # DB/API integration tests only (vitest fixtures, PGlite)
npm run test:all                 # unit + component + integration sequentially
npm run test:e2e                 # Playwright E2E (Chromium)
npm run verify                   # check + lint + knip + test:all + build + attestation
npm run verify:quick             # check + lint + knip only
```

Run a specific file: `npm run test -- packages/server/src/__tests__/my.test.ts`

### Test File Naming

| Pattern | Type | When to use |
|---|---|---|
| `*.test.ts` | Unit tests (pure logic) | Functions, utilities, state machines, calculations |
| `*.test.tsx` | Component tests (React rendering) | React components, hooks |
| `*.integration.test.ts` | Integration tests (DB + API) | Drizzle queries, Hono routes end-to-end |
| `*.spec.ts` | E2E tests (Playwright) | User journeys across the full stack |

### Fixture Pattern (Integration Tests)

Integration tests use vitest fixtures — **do not** call `createTestDb()`, `createTestApp()`, or `new EventBus()` in test files. Fixtures inject `{ db, app, eventBus }` per test and handle setup/teardown automatically via PGlite TRUNCATE (~19ms between tests).

**Server integration tests** — import from `../test-fixtures.js`:

```typescript
import { test, describe, expect } from "../test-fixtures.js";
import { teams } from "@hyperidle/db";

describe("Teams API", () => {
  test("GET /api/teams returns all teams", async ({ db, app }) => {
    // Arrange
    await db.insert(teams).values({ id: "t1", name: "Alpha", slug: "alpha" });

    // Act
    const res = await app.request("/api/teams");

    // Assert
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject([{ id: "t1", name: "Alpha" }]);
  });
});
```

**DB/fabric integration tests** — import from `@hyperidle/db/test-fixtures`:

```typescript
import { test, describe, expect } from "@hyperidle/db/test-fixtures";
import { teams } from "@hyperidle/db";

describe("Teams table", () => {
  test("inserts and reads a team", async ({ db }) => {
    await db.insert(teams).values({ id: "t1", name: "Alpha", slug: "alpha" });
    const rows = await db.select().from(teams);
    expect(rows).toHaveLength(1);
  });
});
```

**Key rules:**
- Use `test()` not `it()` — only `test()` receives fixture injection.
- `beforeEach`/`afterEach` only for non-DB concerns (e.g. `vi.stubEnv`). Never for DB setup.
- Tests that need custom `AppOptions` destructure `{ db, eventBus }` and call `createApp()` manually.

### E2E Tests (Playwright)

```bash
# Ensure dev server is running first
npm run dev &

# Run E2E tests
npm run test:e2e
```

Playwright config is in `packages/web/playwright.config.ts`. It runs Chromium only.

### Test Conventions

- Test files live in `packages/`. No tests in `scripts/` or project root.
- Follow AAA pattern: Arrange, Act, Assert.
- Test all paths: success, error, boundary values, edge cases.
- Never mock Drizzle, Hono middleware, or internal modules.
- Use fixtures for all DB/API tests — never mock what the fixture provides.
- Mock data is allowed only inside the permitted-mock surface (tests, stories, `__fixtures__/`, e2e, seed scripts). See [mock-data policy](./mock-data-policy.md).
