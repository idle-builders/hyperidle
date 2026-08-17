# Delete batch — `fw-host-process`

6 convicted rows. Delete every one, or record it as a survivor with a reason.

| # | Symbol | Reach | Why it was convicted |
|---|---|---|---|
| 1 | `sanitizeHttpUrl` | TEST-ONLY | Only __tests__/ssrf.test.ts calls it. The sync gate nobody wired; resolveUrlForSSRF does its own parse. Test dies with it. |
| 2 | `assertUrlNotSSRF` | TEST-ONLY | Wrapper over resolveUrlForSSRF that throws away the addresses. Its own @lore says it exists for "existing call sites (notifications/ntfy)" — those call sites use notifications' private copy, not this. Zero production callers. |
| 3 | `CreateGitRunnerOptions` |  | Only git-runner.integration.test.ts passes { logger, timeouts }. Production always calls createGitRunner(path) bare. Test-only surface on a public factory. |
| 4 | `SanitizeResult` |  | { ok: false; reason: string }. |
| 5 | `SandboxAdapterKind` |  | The sandboxAdapter field it types is read by nobody, anywhere. Dies with the field. |
| 6 | `LAPTOP_DEV_API_KEY (const)` |  | Only prod use is the adjacent function; the browser code that must agree (core-ui/api-fetch.ts:33) hardcodes the literal anyway. Inline "hyperidle-dev-local" into the inlined validateStartupEnv; the core-api test importing it dies/moves with #10. |
