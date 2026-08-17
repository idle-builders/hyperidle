# Destroyer input — `cron` (framework)

Package: `framework/cron`
Surface: 3 exported functions, 0 classes (0 member methods), 1 interface/type declarations, 0 const/enum exports.

## A. Exported functions — EVERY ONE NEEDS A VERDICT

| # | Method | Public | Location |
|---|---|---|---|
| 1 | `parseCron` | yes | `framework/cron/src/cron.ts:90` |
| 2 | `nextCronMatch` | yes | `framework/cron/src/cron.ts:120` |
| 3 | `computeNextRunAt` | yes | `framework/cron/src/cron.ts:153` |

## C. Interface / type declarations — the DI-port surface

Verdict each DECLARATION (not every member individually) unless a member is independently interesting. A port member whose only implementation you are deleting dies with it — say so.

- `CronFields` (interface, public) `framework/cron/src/cron.ts:10` — members: `minute`, `hour`, `dayOfMonth`, `month`, `dayOfWeek`
