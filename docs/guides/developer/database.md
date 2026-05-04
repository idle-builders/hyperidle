## Database

### SQLite (default, laptop profile)

```bash
bun run setup --profile laptop   # creates hyperidle.db, migrates, seeds
```

### PostgreSQL (VPS/Cloud)

```bash
bun run db:migrate:pg            # run Postgres migrations
bun run db:seed:pg               # seed initial data
```

### Schema Changes

```bash
# 1. Edit packages/db/src/schema.ts (SQLite) and/or schema.pg.ts (Postgres)
# 2. Generate migration
bun run db:generate

# 3. Apply migration
bun run db:migrate
```

Both drivers share the same Drizzle ORM schema. A parity test (`pg-schema.test.ts`) ensures they stay in sync.
