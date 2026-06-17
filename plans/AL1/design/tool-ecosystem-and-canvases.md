# AL1 — Tool ecosystem + the review-canvas architecture

Companion to `spectrum-review-needs.md`. Ground-truth scan (2026-06-17, cited, web-wary) of the tools an agent operates underneath per function, their agentic/MCP reach, and how tool-tailored + community + tool-shipped review canvases can work. **The reframing finding is §3 (MCP Apps).**

---

## 0. The one-line model
**A review canvas = (proof family) × (tool identity).** The proof family decides the *shape* of the review element; the tool decides the *data + the logo*. The whole "review for anything" surface is a **small set of canvas types** (one per proof family) auto-selected from the tool + its result, branded with the tool's mini-logo, and **extensible** (community- or tool-shipped) for the long tail.

---

## 1. The canvas-type taxonomy (proof family = canvas type)
The six function studies converge on the *same* seven canvas types. This is the core simplification — build ~7 well, cover everything.

| Canvas type | What it renders | Tools that emit it (sample) | Functions |
|---|---|---|---|
| **Record / field change-set** | per-record before→after field grid, select-to-approve, unchanged collapsed | Salesforce, HubSpot, Stripe, Airtable, Linear/Jira, Zendesk fields, QuickBooks/Xero, NetSuite | **all six** — the most universal |
| **Rendered-in-context** | the asset as its recipient sees it: email-in-inbox, proposal/contract, KB article, ticket reply, Notion/Webflow page | Klaviyo/Mailchimp, PandaDoc/DocuSign, Intercom/Front/Zendesk, Notion, Webflow/WordPress | Mktg · Sales · Support · Product(docs) |
| **Action / operation** | what it will DO + amount + blast-radius + reversibility/undo + exceptions; a staged pre-commit receipt | Stripe refund, Ramp/Brex bill-pay, NetSuite PO, ShipStation labels, Zapier/Make runs, deploy | Finance · Ops · Sales(send) · Product(deploy) |
| **Metrics-that-moved / data-diff** | the figures that changed — deltas, changed cells, tie-out, time-series with a deploy/refresh marker, materiality/relevance-ordered, traceable | GA4, Sentry/Datadog, Snowflake/BigQuery, finance models, pipeline numbers | Finance · Product · Mktg · Ops · Sales |
| **Visual before→after** | design frame vs implemented result, ad-in-placement, UI screen, bug repro | Figma, Canva, Meta Ads | Product · Mktg |
| **Code diff** | syntax-highlighted, file-grouped, relevance-ranked hunks (logic→tests→generated), inline anchors, CI/checks inline | GitHub, GitLab, Retool queries | **Product (must-win)** + Ops(SQL) |
| **Batch / per-item** *(container)* | N items relevance-sorted, routine collapsed to "N like this", samples expanded, approve-all-except-flagged | Apollo/Outreach sequences, support triage, Airtable bulk, AP/AR batches | **all six** |

Each wraps the function-agnostic **frame** (outcome-summary → intent/done-conditions → needs-you → [canvas] → rationale/assumptions → provenance → conversation → verdict+cost). **Code-diff is a must-win** even though it's opened least — AI tooling is strongest in code; fail there and you fail the market.

---

## 2. Tool ecosystem per function — the verified state (mid-2026)
The 2025-26 vendor MCP land-grab is real: **most major SaaS now ships a first-party MCP**, verified on vendor domains. Discount the swarm of community GitHub servers. MVP set + the traps per function (full per-domain tables in the agent research / conversation):

- **Product:** GitHub (official remote MCP — flagship code-diff) · Linear|Jira (official — field-change-set) · Sentry (official GA — metrics) · Notion (official — rendered). Figma (official but **local-only/beta**) = fast-follow for visual. *Traps: `@modelcontextprotocol/server-github` is archived; Datadog/Vercel/Figma official-but-preview.*
- **Sales:** HubSpot · Salesforce (both official — field-change-set) · Apollo (official — batch) · PandaDoc|DocuSign (official — rendered proposal). *Traps: Gong = partner-gated inbound, not self-serve; LinkedIn Sales Nav = NO MCP, partner-only, scraping banned (compliance trap).*
- **Marketing:** GA4 (official read-only — metrics) · HubSpot · Klaviyo|Mailchimp (official — email render) · Meta Ads (official, **PAUSED-by-default** = natural gate) · Buffer (official — social). *Traps: Google Ads MCP is experimental/community (repo self-disclaims "official"); Ahrefs GitHub repo deprecated; only Mailchimp **Transactional** is first-party.*
- **Finance:** Stripe (official `mcp.stripe.com` — action) · QuickBooks (official, local, **no release yet**) · Ramp|Brex (official — action) · Carta (official, in Anthropic directory — rendered cap table). *Traps: **Plaid MCP = dashboard diagnostics only, NOT financial data**; Bill.com = community MCP only; NetSuite official but self-configured.*
- **Support:** Intercom (official — reply render + KB) · **Zendesk (NO vendor MCP — use REST API; "Zendesk MCP" hits are all 3rd-party/PII-risk)** · Front (official beta — reply, `send_reply` flagged destructive) · Linear (escalation) · Slack (official GA). *Trap: Zendesk ships an MCP **client**, not a server; Gladly = no agentic surface.*
- **Operations:** Airtable (official GA — change-set) · Snowflake|BigQuery (official — data-diff) · NetSuite (official — action/PO) · Notion (rendered) · **Zapier MCP (official, 9k apps — the long-tail broker)**. *Traps: SAP = customer-built gateway, no turnkey; Google Sheets NOT in Google's official Workspace MCP; Rippling/Gusto = 3rd-party MCP only.*

**Cross-function MVP:** ~12 tools (GitHub, Linear, Sentry, Notion, HubSpot, Salesforce, Stripe, Airtable, a warehouse, Intercom, Klaviyo, + Zapier for the tail) exercise **all seven canvas types** against official MCPs.

---

## 3. THE reframing finding — tools can ship their own review canvas (MCP Apps)
**MCP Apps shipped as the first *official* MCP extension on 2026-01-26.** A tool/MCP-server can return a `ui://` resource (sandboxed HTML/JS), the host renders it **in a sandboxed iframe** with a **JSON-RPC-over-postMessage bridge**, and — critically — the app can **request an action and the host routes it through the user's already-connected capabilities** (it doesn't re-implement integrations). OpenAI's **Apps SDK** (Oct 2025, ChatGPT) and **MCP-UI** (Shopify-pioneered) have **converged onto this same standard**. Microsoft **Adaptive Cards** is the declarative-only sibling (host renders JSON). (AG-UI, Vercel RSC = in-app/vendor techniques, not the interop standard.)

→ The host-routes-the-action model **maps exactly onto HyperIdle's review→act loop**: a tool ships its refund/PR/deal canvas, the reviewer acts on it, the verdict routes back through HyperIdle's connected tools.

### HyperIdle canvas strategy (the recommended blend)
1. **Built-in TSX canvases per proof family (the floor).** Ship the ~7 canvas types as Hearth-native design-system components. Highest quality, on-brand, zero trust problem. **This is what we design/prototype now.**
2. **Tool-shipped via MCP Apps (the strategic bet).** HyperIdle already speaks MCP — adopt MCP Apps so a Stripe/GitHub/Figma server can ship its own canvas in a sandboxed iframe; route canvas actions back through the user's tools. Shipped standard tech, not a research bet.
3. **Community-contributed via a manifest + registry (the long tail).** A canvas *package* = a manifest (which tool/proof-family + field bindings + logo + render spec), distributed via a **two-tier registry à la HACS** (vetted "default" + add-your-own "custom" at your own risk). Prefer **declarative render (Adaptive-Card/Block-Kit JSON)** over arbitrary JS (the HA-custom-card "no sandbox, real CVEs" lesson); if custom code, run it in the **same sandboxed iframe** MCP Apps provides — one render substrate, two authoring paths.

**Minimal canvas manifest** (what an author declares): `tool` + `proofFamily` (auto-selects the canvas for a tool result) · `match` (toolName/result-schema) · `fields` (result-path → canvas slot, format) · `identity.logo` (domain-keyed, monogram fallback) · `render.kind` (`declarative` JSON | `mcp-app` `ui://` iframe) · `trust.tier` (default | community-sandboxed).

---

## 4. Mini-logo / provider identity (the T3 touch)
Durable pattern: **domain-keyed logo API + CDN + monogram fallback** (Logo.dev — the Clearbit-team successor; Clearbit shut down 2025-12-08 — or Brandfetch for full-color SVG) for the open-ended provider set, **+ bundled `simple-icons` SVGs** for the known fixed set. **Trademark caveat (load-bearing):** the file license never grants trademark rights — render provider logos for *identification* (nominative use), never implying endorsement. The mini-logo anchors each artifact/canvas to its source tool — provenance you can see at a glance.

---

## 5. Implications for the design/prototype (next step)
1. **Prototype the ~7 canvas types as built-in Hearth components**, each = a review element for one proof family, **tool-grounded** (mini-logo + a real tool fixture from §2 / the six flagship scenarios), with proper layering drawn from the reference review experiences (T3 etc.).
2. **Plus the frame entry: the outcome-summary lead** (function-agnostic).
3. Design them as **typed, tool-parameterized** components (proof-family + field-bindings) so the same component renders for every tool in its family — and so the MCP-Apps/community manifest can target them later.
4. Lead the first human-review batch with the **most universal + most vivid** families (record/field-change-set, action-operation, rendered-in-context, metrics-that-moved) + outcome-summary; fast-follow visual-before-after, code-diff (must-win), and the batch container.

→ Next: design + prototype these components for founder human-review.
