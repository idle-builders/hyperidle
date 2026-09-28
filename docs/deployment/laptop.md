# Laptop

Setup steps and the command reference live in [guides/developer/getting-started](../guides/developer/getting-started.md) and [guides/developer/commands](../guides/developer/commands.md); this page holds only the deployment facts specific to this profile.

## Deployment facts

1. **Database is a PGlite data directory at `<repo-root>/hyperidle-pg`.** The laptop profile default is `./hyperidle-pg` (`applications/remote-server/src/profiles.ts`), resolved repo-root-relative by `resolvePglitePath` in `applications/remote-server/src/create-server.ts`.
2. **Setup before dev.** `npm run dev` does not migrate the database. Run `npm run setup` first — the setup CLI (`tools/setup/src/setup-cli.ts`) creates the PGlite directory and applies migrations. The desktop app migrates itself on boot (`applications/desktop/src/migrate.ts`); the dev server never does.
3. **Laptop auto-defaults the API key.** When `HYPERIDLE_API_KEY` is not set, the laptop profile sets it to `hyperidle-dev-local` (`applications/remote-server/src/validate-startup-env.ts`). The web client falls back to the same value (`layers/core-ui/src/services/api-fetch.ts`). No env setup is needed for local dev.
4. **Node ≥ 24** (root `package.json` engines).

## Running as a macOS background service

`deploy/bin/service install` installs the server as a macOS LaunchAgent (survives terminal close, starts on login). Set `HYPERIDLE_API_KEY` first; the script requires it for a production key. The laptop profile auto-defaults the key to `hyperidle-dev-local` only when no key is given at runtime — the service installer requires you to be explicit.

```bash
export HYPERIDLE_API_KEY=your-key-here
./deploy/bin/service install    # installs and starts
./deploy/bin/service status
./deploy/bin/service logs
./deploy/bin/service uninstall  # remove
```

The server entry point is `applications/remote-server/src/index.ts` (the real `@hyperidle/remote-server` application).

## Other profiles

- Server-hosted profiles (cloud): [self-hosting](self-hosting.md)
- Desktop app releases (the primary end-user distribution): [releases](releases.md)
- Profile overview and install table: [index](index.md)
