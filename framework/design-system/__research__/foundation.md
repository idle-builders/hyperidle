# Foundation: Current State Inventory

This file captures the current values that the K1 recommendations tables compare against. It is the read-only baseline produced before any research synthesis.

## Sources

- `framework/design-system/src/tokens.css` — canonical token values
- `framework/design-system/DESIGN.md` — token reference documentation
- `framework/design-system/PRINCIPLES.md` — universal principles

## Current density preset values (from tokens.css)

| Token | Default | Compact | Comfortable |
|---|---|---|---|
| `--density-pad-x` | `0.75rem` (12px) | `0.375rem` (6px) | `1rem` (16px) |
| `--density-pad-y` | `0.5rem` (8px) | `0.25rem` (4px) | `0.75rem` (12px) |
| `--density-gap` | `0.5rem` (8px) | `0.25rem` (4px) | `0.75rem` (12px) |
| `--density-row-h` | `2rem` (32px) | `1.625rem` (26px) | `2.5rem` (40px) |
| `--density-text` | `0.875rem` (14px) | `0.75rem` (12px) | `0.9375rem` (15px) |

## Current type scale (from DESIGN.md)

| Size | Weight | Line Height | Usage |
|---|---|---|---|
| 24px | 600 | 1.2 | Page titles |
| 18px | 600 | 1.3 | Section headings |
| 14px | 600 | 1.45 | Mono section headers |
| 14px | 500 | 1.45 | Subheadings, nav labels |
| 14px | 400 | 1.45 | Body text (default) |
| 13px | 400/500 | 1.4 | Mono data values |
| 12px | 500/600 | 1.4 | Small labels, metadata |
| 11px | 500 | 1.3 | Mono uppercase tags |

## Current radii (from tokens.css)

| Token | Value |
|---|---|
| `--r0` | 0 |
| `--r1` | 4px |
| `--r2` | 8px |
| `--r3` | 12px |
| `--r-pill` | 999px |

## Current motion (from tokens.css)

| Token | Value |
|---|---|
| `--motion-fast` | 80ms |
| `--motion-medium` | 150ms |
| `--motion-slow` | 250ms |

## Current borders (from tokens.css)

| Token | Dark | Light |
|---|---|---|
| `--border-subtle` | rgba(255,255,255,0.06) | rgba(0,0,0,0.06) |
| `--border-default` | rgba(255,255,255,0.10) | rgba(0,0,0,0.10) |
| `--border-emphasis` | rgba(255,255,255,0.16) | rgba(0,0,0,0.16) |

## Current dark surface ladder

7 levels (`--surface-0` through `--surface-6`) plus `--surface-ghost`. Already exceeds the 4-level minimum recommended by most dark-mode guidance.

## Component pixel-value usage (sampled)

Sampling under `framework/design-system/src/*.tsx` and `layers/core-ui/src/**/*.tsx` shows hardcoded values such as `gap-[4px]`, `p-[8px]`, `gap-[6px]`, `text-[11px]`, `text-[12px]`, `text-[13px]`. These are aligned to the 4px grid but routed through arbitrary Tailwind brackets rather than the token scale. K7 owns the rewrite; K1 only catalogs the values.

## Mobile / density auto-switch

There is no current auto-density behavior. `[data-density]` is set explicitly by the AppShell or the user via Settings. The K7 story will introduce a viewport-driven auto-switch using a hook gated by user override.

## Why this file is small

It is a baseline, not a synthesis. The downstream research files cite this baseline and the synthesis (`AESTHETICS.md`) is responsible for proposing changes with full source attribution.
