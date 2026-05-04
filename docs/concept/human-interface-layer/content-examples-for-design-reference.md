## 6. Content Examples (for design reference)

Real examples grounded in the factory's products (Ambrovia — team alignment for project work; Nimmly — SME M&A analytics; HyperIdle — this operating system itself). These show what actual content looks like in each view, so design proposals can be populated with realistic density and tone.

#### Review threads

- **Text diff:** Subject: "Deploy Nimmly pricing-engine v1.4.2 to staging". Author: Nimmly Backend Builder. Artifact: a 40-line diff in `pricing-engine/src/calculate.ts` — changes to margin calculation logic. Inline comment example: "Line 23: this rounds down to the nearest cent, but our contracts specify rounding to four decimal places. Intentional?"
- **Action summary:** Subject: "Enable Stripe live mode for Ambrovia Pro tier". Author: Ambrovia Growth Agent. Artifact: structured summary — what's changing (test→live keys), why (Pro launch next Monday), impact (real charges begin), rollback plan (revert to test keys via env var), checks passed (webhook signature verified, idempotency tested).
- **Content preview:** Subject: "Ambrovia launch blog post — final draft". Author: Ambrovia Writer. Artifact: rendered blog post (1,200 words), metadata sidebar showing word count, target audience (project managers), publish date, SEO keywords.

#### Chat threads

- "Quick question about Nimmly's data retention policy before I draft the privacy page — do we keep deal data after the subscription ends?" — from Nimmly Writer to Founder.
- "I noticed three of our recent Ambrovia bets all hit the same auth issue — want to talk about it?" — from Ambrovia Product Manager to Founder.
- "I'm stuck — Coolify deploy keeps timing out. The webhook signing keys might be wrong. Can you check?" — from Nimmly Backend Builder to Founder.

#### Rail indicators

- Bets: "Nimmly: Pricing overhaul — 4/7 tasks done · week 3 of 6" | "Ambrovia: Onboarding v2 — 1/4 tasks done · week 1 of 4"
- Blocked: "2 agents blocked" → expand → "Nimmly Backend Builder: waiting on Stripe API keys (3h)" | "Ambrovia Frontend Builder: waiting on review verdict (45min)"
- Knowledge: "+8 new items this week"
- Cost: "$42 today / $150 budget · $187 this week / $500 budget"
- System: "6 agents active · 0 failures · 0 conflicts"

#### PitchCard examples (Work)

- Title: "Search results relevance (ranking overhaul)". Product: Nimmly. Appetite: 6 weeks. Body (markdown): the shaped pitch — problem statement, proposed solution sketch, rabbit holes to avoid, what "done" means.
- Title: "Onboarding v2 — guided setup flow". Product: Ambrovia. Appetite: 4 weeks. Status: committed this cycle.

#### Knowledge items

- Practice scope, building practice, topic "file-handling": Title: "Chunked upload for files >10MB". Kind: pattern. Status: active. Confidence: 0.85. Preview: "Use 2MB chunks for multipart uploads on memory-constrained hosts (Coolify free tier). 5MB chunks cause OOM — see anti-pattern."
- Practice scope, building practice, topic "authentication": Title: "JWT rotation patterns for multi-tenant SaaS". Kind: pattern. Status: provisional. Preview: "Rotate signing keys every 90 days. Store previous key for 7 days to allow graceful token expiry."
- Practice scope, building practice, topic "authentication": Title: "Large JWT payloads in cookies". Kind: anti_pattern. Status: active. Preview: "Don't embed full user profiles in JWTs — cookie size limits cause silent auth failures on Safari."
- Product scope, Nimmly, topic "pricing": Title: "Margin calculation rounding decision". Kind: decision. Status: active. Preview: "Round to four decimal places per contract terms. Nearest-cent rounding was rejected — see review thread."
- Factory scope: Title: "Ship daily, review weekly". Kind: principle. Status: active. Preview: "Agents ship continuously. Humans review in weekly batches. Never block a deploy for a non-blocking review."

---
