## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `docker-compose.yml not found` | Wrong working directory. | Run from repo root. |
| `Invalid profile` | Typo in `HYPERIDLE_PROFILE`. | Use one of `laptop`, `vps`, `cloud`. |
| `DATABASE_URL required` | Cloud/VPS profile without URL. | Export `DATABASE_URL` or pass `--db-url`. |
| Postgres pool exhausted | Too few connections. | Raise `PG_POOL_SIZE` env var. |
