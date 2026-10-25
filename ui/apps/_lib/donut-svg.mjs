/** Shared SVG geometry for the LLM and EC2 composition charts; no DOM or external state. */
export function renderDonutSvg(rows, { totalLabel, unit = "instances", emptyLabel = "No instances" } = {}) {
  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
  const positive = rows.filter((row) => Number.isFinite(row.value) && row.value > 0);
  const total = positive.reduce((sum, row) => sum + row.value, 0);
  if (!total || !Number.isFinite(total) || rows.some((row) => !Number.isFinite(row.value) || row.value < 0)) {
    return '<circle cx="120" cy="120" r="94" fill="none" stroke="var(--track)" stroke-width="40"/><text x="120" y="125" text-anchor="middle" fill="var(--muted)" font-size="15">' + escape(emptyLabel) + '</text>';
  }
  let angle = -Math.PI / 2;
  const slices = positive.map((row) => {
    const fraction = row.value / total;
    const end = angle + fraction * Math.PI * 2;
    const color = /^#[a-f0-9]{3,8}$/i.test(row.color) ? row.color : "#94a3b8";
    const title = '<title>' + escape(row.name + ": " + (row.label ?? row.value) + " · " + (fraction * 100).toFixed(1) + "%") + '</title>';
    const path = '<path d="M120 120 L' + (120 + 110 * Math.cos(angle)) + ' ' + (120 + 110 * Math.sin(angle)) + ' A110 110 0 ' + (fraction > .5 ? 1 : 0) + ' 1 ' + (120 + 110 * Math.cos(end)) + ' ' + (120 + 110 * Math.sin(end)) + ' Z" fill="' + color + '" stroke="var(--surface)" stroke-width="2">' + title + '</path>';
    angle = end;
    return fraction > .999999 ? '<circle cx="120" cy="120" r="110" fill="' + color + '">' + title + '</circle>' : path;
  }).join("");
  return slices + '<circle cx="120" cy="120" r="68" fill="var(--surface)"/><text x="120" y="119" text-anchor="middle" fill="var(--text)" font-size="23" font-weight="600">' + escape(totalLabel ?? total) + '</text><text x="120" y="140" text-anchor="middle" fill="var(--muted)" font-size="11">' + escape(unit) + '</text>';
}
