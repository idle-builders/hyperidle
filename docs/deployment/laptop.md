# Laptop

Setup steps and the command reference live in [guides/developer/getting-started](../guides/developer/getting-started.md) and [guides/developer/commands](../guides/developer/commands.md); this page holds only the deployment facts specific to this profile.

## Deployment facts

1. **Database is a PGlite data directory at `<repo-root>/hyperidle-pg`.** The laptop profile default is `./hyperidle-pg` (`applications/remote-server/src/profiles.ts`), resolved repo-root-relative by `resolvePglitePath` in `applications/remote-server/src/create-server.ts`.
2. **Setup before dev.** `npm run dev` does not migrate the database. Run `npm run setup` first — the setup CLI (`tools/setup/src/setup-cli.ts`) creates the PGlite directory and applies migrations. The desktop app migrates itself on boot (`applications/desktop/src/migrate.ts`); the dev server never does.
3. **Laptop auto-defaults the API key.** When `HYPERIDLE_API_KEY` is not set, the laptop profile sets it to `hyperidle-dev-local` (`applications/remote-server/src/validate-startup-env.ts`). The web client falls back to the same value (`layers/core-ui/src/services/api-fetch.ts`). No env setup is needed for local dev.
4. **Node ≥ 24** (root `package.json` engines).

## Other profiles

- Server-hosted profiles (cloud): [self-hosting](self-hosting.md)
- Desktop app releases (the primary end-user distribution): [releases](releases.md)
- Profile overview and install table: [index](index.md)
