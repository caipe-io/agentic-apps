export const ossRepoStyles = `
  .repo-profile { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-top: 14px; }
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
  @media (max-width: 900px) {
    .repo-profile, .practice-grid, .criteria-grid, .action-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .report-grid { grid-template-columns: 1fr; }
  }
  @media (max-width: 600px) { .repo-profile, .practice-grid, .criteria-grid, .action-grid { grid-template-columns: 1fr; } }
`;
