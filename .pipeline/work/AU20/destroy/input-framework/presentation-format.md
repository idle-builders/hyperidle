# Destroyer input — `presentation-format` (framework)

Package: `framework/presentation-format`
Surface: 9 exported functions, 0 classes (0 member methods), 1 interface/type declarations, 1 const/enum exports.

## A. Exported functions — EVERY ONE NEEDS A VERDICT

| # | Method | Public | Location |
|---|---|---|---|
| 1 | `deriveTitle` | yes | `framework/presentation-format/src/format/bet.ts:24` |
| 2 | `deriveTitleFromPitch` | yes | `framework/presentation-format/src/format/bet.ts:42` |
| 3 | `relativeShort` | yes | `framework/presentation-format/src/format/time.ts:94` |
| 4 | `relativeLong` | yes | `framework/presentation-format/src/format/time.ts:106` |
| 5 | `clockTime` | yes | `framework/presentation-format/src/format/time.ts:127` |
| 6 | `absoluteDate` | yes | `framework/presentation-format/src/format/time.ts:135` |
| 7 | `absoluteDateTime` | yes | `framework/presentation-format/src/format/time.ts:142` |
| 8 | `deriveInitials` | yes | `framework/presentation-format/src/initials.ts:13` |
| 9 | `scopeKindToLabel` | yes | `framework/presentation-format/src/scope-labels.ts:38` |

## C. Interface / type declarations — the DI-port surface

Verdict each DECLARATION (not every member individually) unless a member is independently interesting. A port member whose only implementation you are deleting dies with it — say so.

- `TimestampInput` (type, public) `framework/presentation-format/src/format/time.ts:20`

## D. Const / enum exports

- `TIME_PLACEHOLDER` (const, public) `framework/presentation-format/src/format/time.ts:18`
