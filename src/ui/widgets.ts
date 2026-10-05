import { clamp } from '../core/math';
import { button, h } from './dom';

/** Quantity selector with -/+ buttons, numeric input and a Max shortcut. */
export class QtyStepper {
  readonly el: HTMLElement;
  private readonly input: HTMLInputElement;
  private max = 0;
  value = 0;

  constructor(
    initial: number,
    private readonly onChange: (v: number) => void,
    maxLabel: string,
  ) {
    this.input = h('input', { class: 'qty-input', attrs: { type: 'number', inputmode: 'numeric', min: '0', step: '1' } });
    this.input.addEventListener('input', () => this.set(Number(this.input.value) || 0, false));
    this.input.addEventListener('focus', () => this.input.select());
    const step = (d: number) => () => this.set(this.value + d);
    this.el = h(
      'div',
      { class: 'qty' },
      button('−', step(-10), 'qty-btn wide', '-10'),
      button('−1', step(-1), 'qty-btn'),
      this.input,
      button('+1', step(1), 'qty-btn'),
      button('+', step(10), 'qty-btn wide', '+10'),
      button(maxLabel, () => this.set(this.max), 'qty-btn max'),
    );
    this.set(initial);
  }

  setMax(max: number): void {
    this.max = Math.max(0, Math.floor(max));
    if (this.value > this.max) this.set(this.max);
  }

  set(v: number, updateInput = true): void {
    this.value = clamp(Math.floor(v), 0, this.max);
    if (updateInput || Number(this.input.value) !== this.value) this.input.value = String(this.value);
    this.onChange(this.value);
  }
}

export function toggle(label: string, checked: boolean, onChange: (v: boolean) => void, disabled = false): HTMLElement {
  const input = h('input', { attrs: { type: 'checkbox' } });
  input.checked = checked;
  input.disabled = disabled;
  input.addEventListener('change', () => onChange(input.checked));
  return h('label', { class: `toggle${disabled ? ' disabled' : ''}` }, input, h('span', { class: 'toggle-track' }, h('span', { class: 'toggle-thumb' })), h('span', { class: 'toggle-label', text: label }));
}

export function slider(opts: { min: number; max: number; step: number; value: number; onInput: (v: number) => void; label?: (v: number) => string }): HTMLElement {
  const input = h('input', { class: 'slider', attrs: { type: 'range', min: String(opts.min), max: String(opts.max), step: String(opts.step) } });
  input.value = String(opts.value);
  const out = h('span', { class: 'slider-value', text: opts.label ? opts.label(opts.value) : String(opts.value) });
  input.addEventListener('input', () => {
    const v = Number(input.value);
    out.textContent = opts.label ? opts.label(v) : String(v);
    opts.onInput(v);
  });
  return h('div', { class: 'slider-row' }, input, out);
}

/** Small inline SVG line chart. */
export function sparkline(values: readonly number[], width = 90, height = 26, color = 'var(--accent)'): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.classList.add('sparkline');
  if (values.length < 2) return svg;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * (width - 2) + 1).toFixed(1)},${(height - 2 - ((v - min) / span) * (height - 4)).toFixed(1)}`);
  const area = document.createElementNS(ns, 'polygon');
  area.setAttribute('points', `1,${height} ${pts.join(' ')} ${width - 1},${height}`);
  area.setAttribute('fill', color);
  area.setAttribute('opacity', '0.12');
  const line = document.createElementNS(ns, 'polyline');
  line.setAttribute('points', pts.join(' '));
  line.setAttribute('fill', 'none');
  line.setAttribute('stroke', color);
  line.setAttribute('stroke-width', '1.6');
  line.setAttribute('stroke-linejoin', 'round');
  svg.append(area, line);
  return svg;
}

/** Bar chart of signed values (e.g. daily net results). */
export function barChart(values: readonly { label: string; value: number }[], height = 90): HTMLElement {
  const max = Math.max(1, ...values.map((v) => Math.abs(v.value)));
  const wrap = h('div', { class: 'bars', style: { height: `${height}px` } });
  for (const v of values) {
    const pct = (Math.abs(v.value) / max) * 50;
    const bar = h('div', { class: `bar-col ${v.value >= 0 ? 'pos' : 'neg'}`, title: `${v.label}: ${Math.round(v.value)}` }, h('div', { class: 'bar-v', style: { height: `${pct}%` } }), h('span', { class: 'bar-label', text: v.label }));
    wrap.append(bar);
  }
  return wrap;
}

export function progress(ratio: number, cls = ''): HTMLElement {
  return h('div', { class: `bar ${cls}` }, h('div', { class: 'bar-fill', style: { width: `${clamp(ratio, 0, 1) * 100}%` } }));
}
