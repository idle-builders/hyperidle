# Testing Patterns Reference

Progressive disclosure checklist — load only when writing or reviewing tests.

## Test Structure (AAA)

Integration tests use vitest fixtures. Import `test` from the fixture module — only `test()` receives fixture injection; `it()` does not.

```typescript
import { test, describe, expect } from "../test-fixtures.js";

describe("Feature", () => {
  test('should reject unauthorized access', async ({ app }) => {
    // Arrange
    const unauthenticatedRequest = new Request('/api/bets', { method: 'GET' });

    // Act
    const response = await app.request(unauthenticatedRequest);

    // Assert
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: 'Unauthorized' });
  });
});
```

For tests that need custom `AppOptions`, destructure `{ db, eventBus }` and call `createApp()` manually:

```typescript
import { test, describe, expect } from "../test-fixtures.js";
import { createApp } from "../app.js";

describe("Custom options", () => {
  test('uses custom config', async ({ db, eventBus }) => {
    const app = createApp({ db, eventBus, someOption: true });
    const res = await app.request("/api/ping");
    expect(res.status).toBe(200);
  });
});
```

## Test Naming

`should [expected behavior] when [condition]`

- `should return 404 when bet does not exist`
- `should create task when all fields are valid`
- `should reject negative cost budgets`

## Path Coverage Checklist

For each function/endpoint, test:

- [ ] Happy path — valid input, expected output
- [ ] Empty input — `""`, `[]`, `{}`, `null`, `undefined`
- [ ] Boundary values — 0, 1, -1, MAX_SAFE_INTEGER, empty string, max-length string
- [ ] Invalid types — wrong type, missing required fields, extra fields
- [ ] Error responses — 400, 401, 403, 404, 409, 500
- [ ] Concurrent access — two mutations on same record
- [ ] State transitions — valid and invalid transitions

## Mock vs Real

| Use | When |
|-----|------|
| `{ db }` fixture | Database queries, transactions, constraints |
| `{ app }` fixture | API endpoint integration (includes routing, middleware, DB) |
| `{ db, eventBus }` + `createApp()` | Custom AppOptions beyond defaults |
| Manual mock | Truly out-of-band external services (email, webhooks) — NOT the harness |
| `vi.fn()` | Verifying call counts or arguments on injected dependencies |

**Never mock the harness / agent / CLI / LLM when it is the thing under test.** A harness-facing integration test drives the **real installed binary** (or the in-process builtin) — gate it with `requireHarness(<name>)`, never a stub. Mocking the harness/LLM under test is a false green (the CC-004 tripwire in `/review`, blocking). A deterministic LLM double is permitted ONLY in a *service* integration test where the harness is **not** under test (proving routing/persistence, not the agent). See `.claude/rules/testing.md` §Integration tests: two archetypes.

Never mock Drizzle. Never mock Hono middleware. Never mock internal modules.
Never call `createTestDb()`, `createTestApp()`, or `new EventBus()` in test files — fixtures provide these.

## React Component Testing

```typescript
// Test behavior, not rendering
it('should call onApprove when approve button clicked', async () => {
  const onApprove = vi.fn();
  render(<ReviewHeader onApprove={onApprove} />);
  await userEvent.click(screen.getByRole('button', { name: /approve/i }));
  expect(onApprove).toHaveBeenCalledOnce();
});
```

Test all states: empty, loading, error, populated, overflow.

## Playwright E2E Patterns

```typescript
test('user can create a new bet', async ({ page }) => {
  await page.goto('/work');
  await page.getByRole('button', { name: 'New Bet' }).click();
  await page.getByLabel('Title').fill('Test Bet');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByText('Test Bet')).toBeVisible();
});
```

- Use role selectors over test IDs
- Assert visible outcomes, not internal state
- Each E2E test should be independent (no shared state between tests)
