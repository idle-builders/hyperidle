// data.jsx — realistic sample data for HyperIdle

const THREADS = [
  { id: 't1', initials: 'AR', bot: true, title: 'Pricing experiment results', caption: 'Variant B lifted conversion 12.4%. Recommending rollout.', status: 'healthy', time: '4m', product: 'Orbit', needsReview: true },
  { id: 't2', initials: 'RN', bot: true, title: 'Onboarding copy v3', caption: 'Three variants attached. Needs founder sign-off before ship.', status: 'behind', time: '22m', product: 'Tessera', needsReview: true },
  { id: 't3', initials: 'KM', bot: true, title: 'Stripe webhook retry logic', caption: 'Blocked on infra decision — use queue or in-process?', status: 'blocked', time: '1h', product: 'Orbit', needsReview: true },
  { id: 't4', initials: 'SV', bot: true, title: 'Weekly growth digest', caption: 'Orbit +8.2%, Tessera −1.1%, Loom +14%. Full breakdown inside.', status: 'healthy', time: '3h', product: 'Portfolio' },
  { id: 't5', initials: 'MA', bot: false, title: 'Re: Q2 bet allocation', caption: 'I think we should double down on Loom. Numbers support it.', status: 'paused', time: '5h', product: null },
  { id: 't6', initials: 'RN', bot: true, title: 'A11y audit — Tessera dashboard', caption: '14 issues found. 3 critical, 11 minor. PR ready for review.', status: 'behind', time: '8h', product: 'Tessera' },
  { id: 't7', initials: 'AR', bot: true, title: 'Churn cohort analysis', caption: 'Month-2 churn spike isolated to free→pro upgrades. Hypothesis attached.', status: 'healthy', time: '14h', product: 'Loom' },
  { id: 't8', initials: 'KM', bot: true, title: 'Deploy rollback — prod-us-east', caption: 'Reverted to v2.14.1. Post-mortem scheduled.', status: 'done', time: '1d', product: 'Orbit' },
  { id: 't9', initials: 'SV', bot: true, title: 'Competitor teardown: Notable', caption: 'They shipped agent threading. Our differentiation analysis attached.', status: 'healthy', time: '1d', product: 'Portfolio' },
  { id: 't10', initials: 'MA', bot: false, title: 'Cursor for the factory?', caption: 'Thinking about a meta-tool we build for ourselves.', status: 'paused', time: '2d', product: null },
];

const BETS = [
  { id: 'b1', product: 'Orbit', title: 'Self-serve team billing', status: 'healthy', progress: 72, owner: 'MA', tone: 'primary' },
  { id: 'b2', product: 'Orbit', title: 'AI-assisted workflow builder', status: 'behind', progress: 38, owner: 'SV', tone: 'warn' },
  { id: 'b3', product: 'Tessera', title: 'Collaborative inbox', status: 'healthy', progress: 55, owner: 'RN', tone: 'primary' },
  { id: 'b4', product: 'Tessera', title: 'Granular permissions', status: 'blocked', progress: 22, owner: 'KM', tone: 'danger' },
  { id: 'b5', product: 'Loom', title: 'Usage-based pricing', status: 'healthy', progress: 88, owner: 'MA', tone: 'ok' },
  { id: 'b6', product: 'Loom', title: 'Zapier + Make integrations', status: 'paused', progress: 15, owner: 'AR', tone: 'primary' },
];

const PITCHES = [
  { id: 'p1', kind: 'Pitch', title: 'Founder-routed approvals', appetite: '2 weeks', status: 'healthy' },
  { id: 'p2', kind: 'Pitch', title: 'Agent performance scorecards', appetite: '6 weeks', status: 'healthy' },
  { id: 'p3', kind: 'Bet', title: 'Rip out legacy export pipeline', appetite: '6 weeks', status: 'behind' },
  { id: 'p4', kind: 'Pitch', title: 'Cross-product knowledge graph', appetite: 'Unscoped', status: 'paused' },
];

const TASKS = {
  todo: [
    { id: 'k1', title: 'Spec the router taxonomy', status: 'healthy', bet: 'Orbit', owner: 'MA' },
    { id: 'k2', title: 'Draft upgrade email for cohort 14', status: 'paused', bet: 'Loom', owner: 'SV' },
    { id: 'k3', title: 'Add rate limit to public API', status: 'healthy', bet: 'Orbit', owner: 'KM' },
  ],
  doing: [
    { id: 'k4', title: 'Refactor inbox realtime layer', status: 'behind', bet: 'Tessera', owner: 'RN' },
    { id: 'k5', title: 'Ship pricing experiment variant B', status: 'healthy', bet: 'Orbit', owner: 'AR' },
  ],
  review: [
    { id: 'k6', title: 'A11y fixes — dashboard', status: 'healthy', bet: 'Tessera', owner: 'RN' },
    { id: 'k7', title: 'Webhook retry queue', status: 'blocked', bet: 'Orbit', owner: 'KM' },
    { id: 'k8', title: 'Q2 allocation memo', status: 'behind', bet: null, owner: 'MA' },
  ],
  done: [
    { id: 'k9', title: 'Post-mortem — us-east', status: 'done', bet: 'Orbit', owner: 'KM' },
    { id: 'k10', title: 'Churn analysis report', status: 'done', bet: 'Loom', owner: 'AR' },
  ],
};

const KNOWLEDGE = [
  { id: 'kb1', title: 'How we make bets', category: 'Principles', caption: 'Six-week cycles, founder-owned, one bet per cycle per product.', time: 'Mar 14' },
  { id: 'kb2', title: 'Agent review protocol', category: 'Process', caption: 'Every agent proposal routes to the domain founder. No merge without review.', time: 'Mar 09' },
  { id: 'kb3', title: 'Orbit — architecture overview', category: 'Product', caption: 'Event-sourced core, Postgres + Redis, Temporal for workflows.', time: 'Feb 28' },
  { id: 'kb4', title: 'Tessera — voice and tone', category: 'Brand', caption: 'Precise, quiet, never cute. Avoid exclamation points.', time: 'Feb 22' },
  { id: 'kb5', title: 'Loom — pricing rationale', category: 'Strategy', caption: 'Why we moved from per-seat to usage-based in Q4.', time: 'Feb 18' },
  { id: 'kb6', title: 'Founder split by domain', category: 'Principles', caption: 'MA: growth + bets. KM: infra + security. RN: product + design.', time: 'Feb 10' },
  { id: 'kb7', title: 'When to kill a bet', category: 'Process', caption: 'Three signals, all founder-observed. Never mid-cycle.', time: 'Feb 04' },
];

const NOTIFICATIONS = {
  blocked: [
    { id: 'n1', status: 'blocked', summary: 'Stripe webhook handler stuck on infra decision. Needs founder pick: queue or in-process.', source: 'Orbit', time: '12m', action: { label: 'Resolve', primary: true } },
    { id: 'n2', status: 'blocked', summary: 'SSO rollout halted — waiting on legal review of SAML metadata.', source: 'Tessera', time: '1h', action: { label: 'Open thread' } },
    { id: 'n3', status: 'error', summary: 'Agent RN failed to merge PR #4421. Conflict unresolved after 3 retries.', source: 'Tessera', time: '2h', action: { label: 'Inspect', primary: true } },
  ],
  cost: [
    { id: 'n4', status: 'behind', summary: 'Agent compute over budget this cycle: $8,420 / $6,000.', source: 'Portfolio', time: '4h', action: { label: 'Review' } },
    { id: 'n5', status: 'behind', summary: 'Orbit OpenAI usage projected 2.4× last cycle. Anomaly flagged.', source: 'Orbit', time: '6h' },
  ],
  unread: [
    { id: 'n6', status: 'healthy', summary: 'Pricing experiment B ready for rollout. 12.4% conversion lift.', source: 'Orbit', time: '4m', action: { label: 'Approve', primary: true } },
    { id: 'n7', status: 'healthy', summary: 'Weekly digest compiled: Portfolio +7.1% net MRR.', source: 'Portfolio', time: '3h' },
    { id: 'n8', status: 'behind', summary: 'Onboarding copy v3 past founder-review SLA (22m over).', source: 'Tessera', time: '22m', action: { label: 'Review', primary: true } },
    { id: 'n9', status: 'healthy', summary: 'Agent SV finished churn cohort analysis. Hypothesis attached.', source: 'Loom', time: '14h' },
  ],
};

const REVIEW_THREAD = {
  title: 'Pricing experiment results — variant B',
  subtitle: 'Agent AR is proposing rollout of the $29/mo starter tier. Needs your approval.',
  meta: [
    { label: 'Owner', value: 'Agent AR · Orbit' },
    { label: 'Routed to', value: 'MA (Growth)' },
    { label: 'Bet', value: 'Self-serve team billing' },
    { label: 'SLA', value: '4h remaining' },
  ],
  messages: [
    {
      id: 'm1', author: 'Agent AR', bot: true, initials: 'AR', time: '09:42',
      body: [
        { kind: 'p', text: <>Ran the pricing experiment for <strong>14 days</strong> across the US-EN segment. Variant B (<code>$29/mo</code> starter + usage caps) outperformed control across every cohort.</> },
        { kind: 'p', text: <>Conversion +12.4%, ARPU +$7.10, churn flat. Confidence 97%. Full report in the <Tag variant="kind">knowledge</Tag> article I just filed.</> },
      ],
      proposal: {
        title: 'Proposal — roll out Variant B to 100% of new signups',
        grid: [
          { label: 'Conversion', value: '+12.4%' },
          { label: 'ARPU', value: '+$7.10' },
          { label: 'Confidence', value: '97%' },
        ],
        diff: [
          { kind: 'rem', text: '- starter: $19/mo — unlimited workspaces' },
          { kind: 'add', text: '+ starter: $29/mo — 3 workspaces, $2/extra' },
          { kind: 'add', text: '+ grandfathered: all existing paid plans preserved' },
        ],
      },
    },
    {
      id: 'm2', author: 'Max (you)', bot: false, initials: 'MA', time: '09:58',
      body: [
        { kind: 'p', text: <>Nice lift. One thing — did you segment by self-serve vs. sales-assisted? I don't want to blow up the enterprise funnel on the way to a starter win.</> },
      ],
    },
    {
      id: 'm3', author: 'Agent AR', bot: true, initials: 'AR', time: '10:02',
      body: [
        { kind: 'p', text: <>Yes. Enterprise funnel is untouched — variant B only applies to self-serve (<code>source=web</code>). Sales-assisted keeps the existing quote flow. Attached a split view to the proposal.</> },
      ],
    },
    {
      id: 'm4', author: 'Rishi', bot: false, initials: 'RN', time: '10:14',
      body: [
        { kind: 'p', text: <>Copy on the pricing page needs a pass before we ship — current version says "unlimited workspaces" in three places. I'll take it, should have v1 in an hour.</> },
      ],
    },
  ],
};

Object.assign(window, { THREADS, BETS, PITCHES, TASKS, KNOWLEDGE, NOTIFICATIONS, REVIEW_THREAD });
