## Testing

### Unit & Integration Tests (Vitest)

```bash
npm run test                     # run all tests
npm run test -- <path>           # run a specific test file
npm run test:coverage            # with coverage report
```

Tests use `createTestDb()` for in-memory SQLite databases and `createTestApp()` for Hono app instances — prefer these over mocks.

### E2E Tests (Playwright)

```bash
# Ensure dev server is running first
npm run dev &

# Run E2E tests
npm run -w @hyperidle/web test:e2e
```

Playwright config is in `packages/web/playwright.config.ts`. It runs Chromium only.

### Test Conventions

- Test files: `*.test.ts` / `*.test.tsx` in `__tests__/` directories
- Follow AAA pattern: Arrange, Act, Assert
- Test all paths: success, error, boundary values, edge cases
- Never mock what `createTestDb()` / `createTestApp()` can provide
- Mock data is allowed only inside the permitted-mock surface (tests, stories, `__fixtures__/`, e2e, seed scripts). See [mock-data policy](./mock-data-policy.md).
