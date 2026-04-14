# Testing Patterns Reference

Progressive disclosure checklist — load only when writing or reviewing tests.

## Test Structure (AAA)

```typescript
it('should reject unauthorized access', () => {
  // Arrange
  const db = createTestDb();
  const app = createTestApp(db);
  const unauthenticatedRequest = new Request('/api/bets', { method: 'GET' });

  // Act
  const response = await app.request(unauthenticatedRequest);

  // Assert
  expect(response.status).toBe(401);
  expect(await response.json()).toMatchObject({ error: 'Unauthorized' });
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
| `createTestDb()` | Database queries, transactions, constraints |
| `createTestApp()` | API endpoint integration (includes routing, middleware, DB) |
| Manual mock | External services (LLM APIs, email, webhooks) |
| `vi.fn()` | Verifying call counts or arguments on injected dependencies |

Never mock Drizzle. Never mock Hono middleware. Never mock internal modules.

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
