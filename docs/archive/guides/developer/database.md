## Database

### SQLite (default, laptop profile)

```bash
npm run setup --profile laptop   # creates hyperidle.db, migrates, seeds
```

### PostgreSQL (VPS/Cloud)

```bash
npm run db:migrate:pg            # run Postgres migrations
npm run db:seed:pg               # seed initial data
```

### Schema Changes

```bash
# 1. Edit packages/db/src/schema.ts (SQLite) and/or schema.pg.ts (Postgres)
# 2. Generate migration
npm run db:generate

# 3. Apply migration
npm run db:migrate
```

Both drivers share the same Drizzle ORM schema. A parity test (`pg-schema.test.ts`) ensures they stay in sync.
