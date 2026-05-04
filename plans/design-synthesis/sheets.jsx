// sheets.jsx — Component sheet, Type scale, Color swatches

const DemoCell = ({ label, children }) => (
  <div className="demo-cell">
    <div className="demo-label">{label}</div>
    <div className="demo-item">{children}</div>
  </div>
);

const ComponentSection = ({ n, kind, name, desc, children }) => (
  <div className="component-demo">
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 2 }}>
      <span className="mono-sm" style={{ color: 'var(--t-low)' }}>{kind} · 0{n}</span>
      <span className="demo-title" style={{ margin: 0 }}>{name}</span>
    </div>
    <div className="demo-desc">{desc}</div>
    <div className="demo-grid">{children}</div>
  </div>
);

// ──────────────── Components sheet ────────────────

const ComponentsSheet = () => (
  <div className="sheet">
    <div style={{ marginBottom: 32 }}>
      <div className="sheet-section-title">Deliverable 02</div>
      <div className="sheet-section-name">Component sheet — every primitive &amp; block in all states</div>
    </div>

    <div className="sheet-section">
      <div className="sheet-section-title" style={{ marginBottom: 16 }}>Primitives · 5</div>

      <ComponentSection n={1} kind="Primitive" name="StatusChip" desc="Small badge with 6px colored dot + uppercase mono text. Six states. Used anywhere status appears — cards, notifications, rows.">
        <DemoCell label="Healthy"><StatusChip status="healthy" /></DemoCell>
        <DemoCell label="Behind"><StatusChip status="behind" /></DemoCell>
        <DemoCell label="Blocked"><StatusChip status="blocked" /></DemoCell>
        <DemoCell label="Paused"><StatusChip status="paused" /></DemoCell>
        <DemoCell label="Done"><StatusChip status="done" /></DemoCell>
        <DemoCell label="Error"><StatusChip status="error" /></DemoCell>
      </ComponentSection>

      <ComponentSection n={2} kind="Primitive" name="Tag" desc="Flat neutral badge for identity — product, object kind, knowledge category. No border, subtle fill.">
        <DemoCell label="Kind — default"><Tag variant="kind">bet</Tag></DemoCell>
        <DemoCell label="Kind — hover"><Tag variant="kind" style={{ background: 'var(--s5)' }}>pitch</Tag></DemoCell>
        <DemoCell label="Product"><Tag variant="product">Orbit</Tag></DemoCell>
        <DemoCell label="Product"><Tag variant="product">Tessera</Tag></DemoCell>
        <DemoCell label="Product"><Tag variant="product">Loom</Tag></DemoCell>
        <DemoCell label="Category"><Tag variant="kind">Principles</Tag></DemoCell>
      </ComponentSection>

      <ComponentSection n={3} kind="Primitive" name="KeyValue" desc="Uppercase mono label on top, body value below. The only way structured metadata is displayed.">
        <DemoCell label="Stacked"><KeyValue label="Appetite" value="6 weeks" /></DemoCell>
        <DemoCell label="Stacked — long"><KeyValue label="Routed to" value="MA (Growth)" /></DemoCell>
        <DemoCell label="Inline"><KeyValue label="Owner" value="Agent AR" inline /></DemoCell>
        <DemoCell label="Numeric"><KeyValue label="Confidence" value="97%" /></DemoCell>
      </ComponentSection>

      <ComponentSection n={4} kind="Primitive" name="NavItem" desc="Icon + text + optional count badge. Selected = surface-4 fill + 2px primary left bar. Used in IconRail, Submenu, Settings.">
        <DemoCell label="Default">
          <div style={{ width: 200, background: 'var(--s2)', borderRadius: 2, padding: 4 }}>
            <NavItem icon="conversations" label="Conversations" />
          </div>
        </DemoCell>
        <DemoCell label="Hover">
          <div style={{ width: 200, background: 'var(--s2)', borderRadius: 2, padding: 4 }}>
            <div className="navitem" style={{ background: 'var(--s3)', color: 'var(--t-high)' }}>
              <Icon name="work" /><span className="navitem-label">Work</span>
            </div>
          </div>
        </DemoCell>
        <DemoCell label="Selected">
          <div style={{ width: 200, background: 'var(--s2)', borderRadius: 2, padding: 4 }}>
            <NavItem icon="knowledge" label="Knowledge" selected />
          </div>
        </DemoCell>
        <DemoCell label="With count">
          <div style={{ width: 200, background: 'var(--s2)', borderRadius: 2, padding: 4 }}>
            <NavItem icon="layers" label="Bets canvas" count="12" />
          </div>
        </DemoCell>
        <DemoCell label="Selected + count">
          <div style={{ width: 200, background: 'var(--s2)', borderRadius: 2, padding: 4 }}>
            <NavItem icon="panel" label="Task kanban" count="24" selected />
          </div>
        </DemoCell>
        <DemoCell label="Disabled">
          <div style={{ width: 200, background: 'var(--s2)', borderRadius: 2, padding: 4 }}>
            <NavItem icon="settings" label="Admin tools" disabled />
          </div>
        </DemoCell>
      </ComponentSection>

      <ComponentSection n={5} kind="Primitive" name="SearchField" desc="Compact input — leading search icon, trailing ⌘K hint. Always the same size &amp; style. Focused state adds a 1px primary inner ring.">
        <DemoCell label="Default">
          <div style={{ width: 220 }}><SearchField placeholder="Search threads" /></div>
        </DemoCell>
        <DemoCell label="Focused">
          <div style={{ width: 220 }}>
            <div className="search" style={{ background: 'var(--s4)', boxShadow: 'inset 0 0 0 1px var(--primary-hover)' }}>
              <span className="search-icon"><Icon name="search" size={14} /></span>
              <input defaultValue="pricing" />
              <span className="kbd">ESC</span>
            </div>
          </div>
        </DemoCell>
        <DemoCell label="Filled">
          <div style={{ width: 220 }}>
            <SearchField value="Orbit billing" shortcut="⌘K" />
          </div>
        </DemoCell>
      </ComponentSection>
    </div>

    <div className="sheet-section">
      <div className="sheet-section-title" style={{ marginBottom: 16 }}>Blocks · 6</div>

      <ComponentSection n={1} kind="Block" name="ThreadRow" desc="Avatar + title + caption + StatusChip + relative timestamp. The list item in conversation thread lists.">
        <DemoCell label="Default">
          <div style={{ width: 280, background: 'var(--s2)', borderRadius: 2, padding: 4 }}>
            <ThreadRow initials="AR" bot title="Pricing experiment results" caption="Variant B lifted conversion 12.4%." status="healthy" time="4m" product="Orbit" />
          </div>
        </DemoCell>
        <DemoCell label="Selected">
          <div style={{ width: 280, background: 'var(--s2)', borderRadius: 2, padding: 4 }}>
            <ThreadRow initials="KM" bot title="Webhook retry logic" caption="Blocked on infra decision." status="blocked" time="1h" product="Orbit" selected />
          </div>
        </DemoCell>
        <DemoCell label="Human author">
          <div style={{ width: 280, background: 'var(--s2)', borderRadius: 2, padding: 4 }}>
            <ThreadRow initials="MA" title="Re: Q2 bet allocation" caption="I think we should double down on Loom." status="paused" time="5h" />
          </div>
        </DemoCell>
        <DemoCell label="Done">
          <div style={{ width: 280, background: 'var(--s2)', borderRadius: 2, padding: 4 }}>
            <ThreadRow initials="KM" bot title="Deploy rollback — us-east" caption="Reverted to v2.14.1." status="done" time="1d" product="Orbit" />
          </div>
        </DemoCell>
      </ComponentSection>

      <ComponentSection n={2} kind="Block" name="BetCard" desc="Product tag + title + StatusChip + thin progress track + owner avatar. The card on the bet canvas.">
        <DemoCell label="Healthy"><div style={{ width: 280 }}><BetCard product="Orbit" title="Self-serve team billing" status="healthy" progress={72} owner="MA" progressTone="primary" /></div></DemoCell>
        <DemoCell label="Behind"><div style={{ width: 280 }}><BetCard product="Orbit" title="AI-assisted workflow builder" status="behind" progress={38} owner="SV" progressTone="warn" /></div></DemoCell>
        <DemoCell label="Blocked"><div style={{ width: 280 }}><BetCard product="Tessera" title="Granular permissions" status="blocked" progress={22} owner="KM" progressTone="danger" /></div></DemoCell>
        <DemoCell label="Hover"><div style={{ width: 280 }}><div className="betcard" style={{ background: 'var(--s5)' }}>
          <div className="betcard-top"><Tag variant="product">Loom</Tag><StatusChip status="healthy" /></div>
          <div className="betcard-title">Usage-based pricing</div>
          <div className="progress"><div className="progress-bar ok" style={{ width: '88%' }}/></div>
          <div className="betcard-meta"><span className="mono-sm">88% · 6W cycle</span><Avatar initials="MA" size="sm" /></div>
        </div></div></DemoCell>
      </ComponentSection>

      <ComponentSection n={3} kind="Block" name="PitchCard" desc="Kind tag + title + appetite KeyValue + StatusChip. The card in the pitch selector.">
        <DemoCell label="Default"><div style={{ width: 280 }}><PitchCard kind="Pitch" title="Founder-routed approvals" appetite="2 weeks" status="healthy" /></div></DemoCell>
        <DemoCell label="Unscoped"><div style={{ width: 280 }}><PitchCard kind="Pitch" title="Cross-product knowledge graph" appetite="Unscoped" status="paused" /></div></DemoCell>
        <DemoCell label="Behind"><div style={{ width: 280 }}><PitchCard kind="Bet" title="Rip out legacy export pipeline" appetite="6 weeks" status="behind" /></div></DemoCell>
      </ComponentSection>

      <ComponentSection n={4} kind="Block" name="TaskCard" desc="Title + StatusChip + optional bet Tag + owner avatar. The card in kanban columns.">
        <DemoCell label="Default"><div style={{ width: 240 }}><TaskCard title="Spec the router taxonomy" status="healthy" bet="Orbit" owner="MA" /></div></DemoCell>
        <DemoCell label="Blocked"><div style={{ width: 240 }}><TaskCard title="Webhook retry queue" status="blocked" bet="Orbit" owner="KM" /></div></DemoCell>
        <DemoCell label="No bet"><div style={{ width: 240 }}><TaskCard title="Q2 allocation memo" status="behind" owner="MA" /></div></DemoCell>
        <DemoCell label="Done"><div style={{ width: 240 }}><TaskCard title="Post-mortem — us-east" status="done" bet="Orbit" owner="KM" /></div></DemoCell>
      </ComponentSection>

      <ComponentSection n={5} kind="Block" name="KnowledgeRow" desc="Title + category tag + caption + timestamp. The list item in knowledge lists.">
        <DemoCell label="Default"><div style={{ width: 420, background: 'var(--s2)', borderRadius: 4, padding: 4 }}><KnowledgeRow title="How we make bets" category="Principles" caption="Six-week cycles, founder-owned, one bet per cycle per product." time="Mar 14" /></div></DemoCell>
        <DemoCell label="Selected"><div style={{ width: 420, background: 'var(--s2)', borderRadius: 4, padding: 4 }}><KnowledgeRow title="Agent review protocol" category="Process" caption="Every agent proposal routes to the domain founder." time="Mar 09" selected /></div></DemoCell>
      </ComponentSection>

      <ComponentSection n={6} kind="Block" name="NotificationRow" desc="StatusChip + summary + source Tag + timestamp + optional ghost action. The only shape notifications ever take.">
        <DemoCell label="Default"><div style={{ width: 320, background: 'var(--s1)', borderRadius: 4, padding: 4 }}><NotificationRow status="healthy" summary="Pricing experiment B ready for rollout. 12.4% lift." source="Orbit" time="4m" action={{ label: 'Approve', primary: true }} /></div></DemoCell>
        <DemoCell label="Blocked"><div style={{ width: 320, background: 'var(--s1)', borderRadius: 4, padding: 4 }}><NotificationRow status="blocked" summary="Stripe webhook handler needs founder pick: queue or in-process." source="Orbit" time="12m" action={{ label: 'Resolve', primary: true }} /></div></DemoCell>
        <DemoCell label="Behind"><div style={{ width: 320, background: 'var(--s1)', borderRadius: 4, padding: 4 }}><NotificationRow status="behind" summary="Onboarding copy v3 past founder-review SLA (22m over)." source="Tessera" time="22m" action={{ label: 'Review' }} /></div></DemoCell>
        <DemoCell label="No action"><div style={{ width: 320, background: 'var(--s1)', borderRadius: 4, padding: 4 }}><NotificationRow status="healthy" summary="Weekly digest compiled: Portfolio +7.1% net MRR." source="Portfolio" time="3h" /></div></DemoCell>
      </ComponentSection>
    </div>
  </div>
);

// ──────────────── Rail states sheet ────────────────

const RailStatesSheet = () => (
  <div className="sheet">
    <div style={{ marginBottom: 32 }}>
      <div className="sheet-section-title">Deliverable 03</div>
      <div className="sheet-section-name">Rail — collapsed (56px) and expanded (360px)</div>
      <div style={{ fontSize: 13, color: 'var(--t-mid)', maxWidth: 560, marginTop: 8 }}>
        The Rail is the ONLY notification surface in HyperIdle. No bell icons, no toasts, no inline badges anywhere else. Always present on the right edge.
      </div>
    </div>

    <div style={{ display: 'flex', gap: 64, alignItems: 'flex-start' }}>
      <div>
        <div className="mono-sm" style={{ marginBottom: 12 }}>COLLAPSED · 56px</div>
        <div style={{ height: 560, display: 'flex', background: 'var(--s3)' }}>
          <div style={{ flex: 1, background: 'var(--s3)', padding: 16, fontSize: 12, color: 'var(--t-low)', width: 240 }}>Main content area</div>
          <div style={{ width: 56 }}>
            <aside className="rail collapsed" style={{ height: 560, width: 56 }}>
              <div className="rail-collapsed-inner">
                <button className="rail-icon-btn" title="Blocked">
                  <Icon name="block" />
                  <span className="count-badge">3</span>
                </button>
                <button className="rail-icon-btn" title="Cost">
                  <Icon name="cost" />
                  <span className="count-badge warn">2</span>
                </button>
                <button className="rail-icon-btn" title="Unread">
                  <Icon name="unread" />
                  <span className="count-badge primary">4</span>
                </button>
              </div>
            </aside>
          </div>
        </div>
      </div>

      <div>
        <div className="mono-sm" style={{ marginBottom: 12 }}>EXPANDED · 360px</div>
        <div style={{ height: 560, display: 'flex', background: 'var(--s3)' }}>
          <div style={{ width: 360 }}>
            <aside className="rail expanded" style={{ height: 560, width: 360 }}>
              <div className="rail-expanded-inner">
                <div className="rail-expanded-header">
                  <span className="rail-expanded-title">Rail</span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="btn-ghost"><Icon name="check" size={14} /></button>
                    <button className="btn-ghost"><Icon name="close" size={14} /></button>
                  </div>
                </div>
                <div className="rail-search-wrap">
                  <SearchField placeholder="Filter notifications" shortcut="⌘J" />
                </div>
                <div className="rail-groups">
                  <div className="rail-group-label">
                    <span className="mono"><span style={{ color: 'var(--danger)' }}>●</span>&nbsp;&nbsp;BLOCKED · 3</span>
                    <span className="mono-sm">SLA</span>
                  </div>
                  {NOTIFICATIONS.blocked.map(n => <NotificationRow key={n.id} {...n} />)}
                  <div className="rail-group-label">
                    <span className="mono"><span style={{ color: 'var(--warn)' }}>●</span>&nbsp;&nbsp;COST · 2</span>
                    <span className="mono-sm">CYCLE</span>
                  </div>
                  {NOTIFICATIONS.cost.map(n => <NotificationRow key={n.id} {...n} />)}
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>

    <div style={{ marginTop: 40, padding: 20, background: 'var(--s2)', borderRadius: 4, maxWidth: 900 }}>
      <div className="mono-sm" style={{ marginBottom: 8 }}>BADGE HIERARCHY</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 32 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ width: 16, height: 16, borderRadius: 999, background: 'var(--danger)' }} />
            <span style={{ fontSize: 13, fontWeight: 600 }}>Blocked · danger red</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--t-mid)' }}>Agent cannot proceed without a founder decision. SLA clock is running.</div>
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ width: 16, height: 16, borderRadius: 999, background: 'var(--warn)' }} />
            <span style={{ fontSize: 13, fontWeight: 600 }}>Cost · amber</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--t-mid)' }}>Budget anomaly or overage. Informational; no SLA.</div>
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ width: 16, height: 16, borderRadius: 999, background: 'var(--primary)' }} />
            <span style={{ fontSize: 13, fontWeight: 600 }}>Unread · primary blue</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--t-mid)' }}>New activity in a thread you own or are watching.</div>
        </div>
      </div>
    </div>
  </div>
);

// ──────────────── Type scale ────────────────

const TypeSheet = () => (
  <div className="sheet">
    <div style={{ marginBottom: 32 }}>
      <div className="sheet-section-title">Deliverable 04</div>
      <div className="sheet-section-name">Typography — Inter + Space Grotesk</div>
    </div>

    <div className="component-demo">
      <div className="demo-title" style={{ marginBottom: 24 }}>Inter — UI text</div>
      <div className="type-row">
        <div className="type-spec">
          <span><strong>Inter</strong> 24 / 600</span>
          <span>line-height 1.2</span>
        </div>
        <div style={{ fontSize: 24, fontWeight: 600, lineHeight: 1.2, letterSpacing: '-0.01em' }}>Pricing experiment results — variant B</div>
      </div>
      <div className="type-row">
        <div className="type-spec">
          <span><strong>Inter</strong> 18 / 600</span>
          <span>section / view title</span>
        </div>
        <div style={{ fontSize: 18, fontWeight: 600 }}>Bets — 6W cycle, week 4 of 6</div>
      </div>
      <div className="type-row">
        <div className="type-spec">
          <span><strong>Inter</strong> 14 / 500</span>
          <span>body / card titles</span>
        </div>
        <div style={{ fontSize: 14, fontWeight: 500 }}>Self-serve team billing</div>
      </div>
      <div className="type-row">
        <div className="type-spec">
          <span><strong>Inter</strong> 14 / 400</span>
          <span>body prose</span>
        </div>
        <div style={{ fontSize: 14, fontWeight: 400, color: 'var(--t-mid)' }}>Ran the pricing experiment for 14 days across the US-EN segment. Variant B outperformed control across every cohort.</div>
      </div>
      <div className="type-row">
        <div className="type-spec">
          <span><strong>Inter</strong> 12 / 500</span>
          <span>caption / nav / tag</span>
        </div>
        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--t-mid)' }}>Variant B lifted conversion 12.4%. Recommending rollout.</div>
      </div>
    </div>

    <div className="component-demo">
      <div className="demo-title" style={{ marginBottom: 24 }}>Space Grotesk — data / mono</div>
      <div className="type-row">
        <div className="type-spec">
          <span><strong>Space Grotesk</strong> 13 / 400</span>
          <span>inline numeric</span>
        </div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 400 }}>$29/mo · +12.4% · 97% confidence · 6W cycle</div>
      </div>
      <div className="type-row">
        <div className="type-spec">
          <span><strong>Space Grotesk</strong> 13 / 500</span>
          <span>KeyValue value</span>
        </div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 500 }}>MA · Growth · 4h remaining</div>
      </div>
      <div className="type-row">
        <div className="type-spec">
          <span><strong>Space Grotesk</strong> 11 / 500</span>
          <span>uppercase · 0.05em · KeyValue label, chip, nav</span>
        </div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 500, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--t-low)' }}>ROUTED TO · APPROVAL NEEDED · SLA 4H</div>
      </div>
    </div>
  </div>
);

// ──────────────── Color swatches ────────────────

const Swatch = ({ bg, name, hex, use, light }) => (
  <div className="swatch">
    <div className="swatch-chip" style={{ background: bg, boxShadow: light ? 'inset 0 0 0 1px var(--s4)' : 'none' }} />
    <div className="swatch-meta">
      <span className="swatch-name">{name}</span>
      <span className="swatch-hex">{hex}</span>
      <span className="swatch-use">{use}</span>
    </div>
  </div>
);

const ColorSheet = () => (
  <div className="sheet">
    <div style={{ marginBottom: 32 }}>
      <div className="sheet-section-title">Deliverable 05</div>
      <div className="sheet-section-name">Color — "Silent Intelligence"</div>
      <div style={{ fontSize: 13, color: 'var(--t-mid)', maxWidth: 600, marginTop: 8 }}>
        Surfaces are a tonal ramp: we layer these to establish hierarchy instead of drawing borders or shadows. Accents exist only for state; text is a three-step grayscale.
      </div>
    </div>

    <div className="component-demo">
      <div className="demo-title">Surfaces — tonal layering (no borders)</div>
      <div className="demo-desc">Adjacent zones differ by exactly one surface tone. The app shell uses s0 for the IconRail strip gap, s1 for IconRail/Rail, s2 for Submenu, s3 for Main.</div>
      <div className="color-grid">
        <Swatch bg="#000000" name="Surface 0" hex="#000000" use="app chrome · rails" light />
        <Swatch bg="#0e0e0e" name="Surface 1" hex="#0E0E0E" use="IconRail · Rail" />
        <Swatch bg="#131313" name="Surface 2" hex="#131313" use="Submenu · sheets" />
        <Swatch bg="#191a1a" name="Surface 3" hex="#191A1A" use="Main area" />
        <Swatch bg="#1f2020" name="Surface 4" hex="#1F2020" use="Cards · selected nav" />
        <Swatch bg="#252626" name="Surface 5" hex="#252626" use="Card hover · buttons" />
        <Swatch bg="#2c2c2c" name="Surface 6" hex="#2C2C2C" use="Elevated · button hover" />
        <Swatch bg="rgba(255,255,255,0.06)" name="Ghost" hex="rgba(255,255,255,.06)" use="Chip fill · inline kbd" />
      </div>
    </div>

    <div className="component-demo">
      <div className="demo-title">Accents — state only</div>
      <div className="demo-desc">Never used decoratively. Each accent maps to one or two states, and nothing else.</div>
      <div className="color-grid">
        <Swatch bg="#adc6ff" name="Primary" hex="#ADC6FF" use="links · selection · active" />
        <Swatch bg="#d58f24" name="Warn" hex="#D58F24" use="behind · attention" />
        <Swatch bg="#bbffb3" name="OK" hex="#BBFFB3" use="healthy · approved · done" />
        <Swatch bg="#ee7d77" name="Danger" hex="#EE7D77" use="blocked · errors · rejected" />
      </div>
    </div>

    <div className="component-demo">
      <div className="demo-title">Text</div>
      <div className="demo-desc">Three steps. No light-gray subtitle extras — density means mid handles everything secondary.</div>
      <div className="color-grid">
        <Swatch bg="#e7e5e4" name="High" hex="#E7E5E4" use="titles · values · active nav" light />
        <Swatch bg="#acabaa" name="Mid" hex="#ACABAA" use="body · captions · inactive nav" light />
        <Swatch bg="#767575" name="Low" hex="#767575" use="mono labels · timestamps · hints" light />
      </div>
    </div>

    <div className="component-demo">
      <div className="demo-title">Shape &amp; motion</div>
      <div className="demo-desc">Radii are a closed set: <code style={{ fontFamily: 'var(--mono)', color: 'var(--primary)', background: 'var(--ghost)', padding: '1px 4px', borderRadius: 2 }}>0 / 2 / 4 / 8 / 999</code> px. No drop shadows except floating surfaces.</div>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        {[
          { r: 0, label: '0 · zones' },
          { r: 2, label: '2 · default' },
          { r: 4, label: '4 · cards' },
          { r: 8, label: '8 · modals' },
          { r: 999, label: '999 · pills' },
        ].map(s => (
          <div key={s.r} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ width: 72, height: 72, background: 'var(--s4)', borderRadius: s.r }} />
            <span className="mono-sm">{s.label}</span>
          </div>
        ))}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ width: 72, height: 72, background: 'var(--s4)', borderRadius: 4, boxShadow: '0 0 32px rgba(173,198,255,0.08)' }} />
          <span className="mono-sm">FLOAT SHADOW</span>
        </div>
      </div>
    </div>
  </div>
);

Object.assign(window, { ComponentsSheet, RailStatesSheet, TypeSheet, ColorSheet });
