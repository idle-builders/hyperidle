# HyperIdle Deployment Profiles

HyperIdle (H4) ships three deployment profiles that each map to a concrete
(database driver, workspace adapter, orchestration) tuple. Pick the one
that matches your environment and use the `bun run setup` CLI.

Profile selection order:
1. `--profile <laptop|vps|cloud>` CLI flag.
2. `HYPERIDLE_PROFILE` env var.
3. Default: `laptop`.

---

## Sections

- [Laptop](./laptop.md)
- [VPS](./vps.md)
- [Cloud](./cloud.md)
- [Switching SQLite to Postgres](./switching-sqlite-to-postgres.md)
- [Troubleshooting](./troubleshooting.md)
