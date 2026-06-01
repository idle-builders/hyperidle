# W2 Definition of Done

## Acceptance Criteria Verification Table

| # | Criterion | Verification Method | Pass Condition |
|---|---|---|---|
| AC-1 | Density system completely removed | `grep -rn "data-density\|useDensity\|useAutoDensity" packages/ --include="*.ts" --include="*.tsx" --include="*.css" --include="*.json" \| grep -v node_modules \| grep -v TRACK- \| grep -v plans/ \| grep -v ".md"` | Zero results |
| AC-2 | Token files synced | `token-sync.test.ts` unit test | Test passes (every token name+value in _tokens.css matches tokens.css) |
| AC-3 | 10 Tier 0 primitives exist with stories | File existence check for Avatar.tsx, Button.tsx, Input.tsx, Select.tsx, Toggle.tsx, Checkbox.tsx, TabBar.tsx, Toast.tsx, Progress.tsx + their .stories.tsx siblings + `npm run check` | All files exist, typecheck passes |
| AC-4 | ds:sync passes for new primitives | `npm run ds:sync` | All new primitives in COMPONENTS array, all pass <5% diff |
| AC-5 | ds:sync passes for existing components | `npm run ds:sync` | All 16+ existing components pass <5% diff |
| AC-6 | No density tokens in production code | `grep -rn "var(--density" packages/design-system/src/ packages/web/src/ --include="*.tsx" --include="*.ts" \| grep -v __tests__ \| grep -v e2e` | Zero results |
| AC-7 | No density UI in Settings | Playwright screenshot of Settings page | No density select visible |
| AC-8 | ESLint density rules removed | `npm run lint` passes; files do not exist | Lint green; rule files deleted |
| AC-9 | Pages match W1 mockups | Playwright screenshots light+dark of all pages | Visual match confirmed |
| AC-10 | Verify pipeline passes | `npm run verify` | All tools pass, zero errors |

## Proof Artifacts

The builder must produce these artifacts as evidence of completion:

1. **ds:sync report** -- sync-reports/ directory with html.png, tsx.png, diff.png, result.json for every component
2. **Page screenshots** -- Playwright screenshots of all pages in light and dark mode
3. **Verify attestation** -- `.verify-attestations/<sha>.json` from `npm run verify`
4. **grep verification** -- Output of the density grep commands showing zero results
