/* shell-synth-panels.js — deliverable-tab content for ShellSynthesis.html
   Populates #d1-slot through #delta-slot with mockups + annotations. */

const set = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };

const ICON = {
  conv:   '<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h14v9H9l-4 3v-3H3z"/></svg>',
  work:   '<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="14" height="10" rx="1"/><path d="M7 6V4h6v2"/></svg>',
  know:   '<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h9l3 3v9H4z"/><path d="M13 4v3h3"/></svg>',
  set:    '<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="2.5"/><path d="M10 3v2M10 15v2M3 10h2M15 10h2M5 5l1.4 1.4M13.6 13.6L15 15M5 15l1.4-1.4M13.6 6.4L15 5"/></svg>',
  search: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="7" r="4.5"/><path d="m11 11 3 3"/></svg>',
  close:  '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
  chevR:  '<svg viewBox="0 0 14 14" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m5 3 4 4-4 4"/></svg>',
  chevL:  '<svg viewBox="0 0 14 14" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 3-4 4 4 4"/></svg>',
  chevD:  '<svg viewBox="0 0 14 14" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m3 5 4 4 4-4"/></svg>',
  convS:  '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h12v8H6l-3 3v-3H2z"/></svg>',
  workS:  '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="12" height="8" rx="1"/><path d="M6 5V3.5h4V5"/></svg>',
  knowS:  '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3h8l2 2v8H3z"/><path d="M11 3v2h2"/></svg>',
};

/* ───────── Shared shell fragments ───────── */

function iconRail(active) {
  const item = (key, svg, lbl, badge) => `
    <button class="ir-btn ${active === key ? 'active' : ''}" title="${lbl}">
      ${svg}
      ${badge ? `<span class="ir-badge">${badge}</span>` : ''}
    </button>`;
  return `
    <nav class="ir">
      <div class="ir-top">
        ${item('conv', ICON.conv, 'Conversations', active === 'conv' ? '' : '3')}
        ${item('work', ICON.work, 'Work')}
        ${item('know', ICON.know, 'Knowledge')}
      </div>
      <div class="ir-bottom">
        <button class="ir-btn" title="Settings (user)">
          <div class="ir-avatar" style="width:28px;height:28px">MA</div>
        </button>
      </div>
    </nav>`;
}

function submenu() {
  return `
    <aside class="sm">
      <div class="sm-head">
        <div class="sm-title">
          <span class="t">Conversations</span>
          <span class="c">7</span>
        </div>
        <button class="sm-collapse" title="Collapse">${ICON.chevL}</button>
      </div>
      <div class="sm-filters">
        <button class="sm-filter active">All</button>
        <button class="sm-filter">Review</button>
        <button class="sm-filter">Chats</button>
        <button class="sm-filter">Resolved</button>
      </div>
      <div class="sm-search">
        ${ICON.search}
        <input placeholder="Search conversations…" disabled />
        <span class="kbd">⌘K</span>
      </div>
      <div class="sm-list">
        <div class="sm-section blocking">Blocking you <span class="c">2</span></div>
        <div class="tr blocking unread">
          <div class="tr-avatar bot">AR</div>
          <div class="tr-body">
            <div class="tr-top">
              <span class="tr-name">Architect</span>
              <span class="tr-role">AGT</span>
              <span class="tr-time">3m</span>
            </div>
            <div class="tr-subject">Waiting on auth spec approval</div>
            <div class="tr-meta">
              <span class="kind blocking">Blocking</span>
              <span class="chip blocked"><span class="dot"></span>BLOCKED</span>
            </div>
          </div>
        </div>
        <div class="tr blocking">
          <div class="tr-avatar bot">DV</div>
          <div class="tr-body">
            <div class="tr-top">
              <span class="tr-name">Developer</span>
              <span class="tr-role">AGT</span>
              <span class="tr-time">14m</span>
            </div>
            <div class="tr-subject">API schema divergence — needs call</div>
            <div class="tr-meta">
              <span class="kind blocking">Blocking</span>
            </div>
          </div>
        </div>
        <div class="sm-section">Needs review <span class="c">3</span></div>
        <div class="tr selected unread">
          <div class="tr-avatar bot">AR</div>
          <div class="tr-body">
            <div class="tr-top">
              <span class="tr-name">Architect</span>
              <span class="tr-role">AGT</span>
              <span class="tr-time">1h</span>
            </div>
            <div class="tr-subject">Session management review</div>
            <div class="tr-meta">
              <span class="kind review">Text diff</span>
            </div>
          </div>
          <div class="tr-right"><span class="tr-unread-dot"></span></div>
        </div>
        <div class="tr">
          <div class="tr-avatar bot">PM</div>
          <div class="tr-body">
            <div class="tr-top">
              <span class="tr-name">Product Manager</span>
              <span class="tr-role">AGT</span>
              <span class="tr-time">2h</span>
            </div>
            <div class="tr-subject">Q4 roadmap — Alpha product line</div>
            <div class="tr-meta">
              <span class="kind review">Action summary</span>
            </div>
          </div>
        </div>
        <div class="sm-section">Chats <span class="c">1</span></div>
        <div class="tr">
          <div class="tr-avatar human">MA</div>
          <div class="tr-body">
            <div class="tr-top">
              <span class="tr-name">Chief of Staff</span>
              <span class="tr-role">CoS</span>
              <span class="tr-time">yday</span>
            </div>
            <div class="tr-subject">Weekly sync — priorities &amp; costs</div>
            <div class="tr-meta">
              <span class="kind chat">Chat</span>
            </div>
          </div>
        </div>
      </div>
    </aside>`;
}

function mainStub() {
  return `
    <main class="main-stub">
      <div class="hbar w30" style="height:18px;background:var(--surface-4)"></div>
      <div class="hbar w60"></div>
      <div class="hbar w80"></div>
      <div class="hbar w40"></div>
      <div class="card">
        <div class="hbar w30"></div>
        <div class="hbar w80" style="height:6px"></div>
        <div class="hbar w60" style="height:6px"></div>
        <div class="hbar w60" style="height:6px"></div>
      </div>
      <div class="card">
        <div class="hbar w30"></div>
        <div class="hbar w80" style="height:6px"></div>
        <div class="hbar w40" style="height:6px"></div>
      </div>
    </main>`;
}

function railCollapsed() {
  return `
    <aside class="rail-c">
      <div class="rail-pill danger" title="2 blocking"><span class="n">2</span><span class="l">BLK</span></div>
      <div class="rail-pill primary" title="3 in review"><span class="n">3</span><span class="l">REV</span></div>
      <div class="rail-pill warn" title="1 paused"><span class="n">1</span><span class="l">PSD</span></div>
      <button class="rail-toggle" title="Expand">${ICON.chevL}</button>
    </aside>`;
}

function railExpanded() {
  return `
    <aside class="rail-e">
      <div class="rail-e-head">
        <span class="t">Status</span>
        <button title="Collapse">${ICON.chevR}</button>
      </div>

      <div class="rail-sec">
        <div class="rail-sec-head blk">Blockers <span class="c">1</span></div>
        <div class="rail-item">
          <div class="top">
            <span class="tt">Developer</span>
            <span class="chip blocked"><span class="dot"></span>HIGH</span>
          </div>
          <div class="sub">Waiting for API spec</div>
        </div>
      </div>

      <div class="rail-sec">
        <div class="rail-sec-head">Active bets <span class="c">2</span></div>
        <div class="rail-item">
          <div class="top">
            <span class="tt">User auth flow</span>
            <span class="chip healthy"><span class="dot"></span>HEALTHY</span>
          </div>
          <div class="sub">Alpha · Architect</div>
        </div>
        <div class="rail-item">
          <div class="top">
            <span class="tt">Dashboard redesign</span>
            <span class="chip blocked"><span class="dot"></span>BLOCKED</span>
          </div>
          <div class="sub">Beta · Designer</div>
        </div>
      </div>

      <div class="rail-sec">
        <div class="rail-sec-head">Cost</div>
        <div style="padding:4px 4px 2px">
          <div class="rail-kv"><span class="l">Today</span><span class="v">$12.40 / $50</span></div>
          <div class="meter"><div class="fill" style="width:25%"></div></div>
        </div>
        <div style="padding:8px 4px 4px">
          <div class="rail-kv"><span class="l">Week</span><span class="v">$84.20 / $350</span></div>
          <div class="meter"><div class="fill" style="width:24%"></div></div>
        </div>
      </div>
    </aside>`;
}

function reviewHeader() {
  return `
    <section class="rh">
      <div class="rh-top">
        <div class="rh-proposer">
          <div class="rh-avatar">AR</div>
          <div class="rh-identity">
            <div class="name">Architect <span class="role">AGT · L3</span></div>
            <div class="sub">proposing <span class="ok">session-management.ts</span> · <span class="warn">SLA 2h</span></div>
          </div>
        </div>
        <div class="rh-verdicts" style="display:flex;gap:6px;align-items:center">
          <button class="btn-danger">Reject <span style="opacity:.5;font-family:var(--font-mono);font-size:10px;margin-left:6px">X</span></button>
          <button class="btn-ghost-s">Changes <span style="opacity:.5;font-family:var(--font-mono);font-size:10px;margin-left:6px">R</span></button>
          <button class="btn-primary">Approve <span style="opacity:.6;font-family:var(--font-mono);font-size:10px;margin-left:6px">A</span></button>
        </div>
      </div>
    </section>
    <div style="padding:24px 20px;display:flex;flex-direction:column;gap:14px">
      <div style="font-family:var(--font-heading);font-size:22px;font-weight:600;color:var(--text-hi);letter-spacing:-0.01em">Session management refactor</div>
      <div style="font-size:13px;color:var(--text-mid);line-height:1.6;max-width:640px">Consolidates three session-token call sites into a single <span style="font-family:var(--font-mono);color:var(--primary);background:var(--surface-ghost);padding:1px 5px;border-radius:2px">SessionToken</span> wrapper. Changes touch <span style="font-family:var(--font-mono);color:var(--primary);background:var(--surface-ghost);padding:1px 5px;border-radius:2px">auth/*</span> and <span style="font-family:var(--font-mono);color:var(--primary);background:var(--surface-ghost);padding:1px 5px;border-radius:2px">api/session</span>.</div>
      <div style="background:var(--surface-2);border-radius:4px;padding:16px;display:flex;flex-direction:column;gap:10px;max-width:720px">
        <div style="font-family:var(--font-mono);font-size:10px;letter-spacing:0.1em;color:var(--text-lo);text-transform:uppercase;font-weight:700">Reasoning · 3 steps</div>
        <div style="font-size:13px;color:var(--text-mid);line-height:1.55"><strong style="color:var(--text-hi)">1.</strong> The three sites duplicate refresh-retry logic, which already diverged last quarter…</div>
        <div style="font-size:13px;color:var(--text-mid);line-height:1.55"><strong style="color:var(--text-hi)">2.</strong> A single wrapper centralizes expiry handling and reduces the surface area of future changes…</div>
        <div style="font-size:13px;color:var(--text-mid);line-height:1.55"><strong style="color:var(--text-hi)">3.</strong> Trade-off: one new abstraction vs. three bespoke handlers. Net reduction in LoC is ~40%.</div>
      </div>
    </div>`;
}

/* ═══════════════════════════════════════════════════════
   D1 · Tokens & primitives sheet
═══════════════════════════════════════════════════════ */

function d1() {
  const surfaces = [
    ['0','#000000','App background'],
    ['1','#0e0e0e','IconRail · chrome'],
    ['2','#131313','Submenu · card bg'],
    ['3','#191a1a','Hover · row tint'],
    ['4','#1f2020','Active · selected'],
    ['5','#252626','Scrollbar · input'],
    ['6','#2c2c2c','Raised · toggle'],
  ];
  const texts = [
    ['hi','#e7e5e4','Body, headings, primary labels'],
    ['mid','#acabaa','Secondary copy, descriptions'],
    ['lo','#767575','Meta, timestamps, eyebrow'],
  ];
  const semantic = [
    ['primary','#adc6ff','Selection, active, links'],
    ['secondary','#d58f24','"Behind" status'],
    ['accent','#bbffb3','"Healthy", success'],
    ['warning','#d58f24','"Blocked" (stuck)'],
    ['error','#ee7d77','"Error" (broken)'],
  ];
  const statuses = [
    ['healthy','var(--accent)','#bbffb3','Agent on track'],
    ['behind','var(--secondary)','#d58f24','Behind schedule'],
    ['blocked','var(--warning)','#d58f24','Stuck · recoverable'],
    ['paused','var(--text-lo)','#767575','Agent paused'],
    ['done','var(--success)','#bbffb3','Work complete'],
    ['error','var(--error)','#ee7d77','Intervention needed'],
  ];

  const surfHTML = surfaces.map(([k, hex, use]) => `
    <div class="tok">
      <div class="sw" style="background:${hex}"></div>
      <div class="n">surface-${k}</div>
      <div class="hex">${hex}</div>
      <div class="use">${use}</div>
    </div>`).join('');

  const textHTML = texts.map(([k, hex, use]) => `
    <div class="tok">
      <div class="sw" style="background:${hex}"></div>
      <div class="n">text-${k}</div>
      <div class="hex">${hex}</div>
      <div class="use">${use}</div>
    </div>`).join('');

  const semHTML = semantic.map(([k, hex, use]) => `
    <div class="tok">
      <div class="sw" style="background:${hex}"></div>
      <div class="n">${k}</div>
      <div class="hex">${hex}</div>
      <div class="use">${use}</div>
    </div>`).join('');

  const statusHTML = statuses.map(([k, v, hex, use]) => `
    <div class="tok">
      <span class="chip ${k}" style="align-self:flex-start"><span class="dot"></span>${k.toUpperCase()}</span>
      <div class="n">chip · ${k}</div>
      <div class="hex">${hex}</div>
      <div class="use">${use}</div>
    </div>`).join('');

  return `
    <div class="eyebrow">Deliverable 01 · Tokens &amp; primitives</div>
    <h1>A single, reconciled token scale.</h1>
    <p class="lede">Version B's <code>factory-dark</code> daisyUI theme plus Version A's seven-step surface ramp, rebuilt as one coherent sheet. Every token below maps to a CSS custom property in <code>web/src/index.css</code> or a daisyUI semantic in <code>web/tailwind.config.ts</code>.</p>

    <h2>Surfaces · 7-step tonal ramp <span class="vs-badge B">B · index.css</span></h2>
    <p>No borders anywhere. Layering is done by tone. The ramp is non-linear — tight between 0→3 (ambient layering), wider between 4→6 (active / raised affordances).</p>
    <div class="tok-grid surfaces">${surfHTML}</div>

    <h2>Text · 3-tone hierarchy <span class="vs-badge B">B · index.css</span></h2>
    <p>Three is enough. Body is <code>--text-hi</code>; anything less important steps down one. <code>--text-lo</code> is for meta and mono eyebrow copy — never primary content.</p>
    <div class="tok-grid text">${textHTML}</div>

    <h2>Semantic · daisyUI theme <span class="vs-badge B">B · tailwind.config.ts</span></h2>
    <p>daisyUI semantic names are canonical because every <code>btn</code>, <code>badge</code>, and <code>input</code> in the codebase already reads them. The synthesis does <strong>not</strong> add new color channels — A's "ember / sage" accent-swap tweak is dropped.</p>
    <div class="tok-grid semantic">${semHTML}</div>

    <h2>Status chip · canonical mapping <span class="vs-badge B">B · StatusChip.tsx</span></h2>
    <p>From <code>STATUS_BADGE_CLASS</code> in <code>StatusChip.tsx</code>. The important row is <strong>blocked ≠ error</strong> — blocked is amber (stuck, recoverable), error is red (broken, needs intervention). This was A's biggest semantic miss.</p>
    <div class="tok-grid status">${statusHTML}</div>

    <h2>Type · Inter + Space Grotesk</h2>
    <p>Inter for reading, Space Grotesk for headings and for the mono-eyebrow pattern. The mono is <em>not</em> for code — code reuses the same mono for visual consistency, but its role is the small-caps eyebrow (section headers, status chip labels, keybind hints).</p>

    <div class="misc-grid">
      <div class="misc-cell">
        <h4>Type scale</h4>
        <div class="type-sample">
          <div class="row"><span class="lbl">h1</span><span class="s1">The system underneath.</span></div>
          <div class="row"><span class="lbl">h2</span><span class="s2">Section heading</span></div>
          <div class="row"><span class="lbl">body</span><span class="s3">Primary body copy · 14/1.55</span></div>
          <div class="row"><span class="lbl">body-2</span><span class="s4">Secondary copy · 13/1.55</span></div>
          <div class="row"><span class="lbl">eyebrow</span><span class="s5">Eyebrow · 10 mono · 0.1em</span></div>
        </div>
      </div>

      <div class="misc-cell">
        <h4>Radii · tailwind config</h4>
        <div class="radius-sample">
          <div class="radius-row"><div class="box btn"></div><div class="meta"><strong>--rounded-btn</strong> &nbsp; 2px<br/>buttons, badges, chips</div></div>
          <div class="radius-row"><div class="box box-r"></div><div class="meta"><strong>--rounded-box</strong> &nbsp; 4px<br/>cards, panels, drawer</div></div>
          <div class="radius-row"><div class="box pill"></div><div class="meta"><strong>pill</strong> &nbsp; 999px<br/>avatar, indicator rails</div></div>
        </div>
      </div>

      <div class="misc-cell">
        <h4>Button variants</h4>
        <div style="display:flex;flex-direction:column;gap:10px">
          <button class="btn-primary">Approve &nbsp;<span style="opacity:.6;font-family:var(--font-mono);font-size:10px">A</span></button>
          <button class="btn-ghost-s">Request changes &nbsp;<span style="opacity:.5;font-family:var(--font-mono);font-size:10px">R</span></button>
          <button class="btn-danger">Reject &nbsp;<span style="opacity:.5;font-family:var(--font-mono);font-size:10px">X</span></button>
          <div style="font-family:var(--font-mono);font-size:10px;color:var(--text-lo);letter-spacing:0.05em;margin-top:4px;line-height:1.5">Primary · <code style="background:var(--surface-ghost);padding:1px 4px;border-radius:2px;color:var(--primary)">btn btn-primary btn-sm</code><br/>Ghost · <code style="background:var(--surface-ghost);padding:1px 4px;border-radius:2px;color:var(--primary)">btn btn-ghost btn-sm</code></div>
        </div>
      </div>
    </div>

    <h2>Primitives · the Tier 2 set</h2>
    <p>Nine components carry the whole system. Everything else is composed from these. Each is already a real file in <code>web/src/components/</code>; the synthesis only adds <em>visual</em> changes (noted per row).</p>

    <div class="prim-table">
      <div class="prim-cell head">Primitive</div>
      <div class="prim-cell head">Variants</div>
      <div class="prim-cell head">Sample</div>
      <div class="prim-cell head">Synthesis note</div>

      <div class="prim-cell row-label"><span>StatusChip</span><code>StatusChip.tsx</code></div>
      <div class="prim-cell hint">6 + unknown fallback</div>
      <div class="prim-cell" style="flex-direction:row;flex-wrap:wrap;gap:5px">
        <span class="chip healthy"><span class="dot"></span>HEALTHY</span>
        <span class="chip blocked"><span class="dot"></span>BLOCKED</span>
        <span class="chip error"><span class="dot"></span>ERROR</span>
      </div>
      <div class="prim-cell hint" style="color:var(--text-mid);font-family:var(--font-sans);font-size:12px">Keep as-is. The blocked ≠ error distinction is correct and intentional.</div>

      <div class="prim-cell row-label"><span>Tag</span><code>Tag.tsx</code></div>
      <div class="prim-cell hint">Neutral only</div>
      <div class="prim-cell" style="flex-direction:row;gap:5px">
        <span class="tag">ALPHA</span>
        <span class="tag">v0.4</span>
      </div>
      <div class="prim-cell hint" style="color:var(--text-mid);font-family:var(--font-sans);font-size:12px">Kind badge (<code style="font-size:10px">kind.blocking / review / chat</code>) lives <em>next to</em> Tag, not inside it.</div>

      <div class="prim-cell row-label"><span>KeyValue</span><code>KeyValue.tsx</code></div>
      <div class="prim-cell hint">inline · stacked</div>
      <div class="prim-cell" style="font-size:12px">
        <div class="rail-kv"><span class="l">Today</span><span class="v">$12.40</span></div>
        <div class="rail-kv"><span class="l">Budget</span><span class="v">$50.00</span></div>
      </div>
      <div class="prim-cell hint" style="color:var(--text-mid);font-family:var(--font-sans);font-size:12px">Keep. Add a third <code>layout="meter"</code> that renders the value above a 4px track — used in the Rail cost section.</div>

      <div class="prim-cell row-label"><span>NavItem</span><code>NavItem.tsx</code></div>
      <div class="prim-cell hint">selected · count</div>
      <div class="prim-cell">
        <div style="background:var(--surface-4);border-left:2px solid var(--primary);padding:6px 10px;font-size:13px;color:var(--text-hi);display:flex;justify-content:space-between;align-items:center;border-radius:0 2px 2px 0;width:180px">Review Queue <span class="tag">3</span></div>
        <div style="padding:6px 10px;font-size:13px;color:var(--text-mid);display:flex;justify-content:space-between;align-items:center;width:180px">Chat <span class="tag">1</span></div>
      </div>
      <div class="prim-cell hint" style="color:var(--text-mid);font-family:var(--font-sans);font-size:12px">Port A's spacing (6/10 instead of daisyUI's <code>menu-sm</code>). The 2px left rail is already there — keep it.</div>

      <div class="prim-cell row-label"><span>SearchField</span><code>SearchField.tsx</code></div>
      <div class="prim-cell hint">inline · focused</div>
      <div class="prim-cell">
        <div class="sm-search" style="margin:0"><span style="color:var(--text-lo)">${ICON.search}</span><input placeholder="Search…" disabled /><span class="kbd">⌘K</span></div>
      </div>
      <div class="prim-cell hint" style="color:var(--text-mid);font-family:var(--font-sans);font-size:12px">Use A's <strong>ghost-fill</strong> treatment (<code>surface-1</code> bg, no border) and add the ⌘K hint chip when this is the global search.</div>
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════
   D2 · Four-zone shell (IconRail + Submenu + Main + Rail)
═══════════════════════════════════════════════════════ */

function d2() {
  return `
    <div class="eyebrow">Deliverable 02 · The four-zone shell</div>
    <h1>IconRail · Submenu · Main · Rail.</h1>
    <p class="lede">The canonical layout. This is the Conversations view, <code>/conversations/review</code>, at ≥1280px — the widest breakpoint, where the Rail is expanded by default. Annotations number each element's provenance.</p>

    <div class="dlv-frame-scroll">
      <div class="dlv-frame shell-4-rail shell-overlay anno-wrap">
        ${iconRail('conv')}
        ${submenu()}
        <main class="main" style="background:var(--surface-0);overflow:hidden">${reviewHeader()}</main>
        ${railExpanded()}

        <!-- Annotation pins -->
        <div class="anno-pin A" style="top:30px;left:28px">1</div>
        <div class="anno-pin A" style="top:70px;left:28px">2</div>
        <div class="anno-pin B" style="top:150px;left:200px">3</div>
        <div class="anno-pin N" style="top:115px;left:330px">4</div>
        <div class="anno-pin A" style="top:80px;left:650px">5</div>
        <div class="anno-pin B" style="top:48px;left:1020px">6</div>
        <div class="anno-pin A" style="top:94px;left:1205px">7</div>
        <div class="anno-pin N" style="top:420px;left:1230px">8</div>
      </div>
    </div>

    <div class="anno-list">
      <div class="anno-row"><span class="n">1</span><span class="src A">A</span><div class="t"><strong>IconRail active state</strong> — 2px primary-color edge rail on the active view. From <code>HyperIdle.html</code> styles.css <code>.iconrail-item.active::before</code>.</div></div>
      <div class="anno-row"><span class="n">2</span><span class="src A">A</span><div class="t"><strong>Unread notification dot</strong> on inactive views. 6px circle, <code>--error</code>. Signals "there's something there" without requiring view switch.</div></div>
      <div class="anno-row"><span class="n">3</span><span class="src B">B</span><div class="t"><strong>Submenu 280px width</strong>, <code>surface-2</code> bg. Mono eyebrow title + count. From A's styles; matches <code>Submenu.tsx</code> structure.</div></div>
      <div class="anno-row"><span class="n">4</span><span class="src N">NEW</span><div class="t"><strong>Segmented filter row</strong> in Submenu — <code>All / Review / Chats / Resolved</code>. Not present in B's <code>Submenu.tsx</code>. Only rendered for Conversations &amp; Knowledge.</div></div>
      <div class="anno-row"><span class="n">5</span><span class="src A">A</span><div class="t"><strong>Blocking-you section</strong> with red section header + left-edge error tint on rows. Visually distinct from ordinary "Needs review" — attention, not taxonomy.</div></div>
      <div class="anno-row"><span class="n">6</span><span class="src B">B</span><div class="t"><strong>ReviewHeader verdict toolbar</strong>. Three surfaced (Approve A · Changes R · Reject X) + overflow <code>...</code>. Keybinds shown as mono hint chips.</div></div>
      <div class="anno-row"><span class="n">7</span><span class="src A">A</span><div class="t"><strong>Reasoning block</strong> — numbered, collapsible, above the artifact body. Uses <code>Message.reasoning?: string[]</code> which already exists in the data shape.</div></div>
      <div class="anno-row"><span class="n">8</span><span class="src N">NEW</span><div class="t"><strong>Rail cost meter</strong> — KeyValue with a 4px track below. Proposed <code>KeyValue.layout="meter"</code> variant; visually reinforces "25% through the budget."</div></div>
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════
   D3 · Responsive states (narrow · mid · wide)
═══════════════════════════════════════════════════════ */

function d3() {
  return `
    <div class="eyebrow">Deliverable 03 · Responsive states</div>
    <h1>Three breakpoints. One override rule.</h1>
    <p class="lede">Version B's <code>useViewportBreakpoint</code> is correct and keeps. This deliverable documents what each state looks like, and locks in the <strong>collapsed-rail pill stack</strong> from A as the default when Rail is closed.</p>

    <div class="resp-grid">

      <!-- Wide ≥1280 -->
      <div class="resp-block">
        <div class="resp-block-head">
          <div class="t">Wide · ≥1280px</div>
          <div class="meta"><strong>Submenu open</strong> · <strong>Rail expanded</strong></div>
        </div>
        <div class="resp-block-body wide">
          ${iconRail('conv')}
          ${submenu()}
          ${mainStub()}
          ${railExpanded()}
        </div>
        <div class="resp-caption">
          Default for desktop. <code>useViewportBreakpoint</code> returns <code>{submenuCollapsed: false, railExpanded: true}</code>.
          <strong>Per-axis overrides persist</strong> — once the user collapses the Rail, that choice sticks even if they cross 1280 again.
        </div>
      </div>

      <!-- Mid 1024..1279 -->
      <div class="resp-block">
        <div class="resp-block-head">
          <div class="t">Mid · 1024–1279px</div>
          <div class="meta"><strong>Submenu open</strong> · <strong>Rail collapsed</strong></div>
        </div>
        <div class="resp-block-body mid">
          ${iconRail('conv')}
          ${submenu()}
          ${mainStub()}
          ${railCollapsed()}
        </div>
        <div class="resp-caption">
          Rail auto-collapses below 1280 to reclaim width for the Main review area. The collapsed Rail is <strong>not empty</strong> — it renders <span class="vs-badge A">A</span> the three semantic pills (<code>BLK</code> error · <code>REV</code> primary · <code>PSD</code> warning) so the status signal survives the collapse.
        </div>
      </div>

      <!-- Narrow <1024 -->
      <div class="resp-block">
        <div class="resp-block-head">
          <div class="t">Narrow · &lt;1024px</div>
          <div class="meta"><strong>Submenu collapsed</strong> · <strong>Rail collapsed</strong></div>
        </div>
        <div class="resp-block-body narrow">
          ${iconRail('conv')}
          <div></div>
          ${mainStub()}
          ${railCollapsed()}
        </div>
        <div class="resp-caption">
          Below 1024 the Submenu folds to <code>w-0 overflow-hidden</code>. The IconRail + Rail-collapsed stay visible — they are the two <em>always-on</em> signal surfaces. Users re-open the Submenu via the chevron inside the IconRail's active-view button (<span class="vs-badge N">NEW</span>: B currently has no affordance to re-open once collapsed on narrow).
        </div>
      </div>

    </div>

    <h2>Override model <span class="vs-badge B">B · AppShell.tsx</span></h2>
    <p>
      The override semantics in <code>AppShell.tsx</code> are worth citing verbatim. Each axis has a <code>null | true | false</code> state: <code>null</code> means "follow the viewport," <code>true/false</code> means "the user has a preference." Once set, the user's preference wins on subsequent resizes <em>until they toggle again</em>.
      This is the right model — it means resizing the browser quietly adapts for first-time users, but once you collapse the Rail because you want more room, the Rail <strong>stays collapsed</strong> until you bring it back. Do not weaken this.
    </p>
  `;
}

/* ═══════════════════════════════════════════════════════
   D4 · Settings drawer + Command-K overlay
═══════════════════════════════════════════════════════ */

function d4() {
  return `
    <div class="eyebrow">Deliverable 04 · Settings &amp; ⌘K</div>
    <h1>Configuration without interruption.</h1>
    <p class="lede">Two floating surfaces with near-identical behavior contracts: open on a trigger, close on <kbd>Esc</kbd> or outside click, keyboard-navigable, route-aware. A treated Settings as a fifth view; B made it a modal. The synthesis turns both into right-aligned surfaces sharing the same design language.</p>

    <h2>Settings · right-side drawer <span class="vs-badge NEW">NEW</span></h2>
    <p>A 420px drawer slides in from the right, pushing the Rail out. The Submenu + Main stay visible — you can still see <em>where</em> you were while editing Settings. Closes on Esc (same keyboard contract as ⌘K) or outside click. Replaces both A's "fifth-view" approach and B's <code>SettingsPanel</code> modal.</p>

    <div class="dlv-frame-scroll">
      <div class="drawer-frame">
        ${iconRail('conv')}
        ${submenu()}
        <main class="main-stub" style="background:var(--surface-0);padding:32px;filter:brightness(0.7)">
          <div class="hbar w30" style="height:18px;background:var(--surface-4)"></div>
          <div class="hbar w60"></div>
          <div class="hbar w80"></div>
          <div class="hbar w40"></div>
          <div class="card"><div class="hbar w30"></div><div class="hbar w80" style="height:6px"></div><div class="hbar w60" style="height:6px"></div></div>
        </main>
        <aside class="drawer">
          <div class="drawer-head">
            <div class="t">Settings</div>
            <button class="close" title="Close · Esc">${ICON.close}</button>
          </div>
          <div class="drawer-nav">
            <button class="active">Profile<span class="kb">P</span></button>
            <button>Agents<span class="kb">A</span></button>
            <button>Products<span class="kb">D</span></button>
            <button>Notifications<span class="kb">N</span></button>
            <button>Appearance<span class="kb">V</span></button>
          </div>
          <div class="drawer-body">
            <div class="section-title">Identity</div>
            <div class="drawer-field">
              <label>Display name</label>
              <div class="input">Max Addison</div>
            </div>
            <div class="drawer-field">
              <label>Email</label>
              <div class="input muted">founder@hyperidle.com</div>
            </div>

            <div class="section-title" style="margin-top:12px">Appearance</div>
            <div class="drawer-toggle-row">
              <div class="meta"><span class="t">Density</span><span class="d">Affects row padding across all views</span></div>
              <div class="seg">
                <button>Compact</button>
                <button class="active">Default</button>
                <button>Comfy</button>
              </div>
            </div>
            <div class="drawer-toggle-row">
              <div class="meta"><span class="t">Rail default</span><span class="d">Shown when viewport ≥1280</span></div>
              <div class="seg">
                <button>Collapsed</button>
                <button class="active">Expanded</button>
              </div>
            </div>

            <div class="section-title" style="margin-top:12px">Notifications</div>
            <div class="drawer-toggle-row">
              <div class="meta"><span class="t">Review alerts</span><span class="d">Ping when an agent needs review</span></div>
              <div class="toggle on"></div>
            </div>
            <div class="drawer-toggle-row">
              <div class="meta"><span class="t">Blocker alerts</span><span class="d">Ping when an agent is blocked</span></div>
              <div class="toggle on"></div>
            </div>
            <div class="drawer-toggle-row">
              <div class="meta"><span class="t">Cost alerts</span><span class="d">Ping when crossing budget</span></div>
              <div class="toggle"></div>
            </div>
          </div>
        </aside>
      </div>
    </div>

    <div class="anno-list">
      <div class="anno-row"><span class="n">1</span><span class="src N">NEW</span><div class="t"><strong>Drawer, not modal.</strong> Slides over the Rail only. Submenu + Main remain visible but slightly dimmed to focus attention.</div></div>
      <div class="anno-row"><span class="n">2</span><span class="src A">A</span><div class="t"><strong>Section nav with keybinds.</strong> <code>P / A / D / N / V</code> jump between sections — mono hint chips on each item, matching the verdict-toolbar pattern in ReviewHeader.</div></div>
      <div class="anno-row"><span class="n">3</span><span class="src B">B</span><div class="t"><strong>Shape matches <code>SettingsData</code></strong> (<code>DEFAULT_SETTINGS</code> in <code>app-shell-data.ts</code>). Profile / Agents / Products / Notifications / Appearance — nothing added, nothing hidden.</div></div>
      <div class="anno-row"><span class="n">4</span><span class="src B">B</span><div class="t"><strong>Density setting now active.</strong> <code>appearance.density</code> exists in the schema but doesn't drive anything today. Wire it to a <code>data-density</code> attribute on the root element.</div></div>
    </div>

    <h2 style="margin-top:72px">Command-K · global search overlay <span class="vs-badge NEW">NEW</span></h2>
    <p>A real visual design for <code>GlobalSearchPanel</code>. Same keyboard contract as <code>useCommandK</code> already defines: <kbd>⌘K</kbd> opens, <kbd>Esc</kbd> closes, arrow keys move the active item, <kbd>Enter</kbd> routes via <code>handleSearchNavigate</code>. Results are grouped by type — the three routes B already handles.</p>

    <div class="dlv-frame-scroll">
      <div class="cmdk-frame">
        <!-- dimmed shell behind -->
        <div style="display:grid;grid-template-columns:56px 280px 1fr 56px;height:100%;filter:brightness(0.4)">
          ${iconRail('conv')}
          ${submenu()}
          ${mainStub()}
          ${railCollapsed()}
        </div>
        <div class="cmdk-backdrop"></div>
        <div class="cmdk-overlay">
          <div class="cmdk-input">
            ${ICON.search}
            <div class="q">session<span class="cursor"></span></div>
            <span class="esc">ESC</span>
          </div>
          <div class="cmdk-results">
            <div class="cmdk-group">Conversations</div>
            <div class="cmdk-item active">
              <span class="ic">${ICON.convS}</span>
              <span class="lbl">Session management refactor <span class="ctx">· Architect · 1h</span></span>
              <span class="tp conv">REVIEW</span>
            </div>
            <div class="cmdk-item">
              <span class="ic">${ICON.convS}</span>
              <span class="lbl">Session timeout policy <span class="ctx">· Developer · yday</span></span>
              <span class="tp conv">CHAT</span>
            </div>

            <div class="cmdk-group">Work</div>
            <div class="cmdk-item">
              <span class="ic">${ICON.workS}</span>
              <span class="lbl">Bet · Session persistence <span class="ctx">· Alpha · in progress</span></span>
              <span class="tp work">BET</span>
            </div>

            <div class="cmdk-group">Knowledge</div>
            <div class="cmdk-item">
              <span class="ic">${ICON.knowS}</span>
              <span class="lbl">Caching &amp; session boundaries <span class="ctx">· Practice · 3 sources</span></span>
              <span class="tp know">DOC</span>
            </div>
          </div>
          <div class="cmdk-footer">
            <span><span class="kbd">↑↓</span> navigate</span>
            <span><span class="kbd">↵</span> open</span>
            <span><span class="kbd">⌘↵</span> open in new pane</span>
            <span style="margin-left:auto">4 results</span>
          </div>
        </div>
      </div>
    </div>

    <div class="anno-list">
      <div class="anno-row"><span class="n">1</span><span class="src B">B</span><div class="t"><strong>Routes via <code>handleSearchNavigate</code>.</strong> The <code>type</code> field on each result drives <code>/work/bet/:id</code>, <code>/knowledge/:id</code>, or <code>/conversations/review</code> — already implemented in <code>AppShell.tsx</code>.</div></div>
      <div class="anno-row"><span class="n">2</span><span class="src B">B</span><div class="t"><strong>Id sanitization retained.</strong> <code>sanitizeRouteId</code> runs before <code>navigate()</code>. Results with unsafe ids are silently dropped — better than a broken route.</div></div>
      <div class="anno-row"><span class="n">3</span><span class="src A">A</span><div class="t"><strong>Ghost search input + grouped results.</strong> A's mono-eyebrow section headers (<code>Conversations / Work / Knowledge</code>) replace B's current flat list.</div></div>
      <div class="anno-row"><span class="n">4</span><span class="src N">NEW</span><div class="t"><strong>⌘↵ "open in new pane"</strong> as a footer hint. Not yet wired; reserved for a future split-view where a result can open alongside the current view instead of navigating.</div></div>
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════
   Critique
═══════════════════════════════════════════════════════ */

function crit() {
  const rows = [
    ['A','01','A over-indexed on visual tropes.',
      'The "Silent Intelligence" aesthetic is real and good. But the <strong>accent swap</strong> (<code>ice / sage / ember</code>) is a vanity knob — it doesn\'t affect information density, cognitive load, or error-rate. Drop it; keep the token discipline.'],
    ['B','02','B\'s Rail collapsed state is functionally dead.',
      'Two badges with no semantic color is information that doesn\'t persist. The 56px collapsed column <strong>must communicate</strong> — A\'s three-pill stack (<code>BLK / REV / PSD</code>) does this; B\'s doesn\'t. Ship A\'s version.'],
    ['A','03','A never committed to a responsive model.',
      'A\'s rail-toggle buttons in the prototype are a design affordance for the sheet, not a responsive rule. Without B\'s <code>useViewportBreakpoint</code> you have a beautiful desktop mock and nothing for 13" MacBook users.'],
    ['B','04','B\'s <code>Submenu</code> is under-designed for Conversations.',
      'The real product has blocking / needs-review / chats / resolved as attentional tiers. B renders them as a flat list. A\'s segmented filter + sectioned list is the right IA — port it, scope it to views that need it.'],
    ['A','05','A\'s ReviewHeader verdict row doesn\'t match the data.',
      'A shows three buttons. <code>VERDICT_ACTIONS</code> defines ten (in the Conversations synthesis). The real answer is <strong>four surfaced + overflow</strong>; A\'s three-button version hides the existence of <code>pause / escalate / delegate</code>.'],
    ['BOTH','06','Both prototypes leave Settings badly placed.',
      'A makes it a full view (too prominent for a configuration surface). B makes it a modal (too disruptive — you lose context). The drawer answer is cheap and correct and <strong>neither prototype proposed it</strong>.'],
    ['BOTH','07','Both under-specify the empty states.',
      'What does the Submenu look like when there are no blocking items? When Conversations has zero threads? Neither prototype addresses this. Proposed: <strong>hide empty sections entirely</strong> (don\'t render "Needs review (0)") and replace the whole list with a single copywritten card when everything is empty.'],
    ['BOTH','08','The density setting exists and does nothing.',
      '<code>SettingsData.appearance.density</code> has been in the schema for some time. A has the Tweaks control. B has the data shape. Neither wires them together. This is an hour of work and it\'s been sitting unclaimed.'],
  ];

  return `
    <div class="eyebrow">Critique · Rev 01</div>
    <h1>What each version gets wrong.</h1>
    <p class="lede">Every design has aesthetic strengths and structural gaps. These are the eight places where A, B, or both should have done better. The Delta section that follows maps each critique to a concrete file change.</p>

    <div class="crit-list">
      ${rows.map(([k, n, t, b]) => `
        <div class="crit">
          <div class="num">${n}</div>
          <div class="kind ${k}">${k === 'BOTH' ? 'Both' : 'Version ' + k}</div>
          <div class="body"><strong>${t}</strong> ${b}</div>
        </div>`).join('')}
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════
   Delta
═══════════════════════════════════════════════════════ */

function delta() {
  const rows = [
    ['01','Token scale', '<code>web/src/index.css</code> · <code>web/tailwind.config.ts</code>',
      'Keep both files as-is; they already define the surfaces + semantic names correctly. <strong>No code change.</strong> This row is documented in the synthesis as the canonical reference.', 'xs', 'XS'],
    ['02','IconRail edge indicator', '<code>web/src/shell/IconRail.tsx</code>',
      'Add a <code>::before</code> 2px primary-color bar on <code>.btn-active</code>. Small Tailwind arbitrary-value rule or a new <code>data-active</code> style.', 's', 'S'],
    ['03','IconRail unread dot', '<code>web/src/shell/IconRail.tsx</code> · <code>useViewBadges</code> (new)',
      'New hook returning per-view unread counts. IconRail renders a 6px <code>bg-error</code> dot on buttons where <code>count > 0 && viewId !== activeView</code>.', 'm', 'M'],
    ['04','Rail collapsed pills', '<code>web/src/shell/Rail.tsx</code>',
      'Replace the two-neutral-badge collapsed view with three semantic pills. Pass <code>blockers.length</code> (error), <code>reviewCount</code> (primary), <code>pausedCount</code> (warning). Widen from <code>w-14</code> to match.', 's', 'S'],
    ['05','Submenu title + count', '<code>web/src/shell/Submenu.tsx</code>',
      'Mono eyebrow title + count badge. Replace the current <code>&lt;span&gt;</code> with the <span class="vs-badge A">A</span> treatment. Typography tokens only — no new primitives.', 'xs', 'XS'],
    ['06','Submenu filter row', '<code>web/src/shell/Submenu.tsx</code> · <code>SubmenuFilters</code> (new)',
      'New optional <code>filters?: FilterOption[]</code> prop. Render inline segmented buttons between title and children. Only Conversations &amp; Knowledge pass filters.', 'm', 'M'],
    ['07','Responsive breakpoints', '<code>web/src/hooks/useViewportBreakpoint.ts</code>',
      'Keep as-is. The <code>1024 / 1280</code> thresholds and per-axis override model are correct. <strong>No code change.</strong>', 'xs', 'XS'],
    ['08','Settings · drawer', '<code>web/src/components/SettingsPanel.tsx</code>',
      'Rewrite from modal to right-aligned drawer. Slides in 420px from the right, dims (not hides) the Rail, closes on Esc. Reuse the section navigation with keybind chips.', 'l', 'L'],
    ['09','Settings · density wiring', '<code>web/src/layouts/AppShell.tsx</code> · <code>index.css</code>',
      'Apply <code>document.documentElement.setAttribute("data-density", settings.appearance.density)</code>. Add <code>:root[data-density="compact"] { --row-pad: 6px 10px; }</code> (and equivalents). Row-level components read <code>--row-pad</code>.', 'm', 'M'],
    ['10','Command-K overlay', '<code>web/src/components/GlobalSearchPanel.tsx</code>',
      'Replace the daisyUI <code>modal</code> shell with the designed 640px centered overlay. Group results by <code>type</code>. Arrow-key nav + Enter already routes correctly; add footer hint row.', 'm', 'M'],
    ['11','Kind badge primitive', '<code>web/src/components/KindBadge.tsx</code> (new)',
      'Sibling to <code>Tag</code> and <code>StatusChip</code>. Variants: <code>blocking</code> (error), <code>review</code> (primary), <code>chat</code> (accent), <code>pinned</code> (primary). Used in Submenu thread rows + ReviewHeader.', 's', 'S'],
    ['12','KeyValue · meter variant', '<code>web/src/components/KeyValue.tsx</code>',
      'Add <code>layout="meter"</code>. Renders value above a 4px <code>bg-base-300</code> track with a <code>bg-primary</code> fill sized via an optional <code>progress</code> prop. Used in Rail cost section.', 's', 'S'],
    ['13','Empty-state copy', '<code>web/src/shell/Submenu.tsx</code> · <code>web/src/shell/Rail.tsx</code>',
      'Don\'t render empty sections. If all sections empty, render an <code>EmptyPanel</code> with <span class="vs-badge A">A</span>\'s copy. Similar for Rail: "No blockers · all agents healthy."', 's', 'S'],
    ['14','Drop A\'s accent swap', '<code>HyperIdle.html</code> (synthesis note)',
      'The ice/sage/ember Tweak is documented as <em>rejected</em>. Single theme, single accent. Remove from any future ports.', 'xs', 'XS'],
  ];

  return `
    <div class="eyebrow">Implementation Delta · Rev 01</div>
    <h1>What changes in <code>packages/web/src</code>.</h1>
    <p class="lede">Fourteen rows. Each names the files to touch and the effort level. Rows map 1:1 to the deliverables above and the critique before. Green = a few lines; red = a proper feature.</p>

    <div class="delta-table">
      <div class="delta-cell head">#</div>
      <div class="delta-cell head">Change</div>
      <div class="delta-cell head">Files</div>
      <div class="delta-cell head">Notes</div>
      <div class="delta-cell head">Effort</div>

      ${rows.map(([n, change, files, note, effort, effortLabel]) => `
        <div class="delta-cell idx">${n}</div>
        <div class="delta-cell"><strong>${change}</strong></div>
        <div class="delta-cell">${files}</div>
        <div class="delta-cell">${note}</div>
        <div class="delta-cell"><span class="effort ${effort}">${effortLabel}</span></div>
      `).join('')}
    </div>

    <h2>Total · effort rollup</h2>
    <p>
      <strong>XS (4):</strong> token docs, typography tweaks, config retention, doc-only notes — half a day.
      <strong>S (5):</strong> IconRail polish, Rail collapsed, KindBadge, KeyValue variant, empty states — two days.
      <strong>M (4):</strong> unread hook, submenu filters, density wiring, ⌘K redesign — three to four days.
      <strong>L (1):</strong> Settings drawer rewrite — two to three days.
    </p>
    <p>
      <strong>Sequence.</strong> Land M09 (density wiring) first to prove the <code>data-density</code> mechanism, then the S-tier polish in parallel, then the Settings drawer last. The M-tier <code>useViewBadges</code> + Submenu filters depend on no other row and can be done at any time.
    </p>
  `;
}

/* ───────── populate ───────── */
set('d1-slot', d1());
set('d2-slot', d2());
set('d3-slot', d3());
set('d4-slot', d4());
set('crit-slot', crit());
set('delta-slot', delta());
