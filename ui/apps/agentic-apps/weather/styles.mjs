export const weatherStyles = `
  .weather-content { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 18px; }
  .weather-content > .panel { margin: 0; }
  .guidance-panel, .conditions-panel, .outlook-panel, .alerts-panel, .copilot { grid-column: 1 / -1; }
  .metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
  .metric .icon { color: var(--muted); font-size: .82rem; }
  .insight-card { border: 0; padding: 0; }
  .risk-pills { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
  .risk-pill { border: 1px solid var(--line); border-radius: 6px; padding: 4px 8px; color: var(--warning); font-size: .82rem; }
  .chart { width: 100%; min-height: 220px; margin-top: 14px; }
  .days { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 10px; }
  .day { cursor: pointer; display: grid; align-content: space-between; gap: 12px; min-height: 165px; padding: 12px; }
  .day:hover { border-color: var(--accent); background: var(--track); }
  .day-header { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
  .day strong { color: var(--text); font-size: .88rem; font-weight: 600; }
  .weather-icon { font-size: 1.25rem; }
  .condition { color: var(--muted); font-size: .82rem; min-height: 36px; }
  .forecast-temps { font-size: 1.1rem; font-weight: 600; }
  .forecast-temps .low { color: var(--muted); font-size: .88rem; }
  .forecast-meta { display: grid; gap: 4px; }
  .forecast-chip { font-size: .75rem; color: var(--muted); }
  .air-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: 14px; }
  .alert-row + .alert-row { margin-top: 12px; }
  .alert-row strong { color: var(--error); }
  .alert-row span { display: block; margin-top: 6px; color: var(--muted); font-size: .85rem; }
  .copilot .actions { margin-top: 12px; }
  .weather-question-input { margin-top: 5px; }
  @media (max-width: 1100px) { .days { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
  @media (max-width: 900px) {
    .weather-content { grid-template-columns: 1fr; }
    .metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
  @media (max-width: 600px) {
    .days { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .air-grid { grid-template-columns: 1fr; }
  }
`;
