# Mock-data purge -- tracked-out follow-ups

Rows that remain in `inventory.json` after M4, with tracking and remediation plans.

Every row in `inventory.json` is listed here. The comment rewrites in M4 removed 6 false-positive
Group A rows (lore/JSDoc comments that quoted forbidden literals). The 10 rows below are the
remaining tracked-out rows that require follow-up workpackages.

---

## Server auth fallback

**Tracking:** Server auth hardening follow-up (post-rollout).

These three rows contain real runtime fallback expressions (`founderRow?.value ?? "u-founder"` and
`c.get("userId") ?? "u-founder"`). They activate only when the development database has not been
seeded with a `founder_id` row in `factorySettings`. In production, `factorySettings` is always
seeded so the fallback is never reached. Replacing these with a hard throw would break the majority
of existing integration tests that do not seed `factorySettings`.

**Remediation:** DB migration that adds `founder_id` as a required seed (with NOT NULL constraint or
a guaranteed-present default). Once the migration runs in all environments (dev, CI, staging, prod),
the `?? "u-founder"` fallbacks can be deleted and replaced with a hard `throw new Error(...)`. This
is a schema-level change outside Track M scope.

| File | Line | Code | Remediation |
|---|---|---|---|
| `middleware/auth.ts` | 89 | `founderRow?.value ?? "u-founder"` | DB migration to make founder_id a required seed; then delete fallback |
| `routes/auth.ts` | 50 | `c.get("userId") ?? "u-founder"` | Same migration; delete fallback |
| `lifecycle-propagation.ts` | 409 | `founderRow?.value ?? "u-founder"` | Same migration; delete fallback |

---

## Knowledge page API wiring

**Tracking:** #92 (AppShell import), #93 (KnowledgeDetail + KnowledgeList + knowledge-data.ts).

These 7 rows require full knowledge-page API wiring: server endpoints, React hooks, and page
rewrites to replace fixture lookups with API-fetched data. This is a dedicated workpackage, not a
Track M mechanical swap.

| File | Symbol | Line | Remediation |
|---|---|---|---|
| `knowledge-data.ts` | `MOCK_KNOWLEDGE_ITEMS` | 81 | Replace with `GET /api/knowledge/:layer`; delete fixture |
| `knowledge-data.ts` | `MOCK_CURATION_SUGGESTIONS` | 288 | Replace with `GET /api/knowledge/curation`; delete fixture |
| `AppShell.tsx` | `import ../fixtures/knowledge-data` | 18 | Replace `topicsForScope` with API-derived topic list |
| `KnowledgeDetail.tsx` | `import ../fixtures/knowledge-data` | 41 | Replace fixture lookup with `GET /api/knowledge/:id` |
| `KnowledgeDetail.tsx` | `LEGACY_DETAILS` | 78 | Replace with API-served detail payloads; delete constant |
| `KnowledgeDetail.tsx` | `LEGACY_SOURCES` | 115 | Replace with API-served source data; delete constant |
| `KnowledgeDetail.tsx` | `FALLBACK_DETAIL` | 120 | Remove fallback; render empty/error state when item not found |

**Why tracked-out:** The knowledge page currently reads from fixture data because the knowledge API
endpoints (`/api/knowledge/:layer`, `/api/knowledge/:id`, `/api/knowledge/curation`) do not exist
yet. Wiring the page requires: (a) implementing those endpoints, (b) writing React hooks
(`useKnowledgeItems`, `useKnowledgeDetail`, `useCurationSuggestions`), (c) updating
`KnowledgeList.tsx` and `KnowledgeDetail.tsx` to use the hooks, and (d) deleting `knowledge-data.ts`
once all consumers are migrated. This is the knowledge-page API wiring workpackage (tracked in #93).
