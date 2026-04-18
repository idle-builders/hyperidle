# Product Factory OS — v0.1

> Two founders + AI agents = product portfolio company.
> Build many. Kill fast. Keep winners. Shared infrastructure. O(1) cost per product.

---

## The Idea

We're a holding company for small digital products targeting SMEs & side hustlers. AI agents run the product lifecycle. We (CEO + CPO) provide vision, taste, and customer relationships. The factory gets better with every product we ship.

## How We Work

```
┌──────────────────────────────────────┐
│           CEO + CPO                  │
│  Vision · Validation · Customers     │
└──────────────┬───────────────────────┘
               │ approve / reject / steer
               ▼
┌──────────────────────────────────────┐
│           AGENT LAYER                │
│  Research · Build · Market · Sell    │
│  (Paperclip + n8n orchestration)     │
└──────────────┬───────────────────────┘
               │ deploy / query / report
               ▼
┌──────────────────────────────────────┐
│         INFRASTRUCTURE               │
│  Mac Minis · VPS edge · Coolify      │
│  Shared DBs, email, analytics, auth  │
└──────────────────────────────────────┘
```

## Human-in-the-Loop Gates

| Gate | Who | When |
|------|-----|------|
| Idea go/no-go | Both | Before any work starts |
| Architecture & design direction | CPO | Once per product |
| Launch approval | Both | Before going live |
| Monthly portfolio review | CEO | Keep / invest / sunset |
| Customer escalations | CEO/CPO | As needed |

Everything else → agents handle it, async. Agents never block on humans. Decisions queue up. Founders review on their schedule.

## The O(1) Trick

Shared spine. Every product gets for free: hosting (Coolify containers), database (Postgres), analytics (Plausible), email (Listmonk), monitoring (Uptime Kuma), payments (Stripe). Marginal cost of product N+1 ≈ one domain name ($10/yr).

## Current Portfolio

| Product | Status | What |
|---------|--------|------|
| Ambrovia | Live | Team alignment for project work |
| Nimmly | Building | SME M&A analytics |
| HyperIdle | Concept | Agentic project management |
| AI Render Benchmark | Repo exists | Open source framework |
| Agent Ideation | Concept | Miro for AI agents |

## Open Questions (let's solve together)

- [ ] What's our factory brand name?
- [ ] Approval queue: Slack, Telegram, or custom?
- [ ] Agent orchestration: Paperclip-first or n8n-first?
- [ ] What does the product starter template look like?
- [ ] How do we measure agent effectiveness?
- [ ] First product through the full pipeline: Nimmly?

---

*This doc evolves with us. Next: pick a thread and pull it.*
