// knowledge-data.jsx — Knowledge base content

const KB_SCOPES = {
  practice: {
    label: 'Practice',
    description: 'Craft knowledge shared across products. Patterns, anti-patterns, decisions.',
    topics: [
      {
        id: 'building',
        name: 'Building',
        items: 42,
        stale: 3,
        health: 'stable',
        subtopics: [
          { id: 'auth',       name: 'Authentication & sessions', items: 8, stale: 2, health: 'degraded' },
          { id: 'caching',    name: 'Caching strategies',         items: 6, stale: 0, health: 'stable' },
          { id: 'testing',    name: 'Testing practices',          items: 7, stale: 1, health: 'stable' },
          { id: 'deploys',    name: 'Deploys & rollbacks',        items: 5, stale: 0, health: 'stable' },
          { id: 'migrations', name: 'Data migrations',            items: 4, stale: 0, health: 'stable' },
          { id: 'observability', name: 'Observability',           items: 6, stale: 0, health: 'stable' },
          { id: 'state',      name: 'State & persistence',        items: 6, stale: 0, health: 'stable' },
          { id: 'api_shape',  name: 'API shape',                  items: 0, stale: 0, health: 'gap' },
        ]
      },
      { id: 'growth',       name: 'Growth',       items: 28, stale: 4, health: 'degraded' },
      { id: 'product',      name: 'Product',      items: 31, stale: 1, health: 'stable' },
      { id: 'ops',          name: 'Ops',          items: 19, stale: 0, health: 'stable' },
      { id: 'facilitation', name: 'Facilitation', items: 14, stale: 2, health: 'stable' },
    ]
  },
  product: {
    label: 'Product',
    description: 'Per-product knowledge: briefs, architecture, decisions, learnings.',
    topics: [
      { id: 'ambrovia', name: 'Ambrovia',  items: 22, stale: 2, health: 'stable' },
      { id: 'nimmly',   name: 'Nimmly',    items: 18, stale: 3, health: 'degraded' },
      { id: 'hyperidle',name: 'HyperIdle', items: 31, stale: 1, health: 'stable' },
      { id: 'pulse',    name: 'Pulse',     items: 9,  stale: 0, health: 'stable' },
    ]
  },
  factory: {
    label: 'Factory',
    description: 'The constitution. Changes here reshape every agent.',
    topics: [
      { id: 'principles', name: 'First principles', items: 5, stale: 0, health: 'stable' },
      { id: 'cadence',    name: 'Cadence',          items: 3, stale: 0, health: 'stable' },
      { id: 'routing',    name: 'Routing rules',    items: 2, stale: 0, health: 'stable' },
      { id: 'values',     name: 'Values',           items: 2, stale: 0, health: 'stable' },
    ]
  }
};

// Building practice items (3 topics expanded)
const KB_BUILDING = {
  auth: {
    name: 'Authentication & sessions',
    count: 8,
    stale: 2,
    items: [
      { id: 'kb-a1', title: 'Prefer opaque tokens over JWT for session state', kind: 'pattern', status: 'active', time: 'Mar 22', preview: 'Opaque tokens with server-side store avoid token-revocation theatre and shrink payload size.', access: 34 },
      { id: 'kb-a2', title: 'Never store refresh tokens in localStorage', kind: 'anti_pattern', status: 'active', time: 'Mar 18', preview: 'XSS + long-lived credential = one compromised dep breaks every user. Use httpOnly cookies.', access: 28 },
      { id: 'kb-a3', title: 'SSO via WorkOS, not direct SAML', kind: 'decision', status: 'active', time: 'Mar 09', preview: 'The cost of a single SAML integration eclipses the WorkOS annual fee at our volume.', access: 19 },
      { id: 'kb-a4', title: 'JWT rotation every 15 minutes — the outage', kind: 'failure', status: 'stale', time: 'Feb 04', preview: 'Aggressive rotation saturated the refresh endpoint during cold-start. Reverted to 1h.', access: 7 },
      { id: 'kb-a5', title: 'How we roll out session-layer changes', kind: 'reflection', status: 'stale', time: 'Jan 28', preview: 'Flag-gated, cohort-based, with a kill switch. Two cycles of soak time before full rollout.', access: 5 },
    ]
  },
  caching: {
    name: 'Caching strategies',
    count: 6,
    stale: 0,
    items: [
      { id: 'kb-c1', title: 'Cache at the edge for read-heavy personalization', kind: 'pattern', status: 'active', time: 'Mar 30', preview: 'Stale-while-revalidate at the CDN eats 94% of personalization reads without consistency cost.', access: 42 },
      { id: 'kb-c2', title: 'Why we dropped Redis for per-request memoization', kind: 'decision', status: 'active', time: 'Mar 12', preview: 'Local per-request memos covered 80% of what we used Redis for. Network cost > benefit.', access: 24 },
      { id: 'kb-c3', title: 'Cache keys must include the permission scope', kind: 'pattern', status: 'active', time: 'Feb 26', preview: 'Leaked data one cycle when an admin key was served to a member. Scope goes in the key.', access: 31 },
    ]
  },
  testing: {
    name: 'Testing practices',
    count: 7,
    stale: 1,
    items: [
      { id: 'kb-t1', title: 'Integration tests only for critical paths', kind: 'principle', status: 'active', time: 'Mar 14', preview: 'The graveyard of full-coverage integration suites is deep. Five paths, run every commit.', access: 18 },
      { id: 'kb-t2', title: 'Snapshot tests hide bugs they should catch', kind: 'anti_pattern', status: 'active', time: 'Feb 20', preview: 'Any diff becomes "update the snapshot." Signal-to-noise is catastrophic.', access: 22 },
      { id: 'kb-t3', title: 'Property-based tests for state machines', kind: 'pattern', status: 'provisional', time: 'Mar 28', preview: 'Fast-check + hypothesis-style generators find bugs no example-based test would hit.', access: 11 },
      { id: 'kb-t4', title: 'Agent-authored tests need human proof-read', kind: 'reflection', status: 'captured', time: 'Mar 31', preview: 'Agent tests pass by construction — they test the implementation, not the spec.', access: 3 },
    ]
  }
};

// Triage view items (needs attention across all topics)
const KB_TRIAGE = [
  { id: 'kb-tri1', title: 'JWT rotation every 15 minutes — the outage', kind: 'failure', status: 'stale', topic: 'Auth', score: 92, reason: '3× access rate drop · similar items merged in last cycle', time: 'Feb 04' },
  { id: 'kb-tri2', title: 'Our stance on GraphQL for internal APIs', kind: 'decision', status: 'stale', topic: 'API shape', score: 88, reason: 'Contradicted by current practice · last edited 4 months ago', time: 'Dec 14' },
  { id: 'kb-tri3', title: 'Brief: Nimmly onboarding redesign', kind: 'brief', status: 'stale', topic: 'Nimmly', score: 81, reason: 'Bet shipped, brief never updated with learnings', time: 'Jan 18' },
  { id: 'kb-tri4', title: 'Agent-authored tests need human proof-read', kind: 'reflection', status: 'captured', topic: 'Testing', score: 74, reason: 'In captured state 14d · no review yet', time: 'Mar 31' },
  { id: 'kb-tri5', title: 'Pricing experimentation — stopping rules', kind: 'pattern', status: 'provisional', topic: 'Growth', score: 68, reason: '3 recent agent proposals reference this with different interpretations', time: 'Mar 21' },
  { id: 'kb-tri6', title: 'Why we killed the collaborative inbox bet', kind: 'failure', status: 'captured', topic: 'Tessera', score: 61, reason: 'Hot item — 12 access events last week, still in captured state', time: 'Apr 02' },
];

// Curation suggestion
const KB_SUGGESTION = {
  label: 'Curation suggestion',
  title: '3 JWT items losing relevancy — consider merging',
  text: 'Items below reference JWT rotation but three now contradict current practice. Merging into a single "Session rotation" item would cut access confusion by ~60%.',
  refs: ['kb-a2', 'kb-a4', 'kb-a5'],
};

// Full detail — Recipe adaptation item
const KB_DETAIL_ITEM = {
  id: 'kb-c1',
  title: 'Cache at the edge for read-heavy personalization',
  kind: 'pattern',
  status: 'active',
  scope: 'Practice',
  topic: 'Caching strategies',
  confidence: 0.82,
  lastEdited: 'Mar 30 · 16:40',
  editor: 'Rishi',
  access: 42,
  origin: 'Agent KM',
  body: [
    { type: 'h2', text: 'The pattern' },
    { type: 'p', text: <>For reads that are <strong>personalized but mostly-static</strong>, cache at the CDN edge with <code>stale-while-revalidate</code>. Key the cache on (user_segment, locale, experiment_bucket) — not on user_id. Invalidate via tag purge when the underlying content changes.</> },
    { type: 'h3', text: 'When to use' },
    { type: 'ul', items: [
      'Recommendation feeds (Ambrovia, Nimmly)',
      'Pricing page with experiment bucketing',
      'Landing pages with geo-based copy',
      'Any read that would fan out to >2 backend calls and is per-cohort, not per-user',
    ]},
    { type: 'h3', text: 'When not to' },
    { type: 'ul', items: [
      'Anything authenticated at the user level (cart, inbox, settings)',
      'Reads that depend on consistency with a write the user just made',
      'Payment / billing surfaces — always origin',
    ]},
    { type: 'h2', text: 'The numbers' },
    { type: 'p', text: <>On Ambrovia\'s recommendation feed, edge caching eats <strong>94.2%</strong> of personalization reads. P95 TTFB dropped from 340ms to 28ms. Cost on the backend dropped from ~$1.2K/day to $180/day.</> },
    { type: 'pre', code: 'GET /recommendations\nCache-Control: public, max-age=0, s-maxage=60, stale-while-revalidate=600\nVary: Cookie-User-Segment, Accept-Language, Cookie-Exp-Bucket' },
    { type: 'h2', text: 'Known failure modes' },
    { type: 'ol', items: [
      'Permission scope must be in the key. See "Cache keys must include the permission scope" (kb-c3).',
      'Segments with fewer than 50 users cache poorly — poison the segment schema, not the cache.',
      'Experiment buckets with very short lifespans generate cache misses faster than hits. Gate experiments on segment stability.',
    ]},
    { type: 'blockquote', text: 'The cache is not a correctness mechanism. If a hit would be wrong, don\'t cache — fix the hot path.' },
  ],
  observations: [
    { time: 'Mar 31', agent: 'FN', text: 'Referenced in 8 agent decisions this week (Ambrovia rec feed, Nimmly landing, HyperIdle login).' },
    { time: 'Mar 28', agent: 'FN', text: 'Access rate up 3× after Rishi\'s Mar 27 edit. Title clarification is landing.' },
    { time: 'Mar 22', agent: 'FN', text: 'Contradicts an older note in Ambrovia/architecture. Flagged for merge-or-split review.' },
  ],
  history: [
    { time: 'Mar 30', who: 'RN', change: 'Added "When not to" section with 3 entries', diff: '+12 lines' },
    { time: 'Mar 27', who: 'RN', change: 'Retitled from "Edge caching for reads" → "Cache at the edge for read-heavy personalization"', diff: 'title' },
    { time: 'Mar 14', who: 'Agent KM', change: 'Initial capture from bet retro — Ambrovia rec feed', diff: '+48 lines' },
    { time: 'Mar 09', who: 'MA', change: 'Promoted from captured → active after cross-product review', diff: 'status' },
  ],
  related: [
    { id: 'kb-c3', title: 'Cache keys must include the permission scope', kind: 'pattern', score: 0.91 },
    { id: 'kb-c2', title: 'Why we dropped Redis for per-request memoization', kind: 'decision', score: 0.78 },
    { id: 'kb-a1', title: 'Prefer opaque tokens over JWT for session state', kind: 'pattern', score: 0.62 },
    { id: 'kb-o2', title: 'SWR vs ISR — the cost curve', kind: 'reflection', score: 0.58 },
  ],
  linked: [
    { id: 'bet-a1', title: 'Recipe adaptation engine', kind: 'BET' },
    { id: 'kb-o1', title: 'Ambrovia · architecture overview', kind: 'REFERENCE' },
  ],
};

// Merge modal source items
const KB_MERGE_SOURCES = [
  { id: 'kb-a2', title: 'Never store refresh tokens in localStorage', kind: 'anti_pattern', time: 'Mar 18', access: 28, selected: true },
  { id: 'kb-a4', title: 'JWT rotation every 15 minutes — the outage', kind: 'failure', time: 'Feb 04', access: 7 },
  { id: 'kb-a5', title: 'How we roll out session-layer changes', kind: 'reflection', time: 'Jan 28', access: 5 },
];

// Merge preview (A = current, B = selected)
const KB_MERGE_PREVIEW = {
  title: 'Session rotation — what we learned',
  lines: [
    { side: 'A', content: 'Opaque tokens with server-side store avoid token-revocation theatre.' },
    { side: 'A', content: 'Refresh tokens in httpOnly cookies, not localStorage.' },
    { side: 'B', content: 'Aggressive 15-minute rotation saturated the refresh endpoint during cold-start (Feb 04 incident).' },
    { side: 'B', content: 'Reverted to 1-hour rotation after 4 days of degraded latency.' },
    { side: 'new', content: 'Synthesis: prefer opaque tokens with 1h rotation, httpOnly storage, server-side revocation list.' },
  ]
};

// Factory scope — the constitution
const FACTORY_CONSTITUTION = [
  {
    number: '§ 01',
    title: 'Founders review; agents execute',
    kind: 'principle',
    preview: 'Every agent proposal routes to a named founder. No merge without explicit review. This is the only rule that cannot be changed by an agent.',
    time: 'Feb 04, 2025',
  },
  {
    number: '§ 02',
    title: 'One bet per product per cycle',
    kind: 'principle',
    preview: 'Six-week cycles. Hard cap of three active bets across the portfolio. Capacity is a physical limit, not a suggestion.',
    time: 'Feb 04, 2025',
  },
  {
    number: '§ 03',
    title: 'Domain ownership — routing rules',
    kind: 'principle',
    preview: 'Max: growth, billing, strategic bets. Kieran: infra, security, deploys. Rishi: product, design, voice. Agents route by domain, not by author.',
    time: 'Feb 11, 2025',
  },
  {
    number: '§ 04',
    title: 'Quiet by default',
    kind: 'principle',
    preview: 'No toasts. No bell icons. The Rail is the only surface for notifications. If it is not on the Rail, it is not interrupting a human.',
    time: 'Feb 14, 2025',
  },
  {
    number: '§ 05',
    title: 'Agents archive their own work',
    kind: 'principle',
    preview: 'An agent that ships a bet captures the brief, the retrospective, and any reusable patterns. No human does this archival pass.',
    time: 'Feb 18, 2025',
  },
  {
    number: '§ 06',
    title: 'Kill bets between cycles, never mid-cycle',
    kind: 'principle',
    preview: 'A running bet has momentum. Stop it only at the cool-down seam. Mid-cycle "kill" requests are logged and re-examined at cycle end.',
    time: 'Mar 03, 2025',
  },
];

Object.assign(window, {
  KB_SCOPES, KB_BUILDING, KB_TRIAGE, KB_SUGGESTION,
  KB_DETAIL_ITEM, KB_MERGE_SOURCES, KB_MERGE_PREVIEW,
  FACTORY_CONSTITUTION,
});
