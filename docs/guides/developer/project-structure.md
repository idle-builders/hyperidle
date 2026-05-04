## Project Structure

```
hyperidle/
├── packages/
│   ├── db/          # Drizzle ORM schema, migrations, seed data, setup CLI
│   ├── server/      # Hono API server (port 3001)
│   ├── web/         # React + Vite frontend (port 5173)
│   ├── shared/      # Shared types, constants, TOON codec
│   ├── fabric/      # Knowledge materialization, file watching, writeback
│   └── pipeline/    # CLI for batch story processing (Ink React)
├── docs/            # Architecture, requirements, work packages
├── bin/             # Shell wrappers (setup, pipeline)
└── .github/         # CI workflow
```

Cross-package imports use workspace aliases: `@hyperidle/db`, `@hyperidle/server`, `@hyperidle/shared`, etc.
