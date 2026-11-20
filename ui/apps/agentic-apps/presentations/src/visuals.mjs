// Template-relative, editable evidence compositions. No brand assets or remote content.
import { DeckValidationError } from './validation.mjs';
export const visualLayouts = ['metrics', 'comparison', 'flow', 'timeline', 'layers', 'ledger'];
export function planVisual(visual, profile, density, role) {
  const [x, y, width, height] = profile.canvas;
  const color = { context: 'accent1', actionable: 'accent2', exploration: 'accent3' }[role];
  const size = density === 'dense' ? 16 : 18;
  const boxes = [], lines = [];
  const groups = visual.groups;
  const words = groups.flatMap(group => [group.label, group.value || '', ...group.items]).join(' ').trim().split(/\s+/u).length;
  if (words > { spacious: 35, balanced: 60, dense: 130 }[density]) throw new DeckValidationError('VISUAL_TOO_DENSE', 'Visual exceeds the selected density', 'Shorten on-slide text and preserve full details in notes. Keep the selected density and agreed slide count.');
  if (['metrics', 'comparison'].includes(visual.layout) && groups.length > 3) throw new DeckValidationError('TOO_MANY_GROUPS', 'Use two or three groups for metrics or comparison', 'Use another suitable layout or ask approval before changing the slide count.', ['groups']);
  if (visual.layout === 'metrics' && groups.some(group => !group.value?.trim())) throw new DeckValidationError('METRIC_VALUE_REQUIRED', 'Metrics require explicit sourced values; never infer a number', 'Use existing measurements, comparison for qualitative priorities, or timeline for milestones.', ['groups']);
  function text(value, left, top, w, fontSize, ink = 'tx1') {
    if (!value) return top;
    const capacity = Math.max(1, w * 72 / (fontSize * .6));
    let count = 1, used = 0;
    for (const word of value.split(/\s+/u)) {
      const length = [...word].reduce((n, char) => n + (/[^\u0000-\u024f]/u.test(char) ? 1.6 : 1), 0);
      if (used && used + length + 1 > capacity) { count++; used = 0; }
      count += Math.max(0, Math.ceil(length / capacity) - 1);
      used += length % capacity || capacity;
      used++;
    }
    const h = count * fontSize / 72 * 1.24;
    boxes.push({ text: value, x: left, y: top, w, h, size: fontSize, color: ink });
    return top + h;
  }
  if (['ledger', 'layers'].includes(visual.layout)) {
    const row = height / groups.length;
    groups.forEach((group, i) => {
      const top = y + i * row;
      lines.push({ x, y: top, w: width, h: 0, color: 'tx2' });
      text(String(i + 1).padStart(2, '0'), x, top + .14, .5, 20, color);
      text(group.label, x + .7, top + .14, width * .36 - .7, 22);
      const detailX = x + width * .39;
      const detailW = width * .61;
      text([group.value, ...group.items].filter(Boolean).join(' · '), detailX, top + .14, detailW, size);
      if (visual.layout === 'layers' && i < groups.length - 1) lines.push({ x: x + .2, y: top + row - .25, w: 0, h: .2, color, arrow: true });
      const rowBoxes = boxes.filter(box => box.y >= top && box.y < top + row);
      if (rowBoxes.some(box => box.y + box.h > top + row - .06)) throw new DeckValidationError('VISUAL_ROW_TOO_DENSE', 'Visual row is too dense', 'Shorten this group’s labels or use fewer groups; preserve details in notes.', ['groups', i]);
    });
  } else {
    const gap = .36;
    const w = (width - gap * (groups.length - 1)) / groups.length;
    groups.forEach((group, i) => {
      const left = x + i * (w + gap);
      let top = y;
      if (visual.layout === 'metrics') {
        lines.push({ x: left, y, w, h: 0, color });
        top = text(group.value, left, y + .22, w, 72, color) + .15;
      } else if (['flow', 'timeline'].includes(visual.layout)) {
        text(String(i + 1).padStart(2, '0'), left, y, .6, 30, color);
        if (i < groups.length - 1) lines.push({ x: left + .7, y: y + .24, w: w + gap - .85, h: 0, color, arrow: true });
        top = y + .8;
      } else if (i) lines.push({ x: left - gap / 2, y, w: 0, h: height, color: 'tx2' });
      if (group.value && visual.layout !== 'metrics') top = text(group.value, left, top, w, size, color) + .12;
      top = text(group.label, left, top, w, 24) + .18;
      for (const item of group.items) top = text(item, left, top, w, size) + .12;
    });
  }
  // Reject overflow rather than silently shrinking text, dropping content or rasterizing it.
  if (lines.some(line => line.w < 0 || line.h < 0 || line.x < x || line.y < y || line.x + line.w > x + width + .001 || line.y + line.h > y + height + .001) || boxes.some(box => box.w <= 0 || box.x < x || box.y < y || box.x + box.w > x + width + .001 || box.y + box.h > y + height + .001)) throw new DeckValidationError('VISUAL_CANVAS_OVERFLOW', 'Visual does not fit the template canvas', 'Shorten labels or use fewer groups; preserve full details in notes without changing mode or density.');
  return { layout: visual.layout, boxes, lines, words };
}
