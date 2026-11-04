# Laptop

Setup steps and the command reference live in [guides/developer/getting-started](../guides/developer/getting-started.md) and [guides/developer/commands](../guides/developer/commands.md); this page holds only the deployment facts specific to this profile.

## Deployment facts

1. **Database is a PGlite data directory at `<repo-root>/hyperidle-pg`.** The laptop profile default is `./hyperidle-pg` (`applications/remote-server/src/profiles.ts`), resolved repo-root-relative by `resolvePglitePath` in `applications/remote-server/src/create-server.ts`.
2. **Setup before dev.** `npm run dev` does not migrate the database. Run `npm run setup` first — the setup CLI (`tools/setup/src/setup-cli.ts`) creates the PGlite directory and applies migrations. The desktop app migrates itself on boot (`applications/desktop/src/migrate.ts`); the dev server never does.
3. **Laptop auto-defaults the API key.** When `HYPERIDLE_API_KEY` is not set, the laptop profile sets it to `hyperidle-dev-local` (`applications/remote-server/src/validate-startup-env.ts`). In a dev build the web client falls back to the same value (`apiKey()` in `layers/core-ui/src/api.ts`). No env setup is needed for local dev.
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

The server entry point is `applications/remote-server/src/index.ts` (the `@hyperidle/remote-server` application). Like `npm run dev`, it runs no agents — see [where agents run](index.md).

## Desktop app: menu-bar mode

The packaged desktop app in local mode keeps its server and agents running after the window closes (`applications/desktop/src/main.ts`).

- **Close window or ⌘Q:** windows close, the Dock icon hides, the process keeps running. A Mac logout or shutdown still goes through.
- **Menu-bar icon:** shows **HyperIdle is running**, **Open HyperIdle**, **Stop HyperIdle**. **Open HyperIdle** opens a window. Clicking the Dock icon opens one too.
- **Stop HyperIdle** (or SIGTERM) disposes the server and exits. Logout, shutdown and Force Quit also end it.
- **Login item:** the first packaged start registers HyperIdle to open at login. A login start opens no window; the Dock icon hides once the server is ready. The app records that it did this (`loginItemSet` in `config.json`) and does not set it again, unless `config.json` is deleted. Remove it in System Settings → General → Login Items. Dev builds never register it.
- **Shared mode** (joined server): joining turns the login item off (packaged builds). No menu-bar icon; ⌘Q quits the app.

## Other profiles

- Server-hosted profiles (cloud): [self-hosting](self-hosting.md)
- Desktop app releases (the primary end-user distribution): [releases](releases.md)
- Profile overview and install table: [index](index.md)
