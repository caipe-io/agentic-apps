/** Shared hosted-dashboard presentation, aligned with EC2 and FinOps tokens. */
export const dashboardStyles = `
  :root {
    color-scheme: dark;
    --bg: var(--caipe-background, #080e1a);
    --surface: var(--caipe-card, #101a2b);
    --text: var(--caipe-foreground, #e2e8f0);
    --muted: var(--caipe-muted-foreground, #a2b3cc);
    --line: var(--caipe-border, #293951);
    --accent: var(--caipe-primary, #67e8f9);
    --on-accent: var(--caipe-primary-foreground, #081a22);
    --track: #22314a;
    --warning: #fcd34d;
    --error: #fecaca;
    --success: #86efac;
    --app-font-family: Inter, ui-sans-serif, system-ui, sans-serif;
    --app-font-scale: 1;
    font: calc(15px * var(--app-font-scale))/1.5 var(--app-font-family);
    background: var(--bg);
    color: var(--text);
  }
  :root[data-caipe-theme=light] {
    color-scheme: light;
    --bg: var(--caipe-background, #f7f9fc);
    --surface: var(--caipe-card, #fff);
    --text: var(--caipe-foreground, #15233a);
    --muted: var(--caipe-muted-foreground, #50627b);
    --line: var(--caipe-border, #dce3ed);
    --accent: var(--caipe-primary, #087a83);
    --on-accent: var(--caipe-primary-foreground, #fff);
    --track: #e3eaf1;
    --warning: #925705;
    --error: #a82323;
    --success: #166534;
  }
  * { box-sizing: border-box; }
  html { overscroll-behavior-y: contain; }
  body { margin: 0; background: var(--bg); color: var(--text); }
  main { max-width: 1440px; margin: auto; padding: 28px 24px 40px; }
  h1, h2, h3, p { margin: 0; }
  h1 { font-size: 1.85rem; letter-spacing: -.03em; line-height: 1.2; font-weight: 650; }
  h2 { font-size: 1.1rem; font-weight: 600; }
  h3 { font-size: 1rem; font-weight: 600; }
  .subtitle, .muted, small, label, .label, .coverage { color: var(--muted); }
  .subtitle { margin-top: 6px; max-width: 760px; }
  .small, small, .coverage { font-size: .82rem; }
  .page-header, .section-heading, .actions, .controls { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
  .page-header, .section-heading { justify-content: space-between; }
  .page-header { margin-bottom: 22px; }
  .section-heading { margin-bottom: 14px; }
  .page-header > div:first-child { flex: 1; min-width: min(300px, 100%); }
  .controls { align-items: end; }
  .grow { flex: 1; }
  label { display: grid; gap: 5px; font-size: .82rem; }
  input, select, textarea, button, .button {
    font: inherit; border: 1px solid var(--line); border-radius: 8px;
    padding: 9px 12px; background: var(--surface); color: var(--text); max-width: 100%;
  }
  input, select, button, .button { min-height: 40px; }
  button, .button { cursor: pointer; font-size: .88rem; }
  .button { display: inline-flex; align-items: center; justify-content: center; text-decoration: none; }
  button:hover:not(:disabled), .button:hover { border-color: var(--accent); }
  button:disabled { opacity: .5; cursor: default; }
  .primary { background: var(--accent); border-color: var(--accent); color: var(--on-accent); font-weight: 600; }
  textarea { display: block; width: 100%; min-height: 90px; resize: vertical; }
  input::placeholder, textarea::placeholder { color: var(--muted); }
  :focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
  a { color: var(--accent); }
  .panel, .font-customizer { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 18px; margin: 18px 0; }
  .panel > h2, .summary-section > h2 { margin-bottom: 14px; }
  .scope-panel > .controls { margin: 0; }
  .scope-panel .grow { min-width: min(290px, 100%); }
  .scope-panel input { width: 100%; }
  .summary-section { margin: 24px 0 18px; }
  .kpi-strip { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
  .kpi { padding: 18px; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; min-width: 0; }
  .kpi-label { color: var(--muted); font-size: .82rem; font-weight: 500; }
  .kpi-value { margin: 6px 0; font-size: 1.8rem; font-weight: 650; line-height: 1.25; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
  .kpi-sub { color: var(--muted); font-size: .82rem; }
  .kpi-icon { margin-right: 7px; }
  .kpi.accent-warn .kpi-sub, .warning, .severity-medium { color: var(--warning); }
  .kpi.accent-danger .kpi-sub, .severity-high { color: var(--error); }
  .insights-strip { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 14px; }
  .insight { flex: 1 1 230px; display: flex; align-items: center; gap: 10px; padding: 12px 14px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); font-size: .85rem; }
  .insight-text small { display: block; margin-top: 3px; }
  .insight-icon { font-size: 1.1rem; }
  .label { font-size: .82rem; }
  .value { color: var(--text); margin-top: 6px; font-size: 1.25rem; font-weight: 600; }
  .repo-health-card, .action-card, .metric, .day, .insight-card, .alert-row, .practice, .criterion {
    border: 1px solid var(--line); border-radius: 8px; padding: 14px; min-width: 0; background: var(--surface); overflow-wrap: anywhere;
  }
  .repo-health-card p, .action-card p, .insight-card p, .criterion p { margin-top: 6px; color: var(--muted); font-size: .85rem; }
  .repo-health-card strong, .action-card strong { display: block; margin-top: 5px; }
  .message { margin-top: 12px; padding: 14px; border: 1px solid var(--line); border-radius: 8px; color: var(--text); font-size: .85rem; line-height: 1.6; overflow-wrap: anywhere; }
  .message:empty { display: none; }
  .empty-state { grid-column: 1 / -1; padding: 28px; border: 1px solid var(--line); border-radius: 8px; color: var(--muted); text-align: center; }
  .empty-state strong { display: block; color: var(--text); margin-bottom: 6px; }
  .empty-state p { font-size: .88rem; }
  .data-status { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 12px 0 0; color: var(--muted); font-size: .82rem; }
  .status-chip, .dashboard-status, .run-status { display: inline-flex; align-items: center; gap: 7px; border: 1px solid var(--line); border-radius: 6px; padding: 5px 9px; color: var(--muted); background: var(--surface); font-size: .82rem; }
  .status-chip.good, .run-status.done { color: var(--success); }
  .status-chip.warn { color: var(--warning); }
  .run-status.error { color: var(--error); }
  .status-dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; flex-shrink: 0; }
  .run-history { display: flex; flex-wrap: wrap; gap: 10px; align-items: end; margin-top: 12px; }
  .run-history select { flex: 1; min-width: min(260px, 100%); }
  .view-settings { margin-top: 12px; }
  .font-customizer { display: flex; flex-wrap: wrap; align-items: center; gap: 16px; }
  .view-settings .font-customizer { border: 0; margin: 12px 0 0; padding: 0; }
  .font-dock-title { font-size: .88rem; font-weight: 600; }
  summary { cursor: pointer; color: var(--text); font-size: .9rem; font-weight: 600; }
  details.panel[open] > summary { margin-bottom: 14px; }
  .advanced { margin: 14px 0; }
  .advanced summary { color: var(--muted); font-size: .82rem; }
  .advanced label { margin-top: 10px; }
  .assistant-fields { display: grid; gap: 12px; margin: 14px 0; }
  .assistant-fields select, .assistant-fields input { width: 100%; }
  .activity-footer { position: static; margin: 18px 0; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); }
  .activity-footer > details > summary { display: flex; gap: 12px; align-items: center; padding: 14px 18px; list-style: none; }
  .activity-footer > details > summary::-webkit-details-marker { display: none; }
  .activity-summary { flex: 1; min-width: 0; color: var(--muted); font-size: .82rem; }
  .activity-toggle-hint { color: var(--accent); font-size: .82rem; }
  .activity-drawer-body { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; padding: 18px; border-top: 1px solid var(--line); }
  .activity-drawer-body h2 { margin-bottom: 12px; }
  .timeline { display: grid; gap: 8px; list-style: none; padding: 0; margin: 0; }
  .timeline li { display: flex; align-items: start; gap: 10px; padding: 12px; border: 1px solid var(--line); border-radius: 8px; font-size: .82rem; }
  .timeline li.active { border-color: var(--accent); }
  .timeline li.error { color: var(--error); }
  .activity-time, .activity-detail { display: block; font-size: .78rem; color: var(--muted); }
  .activity-content { min-width: 0; }
  .active .activity-icon { width: 16px; height: 16px; flex-shrink: 0; border: 2px solid var(--line); border-top-color: var(--accent); border-radius: 50%; font-size: 0; animation: dashboard-spin .8s linear infinite; }
  .stream-content { max-height: 300px; overflow: auto; white-space: pre-wrap; }
  .markdown-report h1, .markdown-report h2, .markdown-report h3 { margin: 12px 0 6px; color: var(--text); }
  .markdown-report p { margin: 6px 0; }
  .markdown-report pre { overflow: auto; }
  .markdown-report code { background: var(--track); border-radius: 4px; padding: 1px 4px; }
  .debug-events { grid-column: 1 / -1; }
  [hidden] { display: none !important; }
  body.compact main { padding-top: 18px; }
  @keyframes dashboard-spin { to { transform: rotate(360deg); } }
  @media (max-width: 900px) {
    .kpi-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .activity-drawer-body { grid-template-columns: 1fr; }
  }
  @media (max-width: 600px) {
    main { padding: 18px 12px 28px; }
    .page-header { align-items: start; }
    .page-header .actions { width: 100%; }
    .scope-panel .controls > label { width: 100%; }
    .scope-panel select { width: 100%; }
    .panel { padding: 14px; }
    .kpi-strip { grid-template-columns: 1fr; }
    .kpi-value { font-size: 1.5rem; }
    .activity-footer > details > summary { flex-wrap: wrap; }
  }
  @media (pointer: coarse) { input, select, button, .button { min-height: 44px; } }
  @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; scroll-behavior: auto !important; } }
`;
