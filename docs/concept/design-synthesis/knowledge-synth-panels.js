/* knowledge-synth-panels.js — Knowledge synthesis deliverables K1–K4.
 * Panel 1: Curated list (scope browser + topic groups + rows)
 * Panel 2: Triage view (attention-scored + curation card)
 * Panel 3: Detail · read mode
 * Panel 4: Detail · edit mode
 * K5/K6/Critique/Delta live in knowledge-synth-panels-2.js.
 */

/* ───────── icons ───────── */
const KI = {
  know:    '<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h9l3 3v9H4z"/><path d="M13 4v3h3"/></svg>',
  conv:    '<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h14v9H9l-4 3v-3H3z"/></svg>',
  work:    '<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="14" height="10" rx="1"/><path d="M7 6V4h6v2"/></svg>',
  set:     '<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="2.5"/><path d="M10 3v2M10 15v2M3 10h2M15 10h2"/></svg>',
  search:  '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="7" r="4.5"/><path d="m11 11 3 3"/></svg>',
  collapse:'<svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 3v8M10 7h-5M8 5l-3 2 3 2"/></svg>',
  chevR:   '<svg viewBox="0 0 14 14" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m5 3 4 4-4 4"/></svg>',
  chevD:   '<svg viewBox="0 0 14 14" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m3 5 4 4 4-4"/></svg>',
  plus:    '<svg viewBox="0 0 14 14" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M7 2v10M2 7h10"/></svg>',
  edit:    '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 14v-3l8-8 3 3-8 8z"/><path d="M10 3l3 3"/></svg>',
  link:    '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 10a3 3 0 0 1 0-4l2-2a3 3 0 1 1 4 4l-1 1"/><path d="M9 6a3 3 0 0 1 0 4l-2 2a3 3 0 1 1-4-4l1-1"/></svg>',
  merge:   '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="4" cy="4" r="1.5"/><circle cx="4" cy="12" r="1.5"/><circle cx="12" cy="8" r="1.5"/><path d="M5.5 4.5C9 5 11 7 11 8"/><path d="M5.5 11.5C9 11 11 9 11 8"/></svg>',
  split:   '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="4" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="4" cy="8" r="1.5"/><path d="M5.5 7.5C9 7 11 5 11 4"/><path d="M5.5 8.5C9 9 11 11 11 12"/></svg>',
  archive: '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="12" height="3" rx="0.5"/><path d="M3 7v6h10V7"/><path d="M6 9h4"/></svg>',
  dup:     '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="8" height="8" rx="1"/><rect x="5.5" y="5.5" width="8" height="8" rx="1"/></svg>',
  check:   '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3.5 8 3 3 6-6"/></svg>',
  close:   '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
  sparkle: '<svg viewBox="0 0 14 14" width="12" height="12" fill="currentColor"><path d="M7 0l1.2 4.3L12.5 5 8.2 6.2 7 10.5 5.8 6.2 1.5 5l4.3-0.7z"/><path d="M12 10l0.5 1.5L14 12l-1.5 0.5L12 14l-0.5-1.5L10 12l1.5-0.5z"/></svg>',
  dots:    '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><circle cx="4" cy="8" r="1.25"/><circle cx="8" cy="8" r="1.25"/><circle cx="12" cy="8" r="1.25"/></svg>',
};

/* ───────── KIND label map (from KnowledgeKind) ───────── */
const KIND_LABEL = {
  pattern: 'Pattern',
  anti_pattern: 'Anti-pattern',
  decision: 'Decision',
  failure: 'Failure',
  brief: 'Brief',
  principle: 'Principle',
  reflection: 'Reflection',
  focus: 'Focus',
};

/* ───────── shared shell pieces ───────── */

function kbIconRail(active = 'know') {
  const item = (name, key, badge) => `
    <button class="ir-btn ${active === key ? 'active' : ''}" title="${name}">
      ${KI[key] || ''}
      ${badge ? `<span class="ir-badge">${badge}</span>` : ''}
    </button>`;
  return `
    <nav class="ir">
      <div class="ir-top">
        ${item('Conversations', 'conv', '7')}
        ${item('Work', 'work')}
        ${item('Knowledge', 'know', '4')}
        ${item('Settings', 'set')}
      </div>
      <div class="ir-bottom">
        <div class="ir-avatar">MA</div>
      </div>
    </nav>`;
}

/* KB submenu — scope + topic tree */
function kbSubmenu(opts = {}) {
  const { scope = 'practice', activeTopic = 'building', activeSub = 'caching' } = opts;
  const data = KB_SCOPES[scope];

  const scopeBtn = (key, label) => `
    <button class="${key === scope ? 'active' : ''}" data-scope="${key}">${label}</button>`;

  const topicRow = (t, level = 0) => {
    const isActive = t.id === activeTopic;
    const cls = ['kb-topic'];
    if (isActive) cls.push('active');
    if (t.health === 'degraded') cls.push('degraded');
    if (t.health === 'gap') cls.push('gap');
    const gapFlag = t.health === 'gap' ? '<span class="gap-flag">gap</span>' : '';
    const staleFlag = t.stale > 0 && t.health !== 'gap'
      ? ` <span class="stale">${t.stale}⊘</span>` : '';
    return `
      <div class="${cls.join(' ')}">
        <span class="health"></span>
        <span class="label">${t.name}</span>
        <span class="count">${gapFlag || t.items + staleFlag}</span>
      </div>`;
  };

  const building = data.topics.find(t => t.id === 'building');
  const others = data.topics.filter(t => t.id !== 'building');

  let tree = '';
  if (scope === 'practice') {
    tree += `<div class="head-row">Domains</div>`;
    tree += topicRow(building);
    if (activeTopic === 'building' && building.subtopics) {
      for (const s of building.subtopics) {
        const cls = ['kb-subtopic'];
        if (s.id === activeSub) cls.push('active');
        const flag = s.health === 'gap' ? '<span class="gap-flag">gap</span>'
                    : s.stale > 0 ? `${s.items} <span class="stale">${s.stale}⊘</span>`
                    : s.items;
        cls.push('kb-topic');
        cls.push(s.health === 'degraded' ? 'degraded' : (s.health === 'gap' ? 'gap' : ''));
        cls.length && cls.filter(Boolean);
        tree += `
          <div class="kb-topic kb-subtopic ${s.id === activeSub ? 'active' : ''} ${s.health}">
            <span class="health"></span>
            <span class="label">${s.name}</span>
            <span class="count">${flag}</span>
          </div>`;
      }
    }
    for (const t of others) tree += topicRow(t);
  } else {
    tree += `<div class="head-row">${scope === 'factory' ? 'Sections' : 'Products'}</div>`;
    for (const t of data.topics) tree += topicRow(t);
  }

  return `
    <aside class="sm" style="padding:14px;">
      <div class="sm-head" style="padding:0 0 10px 0; border-bottom: none;">
        <div class="sm-title">
          <span class="t">Knowledge</span>
          <span class="c">${data.topics.reduce((a,t)=>a+t.items,0)}</span>
        </div>
        <button class="sm-collapse">${KI.collapse}</button>
      </div>

      <div class="kb-submenu" style="padding:0; box-shadow:none; min-height:0;">
        <div class="kb-scope-seg">
          ${scopeBtn('practice','Practice')}
          ${scopeBtn('product','Product')}
          ${scopeBtn('factory','Factory')}
        </div>
        <div class="kb-scope-desc">${data.description}</div>
        <div class="kb-search">
          ${KI.search}
          <span>Jump to topic or item…</span>
          <span class="kbd" style="margin-left:auto;font-family:var(--font-mono);background:var(--surface-3);padding:2px 5px;border-radius:2px;font-size:10px;color:var(--text-lo);">⌘K</span>
        </div>
        <div class="kb-topic-list">
          ${tree}
        </div>
      </div>
    </aside>`;
}

/* ───────── KIND tag + Layer tag (mirrors B's Tag + kind variant) ───────── */
function kindTag(kind) {
  return `<span class="kb-kind-tag" data-k="${kind}"><span class="k-dot"></span>${KIND_LABEL[kind] || kind}</span>`;
}
function layerTag(layer) {
  return `<span class="kb-layer-tag" data-l="${layer}">${layer}</span>`;
}

/* ───────── Status chip — uses wchip (mapped per KNOWLEDGE_STATUS_MAP)  ───────── */
function statusChip(status) {
  const map = {
    active:       { cls: 'done',    label: 'ACTIVE' },
    captured:     { cls: 'healthy', label: 'CAPTURED' },
    provisional:  { cls: 'behind',  label: 'PROVISIONAL' },
    stale:        { cls: 'error',   label: 'STALE' },
    needs_human:  { cls: 'blocked', label: 'NEEDS HUMAN' },
    archived:     { cls: 'paused',  label: 'ARCHIVED' },
    deprecated:   { cls: 'paused',  label: 'DEPRECATED' },
  };
  const m = map[status] || map.active;
  return `<span class="wchip ${m.cls}"><span class="dot"></span>${m.label}</span>`;
}

/* ───────── Row — mirror of B's KnowledgeRow ───────── */
function kbRow(item, { withReason, layer } = {}) {
  return `
    <div class="kb-row" data-status="${item.status}">
      <span class="status-dot"></span>
      <div class="k-body">
        <div class="k-title">${item.title}</div>
        ${withReason && item.reason ? `<div class="k-reason">${item.reason}</div>` : ''}
      </div>
      <div class="k-tags">
        ${layer ? layerTag(layer) : ''}
        ${kindTag(item.kind)}
        ${statusChip(item.status)}
      </div>
      <div class="k-time">${item.time}</div>
    </div>`;
}

/* ═════════ PANEL K1 · Curated list ═════════ */
(function panelK1(){
  const slot = document.getElementById('k1-slot');
  if (!slot) return;

  const topics = [
    { id: 'auth',    data: KB_BUILDING.auth,    open: false, layer: 'L1' },
    { id: 'caching', data: KB_BUILDING.caching, open: true,  layer: 'L1' },
    { id: 'testing', data: KB_BUILDING.testing, open: false, layer: 'L2' },
  ];

  const group = (t) => {
    const staleCount = t.data.items.filter(i => i.status === 'stale').length;
    const staleHtml = staleCount
      ? `<span class="stale">${staleCount} stale</span>`
      : `<span class="ok">fresh</span>`;
    const rows = t.data.items.map(it => kbRow(it, { layer: t.layer })).join('');
    return `
      <div class="kb-group">
        <div class="kb-group-head">
          <span class="chev">${t.open ? KI.chevD : KI.chevR}</span>
          <span class="title">${t.data.name}</span>
          <div class="meta">
            <span>${t.data.count} items</span>
            ${staleHtml}
            <span>L1 · practice</span>
          </div>
        </div>
        <div class="kb-group-rows ${t.open ? '' : 'collapsed'}">
          ${rows}
        </div>
      </div>`;
  };

  const gapCard = `
    <div class="kb-gap-card">
      <h4>No items captured for <em>API shape</em></h4>
      <p>This topic has been empty for two cycles. Agents have referenced "API design" patterns 7 times in the last week — consider prompting one to capture what it's implicitly using.</p>
      <div style="display:flex;gap:8px;margin-top:6px;">
        <button style="padding:7px 14px;background:rgba(233,133,133,0.12);color:var(--chip-error-fg);font-family:var(--font-heading);font-weight:600;font-size:11px;border-radius:3px;cursor:pointer;box-shadow:inset 0 0 0 1px rgba(233,133,133,0.3);">${KI.sparkle} Ask an agent to capture</button>
        <button style="padding:7px 14px;background:transparent;color:var(--text-mid);font-family:var(--font-heading);font-weight:600;font-size:11px;border-radius:3px;cursor:pointer;box-shadow:inset 0 0 0 1px var(--surface-4);">Dismiss gap flag</button>
      </div>
    </div>`;

  slot.innerHTML = `
    <div class="eyebrow">Deliverable 01 · Curated list · Practice / Building</div>
    <h1>The knowledge surface, grouped.</h1>
    <p class="lede">
      This is the default read of Knowledge. Three scopes up top — Practice / Product / Factory — and inside each, topics grouped with health at a glance. Every row is still a <code>KnowledgeRow</code> — the atom B already ships — but now lives inside a collapsible <code>KnowledgeGroup</code> keyed by topic.
    </p>

    <h3>Final mockup</h3>
    <div class="dlv-frame-scroll"><div class="dlv-frame shell-4">
      ${kbIconRail('know')}
      ${kbSubmenu({ scope: 'practice', activeTopic: 'building', activeSub: 'caching' })}
      <main class="main" style="padding:24px 28px; overflow-y: auto;">

        <div class="kb-list-head" style="margin-bottom:18px;">
          <div>
            <h2><span class="scope-pre">Practice /</span>Building</h2>
            <div class="kb-list-sub" style="margin-top:6px;">42 items · 8 topics · 3 stale · last captured Mar 31</div>
          </div>
          <div class="kb-tabs">
            <button class="active">${KI.check} Curated</button>
            <button>Triage <span class="badge-n">6</span></button>
          </div>
        </div>

        ${topics.map(group).join('')}
        ${gapCard}

        <div style="height:40px"></div>
      </main>
      <aside class="rail-c">
        <div class="rail-pill" title="3 stale across KB"><span class="n">3</span><span class="l">STL</span></div>
        <div class="rail-pill warn" title="1 needs human"><span class="n">1</span><span class="l">NH</span></div>
        <button class="rail-toggle" title="Expand">${KI.collapse}</button>
      </aside>
    </div></div>

    <div class="dlv-caption from">
      <span class="src">From A</span>
      <div class="txt">
        <strong>Scope browser</strong> (Practice / Product / Factory segmented control, topic list with health dots + gap flags), <strong>topic grouping</strong> (collapsible <code>KnowledgeGroup</code>s in the main view), <strong>knowledge-gap card</strong> surfacing empty topics that agents are implicitly referencing. The <strong>Curated / Triage</strong> tab switch is first-class — not a filter dropdown.
      </div>
    </div>
    <div class="dlv-caption keep">
      <span class="src">From B</span>
      <div class="txt">
        Every row is still a <code>KnowledgeRow</code> — same composition (title + <code>Tag layer</code> + <code>Tag kind</code> + <code>StatusChip</code> + timestamp). <strong>Status → chip</strong> mapping stays exactly as <code>KNOWLEDGE_STATUS_MAP</code> defines it: <code>stale → error</code>, <code>needs_human → blocked</code>, <code>active → done</code>, <code>provisional → review</code>. The submenu reuses B's <code>Submenu</code> shell — the scope selector + topic tree goes inside the existing <code>children</code> slot.
      </div>
    </div>
    <div class="dlv-caption new">
      <span class="src">New</span>
      <div class="txt">
        <strong>Kind tag variant.</strong> B's <code>Tag</code> gains an optional <code>kind</code> prop — pattern/decision/failure/etc. each render with a colored dot and tinted label while keeping the same token + size as the neutral variant. Other consumers (Work, Conversations) are unaffected; the tint only activates when <code>kind</code> is set. <strong>Gap card</strong> is a new component, rendered inside <code>KnowledgeList</code> when <code>topic.items.length === 0 && topic.agentReferenceCount &gt; threshold</code>.
      </div>
    </div>
  `;
})();

/* ═════════ PANEL K2 · Triage view ═════════ */
(function panelK2(){
  const slot = document.getElementById('k2-slot');
  if (!slot) return;

  const suggestion = `
    <div class="kb-curation">
      <div class="cur-head">
        <span class="cur-badge">${KI.sparkle} Curation suggestion</span>
        <span class="cur-agent">from facilitator-agent · 2h ago</span>
      </div>
      <div class="cur-title">${KB_SUGGESTION.title}</div>
      <div class="cur-body">${KB_SUGGESTION.text}</div>
      <div class="cur-candidates">
        <div class="cur-cand">${kindTag('anti_pattern')}<span class="k-title">Never store refresh tokens in localStorage</span><span style="color:var(--text-lo);font-family:var(--font-mono);font-size:10px;margin-left:auto;">28 reads</span></div>
        <div class="cur-cand">${kindTag('failure')}<span class="k-title">JWT rotation every 15 minutes — the outage</span><span style="color:var(--text-lo);font-family:var(--font-mono);font-size:10px;margin-left:auto;">7 reads</span></div>
        <div class="cur-cand">${kindTag('reflection')}<span class="k-title">How we roll out session-layer changes</span><span style="color:var(--text-lo);font-family:var(--font-mono);font-size:10px;margin-left:auto;">5 reads</span></div>
      </div>
      <div class="cur-actions">
        <button class="btn primary">${KI.merge} Review merge</button>
        <button class="btn ghost">Dismiss</button>
        <button class="btn ghost">Why this suggestion?</button>
      </div>
    </div>`;

  const rows = KB_TRIAGE.map(it => `
    <div class="kb-row" data-status="${it.status}">
      <span class="status-dot"></span>
      <div class="k-body">
        <div class="k-title">${it.title}</div>
        <div class="k-reason">${it.reason}</div>
      </div>
      <div class="k-tags">
        <span class="kb-layer-tag" data-l="L1" style="background:transparent;color:var(--text-lo);font-size:10px;">${it.topic}</span>
        ${kindTag(it.kind)}
        ${statusChip(it.status)}
      </div>
      <div class="k-time">${it.time}</div>
    </div>`).join('');

  slot.innerHTML = `
    <div class="eyebrow">Deliverable 02 · Triage view · Your weekly 20 minutes</div>
    <h1>The founder's weekly to-do, not an inbox.</h1>
    <p class="lede">
      Triage is a <em>route</em>, not a filter. Six items surfaced this week — each with a one-line reason for <strong>why now</strong>. The raw attention score is never shown; the reason line <em>is</em> the score made legible. One curation suggestion at the top proposes a merge across 3 related items.
    </p>

    <h3>Final mockup</h3>
    <div class="dlv-frame-scroll"><div class="dlv-frame shell-4">
      ${kbIconRail('know')}
      ${kbSubmenu({ scope: 'practice', activeTopic: 'building', activeSub: null })}
      <main class="main" style="padding:24px 28px; overflow-y: auto;">

        <div class="kb-list-head" style="margin-bottom:18px;">
          <div>
            <h2><span class="scope-pre">Practice /</span>Building <span style="color:var(--text-lo);font-weight:400;"> · Triage</span></h2>
            <div class="kb-list-sub" style="margin-top:6px;">6 items need your attention · 1 curation suggestion · sorted by reason severity</div>
          </div>
          <div class="kb-tabs">
            <button>Curated</button>
            <button class="active">${KI.sparkle} Triage <span class="badge-n">6</span></button>
          </div>
        </div>

        ${suggestion}

        <div class="kb-group">
          <div class="kb-group-head" style="background:var(--surface-2);">
            <span class="title" style="font-family:var(--font-mono);font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:var(--text-lo);font-weight:500;">Items needing review</span>
            <div class="meta">
              <span>6 items</span>
              <span class="stale">2 stale</span>
              <span>3 captured</span>
            </div>
          </div>
          <div class="kb-group-rows">${rows}</div>
        </div>

        <div style="height:40px"></div>
      </main>
      <aside class="rail-c">
        <div class="rail-pill danger"><span class="n">6</span><span class="l">TRG</span></div>
        <div class="rail-pill"><span class="n">1</span><span class="l">SGT</span></div>
        <button class="rail-toggle">${KI.collapse}</button>
      </aside>
    </div></div>

    <div class="dlv-caption from">
      <span class="src">From A</span>
      <div class="txt">
        <strong>Triage as a named route</strong> (not a filter), <strong>curation suggestion card</strong> rendered by a <em>facilitator agent</em> (a new agent role proposed in A's thinking). The suggestion card is its own component — <code>CurationCard</code> — with candidates, action buttons, and attribution.
      </div>
    </div>
    <div class="dlv-caption keep">
      <span class="src">From B</span>
      <div class="txt">
        Every row is still a <code>KnowledgeRow</code>. Status mapping unchanged. The <code>needs_human</code> status (→ <code>blocked</code> chip, amber) correctly surfaces here because the reason line explains <em>why</em> it needs a human — not a pile of identical amber chips with no context.
      </div>
    </div>
    <div class="dlv-caption new">
      <span class="src">New · agreed today</span>
      <div class="txt">
        <strong>"Why now" reason line</strong> under each row title. Populated by the attention scorer (<code>computeAttentionReason(item, recentActivity)</code>) — returns a single string. Never the raw score number. When <code>reason === null</code>, the row falls back to the Curated layout. This is the single biggest legibility win over a pure-numeric priority queue.
      </div>
    </div>
  `;
})();

/* ═════════ PANEL K3 · Detail · read mode ═════════ */
(function panelK3(){
  const slot = document.getElementById('k3-slot');
  if (!slot) return;

  const it = KB_DETAIL_ITEM;

  const renderBody = (blocks) => blocks.map(b => {
    const textOf = (t) => {
      if (typeof t === 'string') return t;
      // React element from JSX; stringify via outerHTML mapping
      if (t && t.props) {
        const children = Array.isArray(t.props.children) ? t.props.children : [t.props.children];
        return children.map(c => {
          if (typeof c === 'string') return c;
          if (c && c.type === 'strong') return `<strong>${c.props.children}</strong>`;
          if (c && c.type === 'code') return `<code>${c.props.children}</code>`;
          return '';
        }).join('');
      }
      return '';
    };
    if (b.type === 'h2') return `<h4>${b.text}</h4>`;
    if (b.type === 'h3') return `<h4 style="font-size:13px;">${b.text}</h4>`;
    if (b.type === 'p')  return `<p>${textOf(b.text)}</p>`;
    if (b.type === 'ul') return `<ul>${b.items.map(i=>`<li>${i}</li>`).join('')}</ul>`;
    if (b.type === 'ol') return `<ol style="margin:0 0 12px;padding-left:22px;">${b.items.map(i=>`<li style="margin-bottom:4px;">${i}</li>`).join('')}</ol>`;
    if (b.type === 'pre') return `<pre style="background:var(--surface-2);padding:12px 14px;border-radius:var(--r-btn);font-family:var(--font-mono);font-size:12px;line-height:1.55;color:var(--text-hi);overflow-x:auto;margin:0 0 12px;">${b.code}</pre>`;
    if (b.type === 'blockquote') return `<blockquote style="margin:16px 0;padding:10px 16px;border-left:2px solid var(--surface-4);font-style:italic;color:var(--text-hi);">${b.text}</blockquote>`;
    return '';
  }).join('');

  const obs = it.observations.map(o => `
    <div class="kb-obs-item">
      <div class="avatar ${o.agent === 'MA' || o.agent === 'RN' ? 'human' : ''}">${o.agent}</div>
      <div>
        <div class="obs-head">
          <span class="name">${o.agent === 'FN' ? 'facilitator' : o.agent}</span>
          <span class="role">${o.agent === 'FN' ? 'agent' : 'human'}</span>
        </div>
        <div class="obs-body">${o.text}</div>
      </div>
      <div class="obs-t">${o.time}</div>
    </div>`).join('');

  const history = it.history.map(h => `
    <div class="kb-history-row">
      <div class="hr-t">${h.time}</div>
      <div class="hr-d">
        <div class="hr-action">${h.change}</div>
        <div class="hr-who">${h.who} · ${h.diff}</div>
      </div>
    </div>`).join('');

  const related = it.related.map(r => `
    <div class="kb-related-row">
      ${kindTag(r.kind)}
      <span class="rel-title">${r.title}</span>
      <span class="rel-rel">${Math.round(r.score*100)}%</span>
    </div>`).join('');

  slot.innerHTML = `
    <div class="eyebrow">Deliverable 03 · Knowledge detail · Read mode</div>
    <h1>One item, fully loaded.</h1>
    <p class="lede">
      The detail page rebuilt. Same primitives as B — <code>Tag</code>, <code>StatusChip</code>, <code>KeyValue</code> — but composed into a structure that actually tells you what this piece of knowledge <em>is</em>, <em>how confident we are</em>, and <em>why it's still relevant</em>. Observation logs (facilitator-agent generated) live in the gutter, not buried in a tab.
    </p>

    <h3>Final mockup</h3>
    <div class="dlv-frame-scroll"><div class="dlv-frame shell-4">
      ${kbIconRail('know')}
      ${kbSubmenu({ scope: 'practice', activeTopic: 'building', activeSub: 'caching' })}
      <main class="main" style="overflow-y:auto;">
        <div class="kb-detail">
          <div class="kb-main">

            <div class="kb-bc">
              <a>Practice</a><span class="sep">/</span>
              <a>Building</a><span class="sep">/</span>
              <a>Caching strategies</a><span class="sep">/</span>
              <span class="cur">kb-c1</span>
            </div>

            <div class="kb-hero">
              <div class="kh-title-row">
                <h1>${it.title}</h1>
              </div>
              <div class="kh-meta">
                ${kindTag(it.kind)}
                ${statusChip(it.status)}
                ${layerTag('L1')}
                <div class="conf">
                  <span>CONF</span>
                  <div class="bar"><div class="fill" style="width:${it.confidence*100}%"></div></div>
                  <span class="v">${it.confidence.toFixed(2)}</span>
                </div>
                <span style="font-family:var(--font-mono);font-size:10px;color:var(--text-lo);letter-spacing:0.06em;">${it.access} reads · 14d</span>
              </div>
              <div class="kh-stats">
                <div class="kh-stat"><div class="l">Origin</div><div class="v">${it.origin}</div></div>
                <div class="kh-stat"><div class="l">Last edited</div><div class="v">${it.lastEdited}</div></div>
                <div class="kh-stat"><div class="l">Editor</div><div class="v">${it.editor}</div></div>
                <div class="kh-stat"><div class="l">Topic</div><div class="v">${it.topic}</div></div>
              </div>
            </div>

            <div class="kb-actions">
              <button class="btn primary">${KI.edit} Edit <span class="kbd" style="font-family:var(--font-mono);background:var(--surface-3);padding:1px 4px;border-radius:2px;font-size:10px;margin-left:4px;">E</span></button>
              <button class="btn">${KI.merge} Merge…</button>
              <button class="btn">${KI.split} Split…</button>
              <button class="btn">${KI.dup} Fork to draft</button>
              <button class="btn">${KI.link} Copy link</button>
              <div style="flex:1"></div>
              <button class="btn">${KI.archive} Archive</button>
              <button class="btn danger">${KI.close} Mark stale</button>
              <button class="btn">${KI.dots}</button>
            </div>

            <div class="kb-section">
              <h3>Body</h3>
              <div class="kb-body">${renderBody(it.body)}</div>
            </div>

            <div class="kb-section">
              <h3>Observations · facilitator-agent log</h3>
              <div class="kb-obs">${obs}</div>
            </div>

          </div>

          <aside class="kb-side">
            <div class="kb-related">
              <h4>Related</h4>
              <div class="kb-related-list">${related}</div>
            </div>

            <div class="kb-related">
              <h4>Linked from work</h4>
              <div class="kb-related-list">
                ${it.linked.map(l => `
                  <div class="kb-related-row">
                    <span class="kb-layer-tag" data-l="L1">${l.kind}</span>
                    <span class="rel-title">${l.title}</span>
                  </div>`).join('')}
              </div>
            </div>

            <div class="kb-history">
              <h4>Edit history</h4>
              <div class="kb-history-list">${history}</div>
            </div>
          </aside>
        </div>
      </main>
      <aside class="rail-c">
        <button class="rail-toggle">${KI.collapse}</button>
      </aside>
    </div></div>

    <div class="dlv-caption from">
      <span class="src">From A</span>
      <div class="txt">
        <strong>Hero composition</strong> (title + kind/status/layer tags + confidence bar + 4 metadata KVs), <strong>action bar</strong> (edit + merge + split + fork + archive + mark-stale), <strong>observation log</strong> in the body with facilitator-agent attribution, <strong>related items</strong> + <strong>linked-from-work</strong> + <strong>edit history</strong> in the sidebar, <strong>rendered markdown</strong> in the body block (not plain-text).
      </div>
    </div>
    <div class="dlv-caption keep">
      <span class="src">From B</span>
      <div class="txt">
        <strong>Every primitive is B's existing component.</strong> The hero tags are <code>&lt;Tag kind="pattern"/&gt;</code> + <code>&lt;StatusChip status="active"/&gt;</code>. The 4 stats are <code>&lt;KeyValue/&gt;</code>s. The breadcrumb uses plain anchor tags styled like B's <code>NavItem</code>. No new primitives required — only the composition in <code>KnowledgeDetail.tsx</code> changes. The body block continues to render <code>item.content</code> — now passed through <code>react-markdown</code> (already in <code>package.json</code>'s transitive deps; if not, add it).
      </div>
    </div>
    <div class="dlv-caption new">
      <span class="src">New · agreed today</span>
      <div class="txt">
        <strong>Observation log</strong> is a new data shape: <code>observations: KnowledgeObservation[]</code> on <code>Knowledge</code>, populated by a facilitator agent that watches access patterns. <strong>Edit history</strong> is a new shape: <code>history: KnowledgeEdit[]</code>. Both are appended by server-side events; client reads them as arrays. <strong>Confidence</strong> is a new field — optional number 0–1 on <code>Knowledge</code>; renders the bar only when present.
      </div>
    </div>
  `;
})();

/* ═════════ PANEL K4 · Detail · edit mode ═════════ */
(function panelK4(){
  const slot = document.getElementById('k4-slot');
  if (!slot) return;

  const it = KB_DETAIL_ITEM;
  const sampleMd = `## The pattern

For reads that are **personalized but mostly-static**, cache at the CDN edge with \`stale-while-revalidate\`. Key the cache on (user_segment, locale, experiment_bucket) — not on user_id.

### When to use

- Recommendation feeds (Ambrovia, Nimmly)
- Pricing page with experiment bucketing
- Landing pages with geo-based copy
- Any read that would fan out to >2 backend calls and is per-cohort, not per-user

### When not to

- Anything authenticated at the user level (cart, inbox, settings)
- Reads that depend on consistency with a write the user just made
- Payment / billing surfaces — always origin

## The numbers

On Ambrovia's recommendation feed, edge caching eats **94.2%** of personalization reads.
P95 TTFB dropped from 340ms to 28ms.`;

  slot.innerHTML = `
    <div class="eyebrow">Deliverable 04 · Knowledge detail · Edit mode</div>
    <h1>Editing is a state, not a route.</h1>
    <p class="lede">
      Press <code>E</code> on the detail page. The body swaps to a markdown editor; the sidebar collapses to make room; a sticky banner shows autosave state. No navigation, no modal — the item never leaves its page. Leaving edit mode (⌘⏎ / Esc) returns to the read view with the sidebar restored.
    </p>

    <h3>Final mockup</h3>
    <div class="dlv-frame-scroll"><div class="dlv-frame shell-4">
      ${kbIconRail('know')}
      ${kbSubmenu({ scope: 'practice', activeTopic: 'building', activeSub: 'caching' })}
      <main class="main" style="overflow-y:auto;">
        <div class="kb-detail editing">
          <div class="kb-main">

            <div class="kb-bc">
              <a>Practice</a><span class="sep">/</span>
              <a>Building</a><span class="sep">/</span>
              <a>Caching strategies</a><span class="sep">/</span>
              <span class="cur">kb-c1 · editing</span>
            </div>

            <div class="kb-edit-banner">
              <span class="dot"></span>
              <span>Editing · autosave enabled · last saved 14s ago</span>
              <div class="spacer"></div>
              <button class="btn ghost">Discard</button>
              <button class="btn">Save &amp; close <span class="kbd" style="margin-left:6px;font-family:var(--font-mono);background:rgba(0,0,0,0.15);padding:1px 5px;border-radius:2px;font-size:10px;">⌘↵</span></button>
            </div>

            <div class="kb-hero">
              <div class="kh-title-row">
                <input value="${it.title}" style="flex:1;background:var(--surface-2);padding:8px 12px;border:none;border-radius:var(--r-btn);font-family:var(--font-heading);font-size:22px;color:var(--text-hi);font-weight:600;letter-spacing:-0.015em;box-shadow:inset 0 0 0 1px rgba(109,171,224,0.3);" />
              </div>
              <div class="kh-meta" style="gap:6px 14px;">
                <span style="font-family:var(--font-mono);font-size:10px;color:var(--text-lo);letter-spacing:0.1em;text-transform:uppercase;">Kind</span>
                ${kindTag(it.kind)}
                <span style="font-family:var(--font-mono);font-size:10px;color:var(--text-lo);letter-spacing:0.1em;text-transform:uppercase;margin-left:10px;">Status</span>
                <select style="background:var(--surface-2);color:var(--text-hi);border:none;border-radius:3px;padding:3px 8px;font-family:var(--font-mono);font-size:10px;box-shadow:inset 0 0 0 1px var(--surface-3);">
                  <option>ACTIVE</option>
                  <option>PROVISIONAL</option>
                  <option>STALE</option>
                  <option>ARCHIVED</option>
                </select>
                <span style="font-family:var(--font-mono);font-size:10px;color:var(--text-lo);letter-spacing:0.1em;text-transform:uppercase;margin-left:10px;">Layer</span>
                ${layerTag('L1')}
                <span style="font-family:var(--font-mono);font-size:10px;color:var(--text-lo);letter-spacing:0.1em;text-transform:uppercase;margin-left:10px;">Topic</span>
                <span style="font-size:12px;color:var(--text-hi);">Caching strategies</span>
              </div>
            </div>

            <div class="kb-section" style="padding:0;overflow:hidden;">
              <div class="kb-edit-toolbar">
                <button title="Heading"><strong>H</strong></button>
                <button title="Bold"><strong>B</strong></button>
                <button title="Italic"><em>I</em></button>
                <div class="sep"></div>
                <button title="Unordered list">• List</button>
                <button title="Ordered list">1. List</button>
                <div class="sep"></div>
                <button title="Code">${"{ }"}</button>
                <button title="Code block">Code block</button>
                <button title="Quote">" Quote</button>
                <div class="sep"></div>
                <button title="Link">${KI.link} Link</button>
                <button title="Reference another item">${KI.sparkle} Reference</button>
                <div style="flex:1"></div>
                <button title="Preview">Preview</button>
              </div>
              <textarea class="kb-editor" spellcheck="false">${sampleMd}</textarea>
            </div>

            <div class="kb-section" style="background:transparent;box-shadow:none;padding:14px 0 0;">
              <div style="display:flex;gap:8px;">
                <button class="btn primary" style="padding:9px 16px;font-family:var(--font-heading);font-weight:600;font-size:12px;border-radius:var(--r-btn);background:var(--chip-inprogress-bg);color:var(--chip-inprogress-fg);box-shadow:inset 0 0 0 1px rgba(109,171,224,0.4);cursor:pointer;">Save &amp; close</button>
                <button class="btn" style="padding:9px 16px;font-family:var(--font-heading);font-weight:600;font-size:12px;border-radius:var(--r-btn);background:transparent;color:var(--text-mid);box-shadow:inset 0 0 0 1px var(--surface-4);cursor:pointer;">Save draft</button>
                <button class="btn" style="padding:9px 16px;font-family:var(--font-heading);font-weight:600;font-size:12px;border-radius:var(--r-btn);background:transparent;color:var(--text-mid);cursor:pointer;">Cancel</button>
                <div style="flex:1"></div>
                <span style="font-size:11px;color:var(--text-lo);font-style:italic;align-self:center;">Markdown · <code style="background:var(--surface-3);padding:1px 4px;border-radius:2px;font-family:var(--font-mono);font-size:10px;">[[ref]]</code> to link another item</span>
              </div>
            </div>

          </div>
        </div>
      </main>
      <aside class="rail-c">
        <button class="rail-toggle">${KI.collapse}</button>
      </aside>
    </div></div>

    <div class="dlv-caption from">
      <span class="src">From A</span>
      <div class="txt">
        <strong>Edit-in-place</strong> (not a modal, not a new route — a state toggle), <strong>markdown editor with formatting toolbar</strong>, <strong>editable kind/status/layer metadata row</strong>, <strong>sticky autosave banner</strong>, <strong>sidebar collapses during edit</strong> to give the text room.
      </div>
    </div>
    <div class="dlv-caption keep">
      <span class="src">From B</span>
      <div class="txt">
        <strong>Same page, same route.</strong> Only <code>KnowledgeDetail.tsx</code> adds an <code>editing</code> state. On save, it calls the existing <code>updateKnowledge(id, patch)</code> action — no new API surface. The title becomes a plain <code>&lt;input&gt;</code> using the same DaisyUI <code>input-ghost</code> styling already used elsewhere. The status <code>&lt;select&gt;</code> options come straight from the canonical <code>KnowledgeStatus</code> union.
      </div>
    </div>
    <div class="dlv-caption new">
      <span class="src">New · agreed today</span>
      <div class="txt">
        <strong><code>[[ref]]</code> syntax</strong> — typing <code>[[</code> opens a reference picker; resolving inserts a typed link that renders as an inline <code>KnowledgeRow</code>-styled chip in read mode. This is the substrate for A's merge-preview and B's future cross-item graph. <strong>Autosave</strong> is a new contract: <code>debouncedSave(item, 3s)</code>; the banner's state derives from the save promise (<code>saving</code> / <code>saved · 14s ago</code> / <code>error</code>).
      </div>
    </div>
  `;
})();
