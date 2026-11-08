export const ossRepoStyles = `
  :root { --bg: var(--caipe-background, hsl(230 25% 5%)); --surface: var(--caipe-card, hsl(230 25% 7%)); --accent: var(--caipe-primary, hsl(173 80% 40%)); --on-accent: var(--caipe-primary-foreground, hsl(230 25% 5%)); --line: var(--caipe-border, hsl(230 20% 18%)); --muted: var(--caipe-muted-foreground, hsl(215 20% 65%)); --track: color-mix(in srgb, var(--text) 8%, var(--surface)); }
  :root[data-caipe-theme=light] { --bg: var(--caipe-background, hsl(220 18% 94%)); --surface: var(--caipe-card, white); --accent: var(--caipe-primary, hsl(173 80% 35%)); --on-accent: var(--caipe-primary-foreground, white); --line: var(--caipe-border, hsl(220 16% 84%)); --muted: var(--caipe-muted-foreground, hsl(215 16% 42%)); }
  [hidden] { display: none !important; }
  main { max-width: 1480px; padding: 36px clamp(20px, 3vw, 48px) 48px; }
  .eyebrow { color: var(--muted); text-transform: uppercase; letter-spacing: .12em; font-size: .68rem; font-weight: 650; margin: 0 0 8px; }
  .page-header { align-items: flex-start; gap: 24px; margin-bottom: 28px; }
  .page-header h1 { font-size: clamp(1.7rem, 3vw, 2.25rem); letter-spacing: -.045em; }
  .page-header .subtitle { font-size: .9rem; max-width: 550px; }
  .page-header .actions { gap: 8px; padding-top: 6px; }
  .page-header button { font-size: .78rem; min-height: 36px; }
  .assistant-launch { border-color: color-mix(in srgb, var(--accent) 55%, var(--line)); color: var(--accent); display: inline-flex; align-items: center; gap: 10px; }
  .scope-panel { padding: 20px 24px; border-radius: 14px; box-shadow: 0 6px 22px #00000008; }
  .scope-panel input { background: var(--bg); min-height: 44px; font-size: .92rem; }
  .scope-panel .primary { min-height: 44px; border-radius: 9px; padding-inline: 20px; }
  .example-link { border-color: transparent; background: none; gap: 8px; font-size: .82rem; color: var(--muted); }
  .scope-panel .data-status { font-size: .72rem; }
  .scope-panel .status-chip { font-size: .7rem; padding: 3px 7px; }
  .scope-panel .view-settings { border-top: 1px solid var(--line); padding-top: 12px; font-size: .75rem; color: var(--muted); }
  .report-nav { display: flex; flex-wrap: wrap; gap: 6px; border-bottom: 1px solid var(--line); margin: 28px 0 0; padding-bottom: 10px; }
  .report-nav [role="tab"] { color: var(--muted); border: 0; background: transparent; box-shadow: none; min-height: 36px; font-size: .8rem; padding: 7px 12px; border-radius: 7px; }
  .report-nav [aria-selected="true"] { color: var(--accent); background: color-mix(in srgb, var(--accent) 9%, transparent); }
  .report-nav [role="tab"]:hover { color: var(--text); background: var(--track); }
  .report-nav [role="tab"]:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .summary-section { margin-top: 24px; }
  .kpi-strip { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
  .kpi { border-radius: 12px; padding: 18px 20px; position: relative; }
  .kpi-label { font-size: .72rem; }
  .kpi-value { font-size: clamp(1.6rem, 2.5vw, 2rem); margin: 10px 0 6px; letter-spacing: -.035em; }
  .kpi-sub { font-size: .7rem; line-height: 1.5; }
  .insights-strip { gap: 8px; }
  .insight { padding: 10px 12px; background: transparent; border-style: dashed; font-size: .76rem; }
  .repo-profile { display: grid; gap: 14px; margin: 0 0 22px; }
  .repo-identity { display: flex; align-items: flex-start; gap: 14px; }
  .repo-identity > div { min-width: 0; }
  .repo-identity h2 { font-size: 1.18rem; letter-spacing: -.025em; }
  .repo-identity p:not(.eyebrow) { color: var(--muted); font-size: .82rem; margin-top: 7px; max-width: 900px; }
  .repo-avatar { display: grid; place-items: center; width: 44px; height: 44px; flex-shrink: 0; border-radius: 11px; background: color-mix(in srgb, var(--accent) 12%, var(--surface)); border: 1px solid color-mix(in srgb, var(--accent) 25%, var(--line)); color: var(--accent); font-size: 1.1rem; font-weight: 650; }
  .repo-meta { display: flex; flex-wrap: wrap; gap: 8px; padding-left: 58px; }
  .repo-meta span { border: 1px solid var(--line); border-radius: 5px; padding: 2px 7px; color: var(--muted); font-size: .7rem; }
  .report-welcome { grid-column: 1 / -1; text-align: center; border: 1px solid var(--line); border-radius: 16px; padding: clamp(32px, 5vw, 64px) 24px; background: var(--surface); }
  .welcome-mark { display: inline-grid; place-items: center; width: 58px; height: 58px; border: 1px solid color-mix(in srgb, var(--accent) 30%, var(--line)); border-radius: 16px; background: color-mix(in srgb, var(--accent) 8%, var(--surface)); color: var(--accent); font-size: 1.2rem; font-family: ui-monospace, monospace; margin-bottom: 22px; }
  .report-welcome h2 { font-size: clamp(1.2rem, 2.5vw, 1.65rem); letter-spacing: -.035em; margin: 8px 0 12px; }
  .report-welcome > p:not(.eyebrow) { color: var(--muted); font-size: .88rem; max-width: 520px; margin: auto; }
  .welcome-topics { display: flex; justify-content: center; flex-wrap: wrap; gap: 8px; margin: 24px 0 28px; }
  .welcome-topics span { border: 1px solid var(--line); border-radius: 6px; padding: 6px 10px; color: var(--muted); font-size: .72rem; }
  .welcome-hint { color: var(--muted); font-size: .73rem; }
  .section-heading { align-items: flex-end; gap: 12px; margin-bottom: 20px; }
  .section-heading h2 { font-size: 1.05rem; letter-spacing: -.015em; }
  .section-note { color: var(--muted); font-size: .7rem; max-width: 300px; }
  .priorities-panel { border-top: 2px solid color-mix(in srgb, var(--accent) 45%, var(--line)); }
  .monthly-card { margin-bottom: 18px; padding: 22px; }
  .monthly-chart { display: flex; align-items: end; gap: clamp(6px, 1.4vw, 22px); overflow-x: auto; padding: 12px 0 0; min-height: 180px; }
  .month-column { flex: 1; min-width: 32px; display: flex; align-items: center; flex-direction: column; justify-content: flex-end; }
  .month-value { color: var(--muted); font-size: .62rem; font-variant-numeric: tabular-nums; margin-bottom: 5px; }
  .month-bar { width: 100%; max-width: 40px; background: var(--accent); border-radius: 4px 4px 0 0; min-height: 3px; }
  .month-bar.partial { opacity: .55; border: 1px dashed var(--accent); }
  .month-bar.unavailable { background: var(--line); }
  .month-label { color: var(--muted); font-size: .6rem; white-space: nowrap; margin-top: 8px; }
  .snapshot-panel { border: 1px solid var(--line); border-radius: 8px; padding: 14px 18px; margin: 0 0 18px; font-size: .82rem; }
  .snapshot-table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  .snapshot-table th, .snapshot-table td { padding: 9px 0; border-bottom: 1px solid var(--line); text-align: left; font-size: .78rem; }
  .snapshot-table th { color: var(--muted); font-weight: 400; }
  .snapshot-table td { text-align: right; font-variant-numeric: tabular-nums; }
  .snapshot-caveats { color: var(--muted); font-size: .72rem; padding-left: 18px; margin-bottom: 0; }
  .repo-profile .repo-health-card strong { font-size: .95rem; }
  .repo-link { text-decoration: none; overflow-wrap: anywhere; }
  .repo-link:hover { text-decoration: underline; }
  .report-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
  .chart-card { min-height: 240px; padding: 18px; }
  .chart-head { display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-bottom: 14px; }
  .chart-head strong { margin: 0; font-size: 1rem; font-weight: 600; }
  .chart-head span { color: var(--muted); font-size: .82rem; }
  .bar-chart { height: 135px; display: flex; align-items: end; gap: 7px; padding-top: 8px; border-bottom: 1px solid var(--line); }
  .bar { flex: 1; min-width: 4px; border-radius: 4px 4px 0 0; background: var(--accent); position: relative; }
  .bar:hover::after { content: attr(data-label); position: absolute; left: 50%; bottom: calc(100% + 5px); transform: translateX(-50%); z-index: 1; white-space: nowrap; background: var(--surface); color: var(--text); border: 1px solid var(--line); border-radius: 4px; padding: 4px 6px; font-size: .75rem; }
  .axis-labels { display: flex; justify-content: space-between; margin-top: 8px; font-size: .75rem; color: var(--muted); }
  .coverage { margin-top: 12px; }
  .sparkline { width: 100%; height: 135px; overflow: visible; }
  .sparkline .line { fill: none; stroke: var(--accent); stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
  .progress-bar { height: 6px; background: var(--track); border-radius: 4px; overflow: hidden; margin-top: 10px; }
  .progress-fill { height: 100%; background: var(--accent); }
  .practice-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
  .practice strong { display: block; margin-top: 6px; font-size: .95rem; }
  .practice.good strong { color: var(--success); }
  .practice.warn strong { color: var(--warning); }
  .criteria-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
  .readiness-head { display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin: 24px 0 8px; }
  .readiness-head span { color: var(--muted); font-size: .82rem; }
  .criterion .criterion-status { float: right; margin-left: 8px; color: var(--muted); font-size: .75rem; }
  .criterion.pass .criterion-status { color: var(--success); }
  .criterion.warn .criterion-status { color: var(--warning); }
  .framework-links { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 16px; font-size: .85rem; }
  .action-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
  .maintainer-ask { border-left: 3px solid var(--accent); }
  .assistant .actions { margin-top: 12px; }
  @media (max-width: 1100px) { .practice-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  @media (max-width: 1050px) { .kpi-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); } .page-header { flex-direction: column; gap: 12px; } }
  @media (max-width: 900px) {
    .practice-grid, .criteria-grid, .action-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .report-grid { grid-template-columns: 1fr; }
  }
  @media (max-width: 600px) { main { padding: 24px 16px 36px; } .practice-grid, .criteria-grid, .action-grid { grid-template-columns: 1fr; } .scope-panel { padding: 16px; } .controls { gap: 10px; } .scope-panel .grow { flex-basis: 100%; } .kpi { padding: 14px; } .repo-meta { padding-left: 0; } .report-nav { gap: 0; } .report-nav [role="tab"] { padding: 7px 8px; font-size: .72rem; } }
`;
