# Destroyer input — `host-process` (framework)

Package: `framework/host-process`
Surface: 10 exported functions, 0 classes (0 member methods), 11 interface/type declarations, 2 const/enum exports.

## A. Exported functions — EVERY ONE NEEDS A VERDICT

| # | Method | Public | Location |
|---|---|---|---|
| 1 | `createGitRunner` | yes | `framework/host-process/src/git/git-runner.ts:318` |
| 2 | `isPrivateIPv4` | yes | `framework/host-process/src/net/ssrf.ts:63` |
| 3 | `isPrivateIPv6` | yes | `framework/host-process/src/net/ssrf.ts:82` |
| 4 | `isPrivateHostLiteral` | yes | `framework/host-process/src/net/ssrf.ts:97` |
| 5 | `isLoopbackHost` | yes | `framework/host-process/src/net/ssrf.ts:109` |
| 6 | `sanitizeHttpUrl` | yes | `framework/host-process/src/net/ssrf.ts:159` |
| 7 | `assertUrlNotSSRF` | yes | `framework/host-process/src/net/ssrf.ts:173` |
| 8 | `resolveUrlForSSRF` | yes | `framework/host-process/src/net/ssrf.ts:193` |
| 9 | `resolveProfile` | yes | `framework/host-process/src/profiles.ts:75` |
| 10 | `validateStartupEnv` | yes | `framework/host-process/src/validate-env.ts:7` |

## C. Interface / type declarations — the DI-port surface

Verdict each DECLARATION (not every member individually) unless a member is independently interesting. A port member whose only implementation you are deleting dies with it — say so.

- `GitConfigInjection` (interface, public) `framework/host-process/src/git/git-runner.ts:40` — members: `key`, `value`
- `GitRunner` (interface, public) `framework/host-process/src/git/git-runner.ts:47` — members: `init`, `add`, `commit`, `push`, `diffCached`, `revParseIsInsideWorkTree`, `configSet`, `remoteAdd`, `lsFiles`, `lsRemote`, `clone`, `bundle`, `worktreeAdd`, `worktreeRemove`, `restoreStaged`, `currentBranch`
- `CreateGitRunnerOptions` (interface, public) `framework/host-process/src/git/git-runner.ts:154` — members: `timeouts`, `logger`
- `SanitizeResult` (type, public) `framework/host-process/src/net/ssrf.ts:25`
- `ResolveResult` (type, public) `framework/host-process/src/net/ssrf.ts:32`
- `SanitizeUrlOptions` (interface, public) `framework/host-process/src/net/ssrf.ts:36` — members: `requireHttps`, `label`, `lookup`
- `DeploymentProfile` (type, public) `framework/host-process/src/profiles.ts:15`
- `DbDriver` (type, internal) `framework/host-process/src/profiles.ts:17`
- `SandboxAdapterKind` (type, internal) `framework/host-process/src/profiles.ts:19`
- `ProfileDefaults` (interface, internal) `framework/host-process/src/profiles.ts:21` — members: `profile`, `dbDriver`, `dbUrlDefault`, `sandboxAdapter`, `requiresDockerCompose`, `ports`
- `ResolveOptions` (interface, internal) `framework/host-process/src/profiles.ts:65` — members: `profile`, `env`

## D. Const / enum exports

- `PROFILE_DEFAULTS` (const, internal) `framework/host-process/src/profiles.ts:32`
- `LAPTOP_DEV_API_KEY` (const, public) `framework/host-process/src/validate-env.ts:5`
