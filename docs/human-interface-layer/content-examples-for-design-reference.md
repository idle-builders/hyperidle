# Content examples (for design reference)

Fictional-but-grounded sample content for populating designs with realistic density and tone. Examples come from the factory's products: Ambrovia (team alignment for project work), Acme (SME M&A analytics), and HyperIdle (this operating system itself).

## Review threads

Each example uses one of the real artifact embed layouts (`text_diff`, `action_summary`, `content_preview`, `visual_comparison`, `data_metrics` — `framework/domain-model/src/thread.ts`). Layout semantics live in the [artifact primitive](../process-layer/artifact-primitive.md).

- **Text diff:** Subject: "Deploy Acme pricing-engine v1.4.2 to staging". Author: Acme Backend Builder. Artifact: a 40-line diff in `pricing-engine/src/calculate.ts` — changes to margin calculation logic. Inline comment example: "Line 23: this rounds down to the nearest cent, but our contracts specify rounding to four decimal places. Intentional?"
- **Action summary:** Subject: "Enable Stripe live mode for Ambrovia Pro tier". Author: Ambrovia Growth Agent. Artifact: structured summary — what's changing (test→live keys), why (Pro launch next Monday), impact (real charges begin), rollback plan (revert to test keys via env var), checks passed (webhook signature verified, idempotency tested).
- **Content preview:** Subject: "Ambrovia launch blog post — final draft". Author: Ambrovia Writer. Artifact: rendered blog post (1,200 words), metadata sidebar showing word count, target audience (project managers), publish date, SEO keywords.
- **Visual comparison:** Subject: "Acme dashboard redesign — before/after". Author: Acme Frontend Builder. Artifact: side-by-side screenshots of the old and new `/dashboard` route; highlighted region shows the revised KPI strip.
- **Data metrics:** Subject: "Ambrovia onboarding funnel — week 3 rollup". Author: Ambrovia Analytics Agent. Artifact: period metrics table — activation rate 68% (+12pp), step-3 drop-off down to 14%, exceptions: zero completions on Safari iOS (filed as bug).

## Chat threads

- "Quick question about Acme's data retention policy before I draft the privacy page — do we keep deal data after the subscription ends?" — from Acme Writer to Founder.
- "I noticed three of our recent Ambrovia bets all hit the same auth issue — want to talk about it?" — from Ambrovia Product Manager to Founder.
- "I'm stuck — Coolify deploy keeps timing out. The webhook signing keys might be wrong. Can you check?" — from Acme Backend Builder to Founder.

## Sidebar ambient indicators

- Bets: "Acme: Pricing overhaul — 4/7 tasks done · week 3 of 6" | "Ambrovia: Onboarding v2 — 1/4 tasks done · week 1 of 4"
- Blocked: "2 agents blocked" → "Acme Backend Builder: waiting on Stripe API keys (3h)" | "Ambrovia Frontend Builder: waiting on review verdict (45min)"
- Knowledge triage badge: "+8 new items this week"
- System: "6 agents active · 0 failures · 0 conflicts"

## Bet examples (Work)

Rendered by `BetCard` (`framework/design-system/src/BetCard.tsx`); created via `WorkBetCreate` (`layers/core-ui/src/pages/WorkBetCreate.tsx`). Statuses come from the [bet lifecycle](../process-layer/bets-shape-commit-change-ship.md) enum (`draft | active | completed | killed`).

- Title: "Search results relevance (ranking overhaul)". Team: Acme. Status: draft. Body (markdown): the shaped bet — problem statement, proposed solution sketch, rabbit holes to avoid, what "done" means.
- Title: "Onboarding v2 — guided setup flow". Team: Ambrovia. Status: active.

## Knowledge items

Scopes and fields match the real schema: scope kinds `practice`/`product`/`factory` ∈ `SCOPE_KINDS` (`framework/domain-model/src/types.ts`); `status` sits on `knowledge_items` (`framework/db/src/schema.ts`), `kind` and `confidence` on the `knowledge_app_projection` extension table (`framework/db/src/schema.ts`). Statuses map to the Triage (draft) and Curated (active) tabs.

- Practice scope, building practice, topic "file-handling": Title: "Chunked upload for files >10MB". Kind: pattern. Status: active. Confidence: 0.85. Preview: "Use 2MB chunks for multipart uploads on memory-constrained hosts (Coolify free tier). 5MB chunks cause OOM — see anti-pattern."
- Practice scope, building practice, topic "authentication": Title: "JWT rotation patterns for multi-tenant SaaS". Kind: pattern. Status: provisional. Preview: "Rotate signing keys every 90 days. Store previous key for 7 days to allow graceful token expiry."
- Practice scope, building practice, topic "authentication": Title: "Large JWT payloads in cookies". Kind: anti_pattern. Status: active. Preview: "Don't embed full user profiles in JWTs — cookie size limits cause silent auth failures on Safari."
- Product scope, Acme, topic "pricing": Title: "Margin calculation rounding decision". Kind: decision. Status: active. Preview: "Round to four decimal places per contract terms. Nearest-cent rounding was rejected — see review thread."
- Factory scope: Title: "Ship daily, review weekly". Kind: principle. Status: active. Preview: "Agents ship continuously. Humans review in weekly batches. Never block a deploy for a non-blocking review."
