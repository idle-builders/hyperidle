/* synthesis-panels.js — populates each deliverable tab with its mockup + captions.
   Keeps Synthesis.html readable by moving big HTML blobs out of inline scripts. */

/* ───────── shared helpers ───────── */

const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const k in attrs) {
    if (k === 'class') el.className = attrs[k];
    else if (k === 'html') el.innerHTML = attrs[k];
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), attrs[k]);
    else el.setAttribute(k, attrs[k]);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    if (typeof kid === 'string') el.appendChild(document.createTextNode(kid));
    else el.appendChild(kid);
  }
  return el;
};
const set = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };

/* ───────── Icons (inlined SVG so the whole doc is self-contained) ───────── */
const ICON = {
  conv:   '<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h14v9H9l-4 3v-3H3z"/></svg>',
  work:   '<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="14" height="10" rx="1"/><path d="M7 6V4h6v2"/></svg>',
  know:   '<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h9l3 3v9H4z"/><path d="M13 4v3h3"/></svg>',
  set:    '<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="2.5"/><path d="M10 3v2M10 15v2M3 10h2M15 10h2M5 5l1.4 1.4M13.6 13.6L15 15M5 15l1.4-1.4M13.6 6.4L15 5"/></svg>',
  search: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="7" r="4.5"/><path d="m11 11 3 3"/></svg>',
  close:  '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
  check:  '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3.5 8 3 3 6-6"/></svg>',
  edit:   '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 14v-3l8-8 3 3-8 8z"/><path d="M10 3l3 3"/></svg>',
  pause:  '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5" y="4" width="2" height="8" rx="0.5"/><rect x="9" y="4" width="2" height="8" rx="0.5"/></svg>',
  more:   '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><circle cx="4" cy="8" r="1.25"/><circle cx="8" cy="8" r="1.25"/><circle cx="12" cy="8" r="1.25"/></svg>',
  block:  '<svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="6" cy="6" r="4.5"/><path d="M3 3l6 6" stroke-linecap="round"/></svg>',
  pin:    '<svg viewBox="0 0 12 12" width="10" height="10" fill="currentColor"><path d="M7 1H5v4L3 7v1h2.5v3L6 12l.5-1v-3H9V7L7 5z"/></svg>',
  chevR:  '<svg viewBox="0 0 14 14" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m5 3 4 4-4 4"/></svg>',
  chevD:  '<svg viewBox="0 0 14 14" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m3 5 4 4 4-4"/></svg>',
  plus:   '<svg viewBox="0 0 14 14" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M7 2v10M2 7h10"/></svg>',
  send:   '<svg viewBox="0 0 14 14" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 7l10-5-4 10-1.5-4z"/></svg>',
  collapse: '<svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v8M10 7h-5M8 5l-3 2 3 2"/></svg>',
};

/* ───────── Shell pieces reused across deliverables ───────── */

function iconRail(active = 'conv') {
  const item = (name, key, badge) => `
    <button class="ir-btn ${active === key ? 'active' : ''}" title="${name}">
      ${ICON[key] || ''}
      ${badge ? `<span class="ir-badge">${badge}</span>` : ''}
    </button>`;
  return `
    <nav class="ir">
      <div class="ir-top">
        ${item('Conversations', 'conv', '7')}
        ${item('Work', 'work')}
        ${item('Knowledge', 'know')}
        ${item('Settings', 'set')}
      </div>
      <div class="ir-bottom">
        <div class="ir-avatar">MA</div>
      </div>
    </nav>`;
}

function railCollapsed() {
  return `
    <aside class="rail-c">
      <div class="rail-pill danger" title="2 blocking you">
        <span class="n">2</span><span class="l">BLK</span>
      </div>
      <div class="rail-pill" title="3 in review">
        <span class="n">3</span><span class="l">REV</span>
      </div>
      <div class="rail-pill warn" title="1 agent paused">
        <span class="n">1</span><span class="l">PSD</span>
      </div>
      <button class="rail-toggle" title="Expand">${ICON.collapse}</button>
    </aside>`;
}

function railExpanded() {
  return `
    <aside class="rail-e">
      <div class="rail-head">
        <span class="t">Fleet · 6 active</span>
        <button class="tool-btn">${ICON.close}</button>
      </div>
      <div class="rail-body">
        <div class="rail-section">
          <button class="rail-sh"><span class="l">Blocking you</span><span class="c danger">2</span></button>
          <div class="rail-card danger">
            <div class="top">
              <span class="t">Orbit · growth</span>
              <span class="p">3m ago</span>
            </div>
            <span class="chip blocked"><span class="dot"></span>BLOCKED · needs approval</span>
          </div>
          <div class="rail-card danger">
            <div class="top">
              <span class="t">Tessera · infra</span>
              <span class="p">14m</span>
            </div>
            <span class="chip blocked"><span class="dot"></span>BLOCKED · needs approval</span>
          </div>
        </div>
        <div class="rail-section">
          <button class="rail-sh"><span class="l">In review</span><span class="c">3</span></button>
          <div class="rail-card">
            <div class="top"><span class="t">Lumen · docs</span><span class="p">1h</span></div>
            <div class="progress"><div class="fill" style="width:72%"></div></div>
          </div>
          <div class="rail-card warn">
            <div class="top"><span class="t">Kepler · analytics</span><span class="p">24m</span></div>
            <div class="progress"><div class="fill" style="width:45%"></div></div>
          </div>
        </div>
        <div class="rail-section">
          <button class="rail-sh"><span class="l">Spend · 24h</span></button>
          <div class="rail-cost">
            <div><span class="l">Tokens</span><div class="v">3.2M</div></div>
            <div><span class="l">Cost</span><div class="v">$41.80</div></div>
            <div class="span2">
              <div class="rail-cost-bar"><div class="fill" style="width:62%"></div></div>
            </div>
          </div>
        </div>
      </div>
    </aside>`;
}

/* ───────── Submenu — the canonical thread list. Every deliverable uses this. ───────── */

const THREADS = [
  // pinned
  { id:'cos', pinned:true, kind:'chat', agent:'Chief of Staff', role:'coordinator', time:'now', subject:'Daily roll-up · 2 blocking, 3 in review, 1 paused', unread:true, bot:true, initials:'CS' },
  // blocking
  { id:'r1', blocking:true, kind:'review', agent:'Orbit', role:'growth', time:'3m', subject:'Q3 performance report — 24 metrics, data_metrics', status:'blocked', product:'Orbit', unread:true, variant:'metrics', bot:true, initials:'OR' },
  { id:'r2', blocking:true, kind:'review', agent:'Tessera', role:'infra', time:'14m', subject:'Deploy api-gateway v2.4.1 to prod · action_summary', status:'blocked', product:'Tessera', unread:true, variant:'action', bot:true, initials:'TS' },
  // reviews
  { id:'r3', kind:'review', agent:'Lumen', role:'docs', time:'42m', subject:'Blog post — Announcing structured outputs · content_preview', status:'behind', product:'Lumen', variant:'content', bot:true, initials:'LM' },
  { id:'r4', kind:'review', agent:'Prism', role:'design', time:'1h', subject:'Landing page revision — hero treatment · visual_comparison', status:'healthy', product:'Prism', variant:'visual', bot:true, initials:'PR' },
  { id:'r5', kind:'review', agent:'Forge', role:'eng', time:'1h', subject:'PR #2041 — rate limiter refactor · text_diff', status:'healthy', product:'Forge', variant:'diff', bot:true, initials:'FG' },
  // chats
  { id:'c1', kind:'chat', agent:'Ari Nakamura', role:'PM', time:'2h', subject:'Thoughts on the Q3 roadmap doc?', initials:'AN' },
  { id:'c2', kind:'chat', agent:'Atlas', role:'research', time:'4h', subject:'Summary of the Oct rate-limiter paper', bot:true, initials:'AT' },
  // resolved
  { id:'x1', kind:'review', agent:'Forge', role:'eng', time:'yesterday', subject:'PR #2038 — cache warmup · merged', status:'done', product:'Forge', bot:true, initials:'FG' },
];

function threadRow(t, selectedId) {
  const selected = t.id === selectedId;
  const cls = ['tr'];
  if (selected) cls.push('selected');
  if (t.blocking) cls.push('blocking');
  if (t.pinned) cls.push('pinned');
  if (t.unread) cls.push('unread');

  const kindBadge = t.blocking
    ? `<span class="kind blocking">${ICON.block} BLOCKING</span>`
    : t.pinned
    ? `<span class="kind pinned">${ICON.pin} PINNED</span>`
    : t.kind === 'review'
    ? `<span class="kind review">REVIEW</span>`
    : `<span class="kind chat">CHAT</span>`;

  const statusChip = t.status && t.status !== 'healthy'
    ? `<span class="chip ${t.status}"><span class="dot"></span>${t.status.toUpperCase()}</span>`
    : '';

  const productTag = t.product ? `<span class="tag">${t.product}</span>` : '';

  return `
    <div class="${cls.join(' ')}">
      <div class="tr-avatar ${t.bot ? 'bot' : 'human'} ${t.pinned ? 'pin' : ''}">${t.initials}</div>
      <div class="tr-body">
        <div class="tr-top">
          <span class="tr-name">${t.agent}<span class="tr-role"> · ${t.role}</span></span>
          <span class="tr-time">${t.time}</span>
        </div>
        <div class="tr-subject">${t.subject}</div>
        <div class="tr-meta">
          ${kindBadge}
          ${statusChip}
          ${productTag}
        </div>
      </div>
      <div class="tr-right">
        ${t.unread ? '<span class="tr-unread-dot"></span>' : ''}
      </div>
    </div>`;
}

function submenu(selectedId) {
  const pinned = THREADS.filter(t => t.pinned);
  const blocking = THREADS.filter(t => !t.pinned && t.blocking);
  const reviews = THREADS.filter(t => !t.pinned && !t.blocking && t.kind === 'review' && t.status !== 'done');
  const chats = THREADS.filter(t => !t.pinned && !t.blocking && t.kind === 'chat');
  const resolved = THREADS.filter(t => t.status === 'done');

  const section = (label, list, cls='') => `
    <div class="sm-section ${cls}"><span>${label}</span><span class="c">${list.length}</span></div>
    ${list.map(t => threadRow(t, selectedId)).join('')}
  `;

  const filters = ['All', 'Blocking', 'Reviews', 'Chats', 'Orbit', 'Snoozed'];
  const activeFilter = 'Blocking';

  return `
    <aside class="sm">
      <div class="sm-head">
        <div class="sm-title">
          <span class="t">Conversations</span>
          <span class="c">${THREADS.length}</span>
        </div>
        <button class="sm-collapse">${ICON.collapse}</button>
      </div>
      <div class="sm-search">
        ${ICON.search}
        <input placeholder="Jump to agent, thread, or artifact…" />
        <span class="kbd">⌘K</span>
      </div>
      <div class="sm-filters">
        ${filters.map(f => `<button class="sm-filter ${f===activeFilter?'active danger':''}">${f}</button>`).join('')}
      </div>
      <div class="sm-list">
        ${section('Pinned', pinned)}
        ${section('Blocking you', blocking, 'blocking')}
        ${section('Reviews', reviews)}
        ${section('Chats', chats)}
        ${section('Resolved · 24h', resolved)}
      </div>
    </aside>`;
}

/* ───────── Review header (shared) ───────── */

function reviewHeader(opts) {
  const { agent, role, avatarInitials, routing, sla, blocking, status, product, artifactKind } = opts;
  const statusChipHtml = status
    ? `<span class="chip ${status}"><span class="dot"></span>${status.toUpperCase()}</span>`
    : '';
  const pausedChip = blocking ? `<span class="kind blocking">${ICON.block} AGENT PAUSED</span>` : '';
  return `
    <header class="rh">
      <div class="rh-top">
        <div class="rh-proposer">
          <div class="rh-avatar">${avatarInitials}</div>
          <div class="rh-identity">
            <div class="name">${agent}<span class="role">${role}</span></div>
            <div class="sub">
              <span>Routed to <span class="ok">MA · Growth</span></span>
              <span> · </span>
              <span class="${sla.warn?'warn':''}">SLA ${sla.text}</span>
            </div>
          </div>
        </div>
        <div class="rh-verdicts">
          <button class="vbtn danger" title="Reject (X)">${ICON.close} Reject <span class="kbd">X</span></button>
          <button class="vbtn secondary" title="Request changes (R)">${ICON.edit} Request changes <span class="kbd">R</span></button>
          ${blocking ? `<button class="vbtn ghost" title="Pause agent (P)">${ICON.pause} Pause <span class="kbd">P</span></button>` : ''}
          <button class="vbtn primary" title="Approve (A)">${ICON.check} Approve <span class="kbd">A</span></button>
          <button class="vbtn ghost" title="More actions">${ICON.more}</button>
        </div>
      </div>
      <div class="rh-meta">
        <div class="item"><span class="l">KIND</span><span class="v">${artifactKind}</span></div>
        <span class="divider">│</span>
        <div class="item"><span class="l">PRODUCT</span><span class="v">${product}</span></div>
        <span class="divider">│</span>
        <div class="item"><span class="l">STATUS</span>${statusChipHtml}</div>
        ${pausedChip ? `<span class="divider">│</span><div class="item">${pausedChip}</div>` : ''}
        <span class="divider">│</span>
        <div class="item"><span class="l">THREAD</span><span class="v mono">t_${Math.random().toString(36).slice(2,8)}</span></div>
      </div>
    </header>`;
}

/* ───────── Reasoning block (shared) ───────── */

function reasoning(steps, mins = 4) {
  return `
    <section class="reasoning">
      <div class="reasoning-head">
        <div class="lbl">
          Reasoning <span class="steps">· ${steps.length} steps · ${mins} min of thinking</span>
        </div>
        <button class="reasoning-toggle">Collapse ${ICON.chevD}</button>
      </div>
      <div class="reasoning-steps">
        ${steps.map((s, i) => `
          <div class="reasoning-step">
            <div class="n">${i + 1}</div>
            <div class="txt">${s}</div>
          </div>`).join('')}
      </div>
    </section>`;
}

/* ───────── Composer ───────── */

function composer(placeholder = 'Reply inline, or draft a revision request…') {
  return `
    <footer class="composer">
      <div class="avatar">MA</div>
      <div class="composer-field">
        <div class="ph">${placeholder}</div>
        <div class="composer-tools">
          <div class="left">
            <button class="tool-btn">${ICON.plus} Attach</button>
            <button class="tool-btn">${ICON.edit} Mention</button>
          </div>
          <div class="right">
            <span class="tool-btn"><span class="kbd">⌘↵</span> to send</span>
            <button class="composer-send">${ICON.send} Send</button>
          </div>
        </div>
      </div>
    </footer>`;
}

/* ══════════════ PANEL 1 — Thread list ══════════════ */

(function panel1(){
  const slot = document.getElementById('d1-slot');
  if (!slot) return;

  const html = `
    <div class="eyebrow">Deliverable 01 · Shell + thread list</div>
    <h1>The triage surface, final.</h1>
    <p class="lede">
      You open the app and see this. Seven things are waiting for you — but the two on top are literally blocking agents from continuing work. Everything else is sorted by <strong>attention-economy priority</strong>, not by kind.
    </p>

    <h3>Final mockup</h3>
    <div class="dlv-frame-scroll"><div class="dlv-frame shell-4-rail">
      ${iconRail('conv')}
      ${submenu(null /* nothing selected on this screen */)}
      <main class="main">
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;gap:14px;padding:40px;color:var(--text-lo);text-align:center;">
          <div style="font-family:var(--font-heading);font-size:20px;color:var(--text-mid);">Select a conversation to begin triage</div>
          <div style="font-size:13px;max-width:420px;line-height:1.6;">
            Press <span class="kbd" style="font-family:var(--font-mono);background:var(--surface-3);padding:2px 6px;border-radius:2px;font-size:11px;">J</span> / <span class="kbd" style="font-family:var(--font-mono);background:var(--surface-3);padding:2px 6px;border-radius:2px;font-size:11px;">K</span> to move through the list, or
            <span class="kbd" style="font-family:var(--font-mono);background:var(--surface-3);padding:2px 6px;border-radius:2px;font-size:11px;">⌘K</span> to jump to any thread. Blocking items always rise to the top — agents are paused until you respond.
          </div>
        </div>
      </main>
      ${railExpanded()}
    </div></div>

    <div class="dlv-caption from">
      <span class="src">From A</span>
      <div class="txt">
        <strong>Section ordering — Pinned → Blocking → Reviews → Chats → Resolved.</strong> Blocking outranks kind because the cost of an idle paused agent dominates the cost of a mis-categorized item. The Chief-of-Staff chat sits pinned at the top permanently — it's the daily orientation surface.
        <strong>Kind badges</strong> (<code>BLOCKING</code> / <code>REVIEW</code> / <code>CHAT</code>) stay on every row so the user never loses the kind-vs-status distinction, even inside a &ldquo;blocking&rdquo; group that contains both reviews and chats.
      </div>
    </div>
    <div class="dlv-caption keep">
      <span class="src">From B</span>
      <div class="txt">
        <strong><code>StatusChip</code> color map stays as-is.</strong> <code>blocked</code> renders in amber (warning), not red (error). A's original design had <code>blocking</code> on the <em>row</em> colored red — that's fine, because the row is communicating &ldquo;you, the human, are blocking this,&rdquo; which <em>is</em> an error-level attention event. But the status of the artifact itself ("blocked") remains warning-amber.
        <strong>Data shape untouched:</strong> the submenu reads straight off <code>threads.ts</code> and groups in-memory — no new fields required.
      </div>
    </div>
  `;
  slot.innerHTML = html;
})();

/* ══════════════ PANEL 7 — Chief of Staff chat (before other kinds so I can reuse state) ══════════════ */
// Panels 2–6 inserted by synthesis-panels-2.js to keep file size manageable.
// Panel 7 lives here because the dataset is self-contained.

(function panel7(){
  const slot = document.getElementById('d7-slot');
  if (!slot) return;

  const chat = `
    <div class="dlv-frame-scroll"><div class="dlv-frame shell-4">
      ${iconRail('conv')}
      ${submenu('cos')}
      <main class="main">
        <header class="chat-head">
          <div class="avatar">CS</div>
          <div class="identity">
            <div class="n">Chief of Staff <span class="chip paused" style="font-size:9px;"><span class="dot"></span>COORDINATOR</span></div>
            <div class="sub"><span class="pin">${ICON.pin} PINNED</span> · always-on · no verdict actions</div>
          </div>
          <div class="actions">
            <button class="vbtn ghost">${ICON.pause} Mute</button>
            <button class="vbtn ghost">${ICON.more}</button>
          </div>
        </header>

        <div class="chat-body">
          <div class="chat-section-break">
            <span class="line"></span>
            <span class="lbl">Today · Oct 24</span>
            <span class="line"></span>
          </div>

          <div class="chat-msg">
            <div class="avatar bot">CS</div>
            <div class="body">
              <div class="head">
                <span class="n">Chief of Staff</span>
                <span class="r">morning roll-up</span>
                <span class="t">09:02</span>
              </div>
              <div class="text">
                Good morning, Max. Here's where your fleet stands. <strong>Two items are blocking you</strong>; both have been waiting 10+ minutes and their agents are paused.
              </div>
              <div class="chat-inline-artifact">
                <div class="h">
                  <span class="l">Fleet status · 6 active agents</span>
                  <button class="open">View all ${ICON.chevR}</button>
                </div>
                <div class="items">
                  <div class="item block">
                    <span class="dot"></span>
                    <div><span class="t">Orbit · Q3 perf report</span> <span class="s">blocked · 14m</span></div>
                    <span class="s">r1</span>
                  </div>
                  <div class="item block">
                    <span class="dot"></span>
                    <div><span class="t">Tessera · api-gateway v2.4.1 deploy</span> <span class="s">blocked · 24m</span></div>
                    <span class="s">r2</span>
                  </div>
                  <div class="item warn">
                    <span class="dot"></span>
                    <div><span class="t">Lumen · structured-outputs post</span> <span class="s">in review · 42m</span></div>
                    <span class="s">r3</span>
                  </div>
                  <div class="item ok">
                    <span class="dot"></span>
                    <div><span class="t">Forge · PR #2041 rate limiter</span> <span class="s">ready</span></div>
                    <span class="s">r5</span>
                  </div>
                  <div class="item ok">
                    <span class="dot"></span>
                    <div><span class="t">Prism · landing hero revision</span> <span class="s">ready</span></div>
                    <span class="s">r4</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="chat-msg group">
            <div class="avatar bot">CS</div>
            <div class="body">
              <div class="text">
                Recommended order: <strong>Tessera first</strong> (deploy window closes at 11:00), then <strong>Orbit</strong> (stakeholder review at 14:00). Both should take under 5 min each if the reasoning is sound.
              </div>
            </div>
          </div>

          <div class="chat-msg">
            <div class="avatar human">MA</div>
            <div class="body">
              <div class="head">
                <span class="n">Max Alvarez</span>
                <span class="t">09:04</span>
              </div>
              <div class="text">
                What's Orbit stuck on? Is it the same metrics framework issue we saw last week?
              </div>
            </div>
          </div>

          <div class="chat-msg">
            <div class="avatar bot">CS</div>
            <div class="body">
              <div class="head">
                <span class="n">Chief of Staff</span>
                <span class="r">coordinator</span>
                <span class="t">09:04</span>
              </div>
              <div class="text">
                Different this time. Orbit detected a <strong>12% drop in activation rate</strong> that's <em>outside its confidence interval</em> and paused rather than publish a potentially misleading report. It has three explanations ranked by plausibility — it's asking you to pick one before it finalizes the narrative.
              </div>
              <div class="text" style="margin-top:8px;">
                The underlying data is clean (I double-checked with <code>Atlas</code>). This is a judgment call, not a data-quality issue.
              </div>
              <div class="reactions">
                <span class="chat-reaction mine">👀 1</span>
                <span class="chat-reaction">💡 1</span>
              </div>
            </div>
          </div>

          <div class="chat-msg">
            <div class="avatar human">MA</div>
            <div class="body">
              <div class="head">
                <span class="n">Max Alvarez</span>
                <span class="t">09:05</span>
              </div>
              <div class="text">
                Good. Opening Orbit now. Snooze Tessera for 20 min.
              </div>
            </div>
          </div>

          <div class="chat-msg">
            <div class="avatar bot">CS</div>
            <div class="body">
              <div class="head">
                <span class="n">Chief of Staff</span>
                <span class="r">coordinator</span>
                <span class="t">09:05</span>
              </div>
              <div class="text">
                Snoozed Tessera until 09:25. I'll re-surface if its deploy window moves. Opening <strong>Orbit · Q3 performance report</strong> now.
              </div>
            </div>
          </div>
        </div>

        ${composer('Ask the Chief of Staff about your fleet, or delegate a decision…')}
      </main>
      ${railCollapsed()}
    </div></div>`;

  slot.innerHTML = `
    <div class="eyebrow">Deliverable 07 · Chief of Staff · chat variant</div>
    <h1>The chat that isn't a review.</h1>
    <p class="lede">
      Every agent-review thread has a verdict toolbar. This one doesn't. The Chief of Staff is a <strong>coordinator</strong> — it routes your attention, answers &ldquo;what's blocking me?&rdquo; and delegates on your behalf. There's no approve/reject because there's no artifact to approve or reject.
    </p>
    <h3>Final mockup</h3>
    ${chat}
    <div class="dlv-caption keep">
      <span class="src">From B</span>
      <div class="txt">
        <strong>Chat is a distinct mode, not review-minus-verdicts.</strong> Different header (agent identity + pin status + mute action), no <code>ReviewHeader</code>, messages can embed artifact previews inline with a one-click open. The embedded &ldquo;Fleet status&rdquo; card is a live reference that updates as threads change state — it's not a snapshot.
      </div>
    </div>
    <div class="dlv-caption from">
      <span class="src">From A</span>
      <div class="txt">
        <strong>Grouped messages.</strong> Consecutive messages from the same author within 2 min collapse into one visual group — avatar and header only on the first, subsequent messages indent under it. This halves vertical space in a CoS stream (where the bot often posts 3-4 updates in a row) without losing timestamp precision.
        <strong>Reactions are visible but quiet.</strong> They're a signal, not the primary interaction.
      </div>
    </div>
  `;
})();

/* ══════════════ PANELS 2–6 via secondary script ══════════════ */
