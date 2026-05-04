## Testing

### Unit & Integration Tests (Vitest)

```bash
bun run test                     # run all tests
bun run test -- <path>           # run a specific test file
bun run test:coverage            # with coverage report
```

**Important:** Always use `bun run test`, never bare `bun test` (which invokes Bun's native test runner instead of Vitest).

Tests use `createTestDb()` for in-memory SQLite databases and `createTestApp()` for Hono app instances — prefer these over mocks.

### E2E Tests (Playwright)

```bash
# Ensure dev server is running first
bun dev &

# Run E2E tests
bun run --filter @hyperidle/web test:e2e
```

Playwright config is in `packages/web/playwright.config.ts`. It runs Chromium only.

### Test Conventions

- Test files: `*.test.ts` / `*.test.tsx` in `__tests__/` directories
- Follow AAA pattern: Arrange, Act, Assert
- Test all paths: success, error, boundary values, edge cases
- Never mock what `createTestDb()` / `createTestApp()` can provide
