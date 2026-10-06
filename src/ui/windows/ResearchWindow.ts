import { TECHS, TECH_IDS, type Modifiers, type TechId } from '../../data/research';
import { t, tk } from '../../i18n/i18n';
import type { UIContext } from '../context';
import { button, h, setText } from '../dom';
import { icon } from '../icons';
import { GameWindow } from './Window';

const NODE_W = 184;
const NODE_H = 78;
const GAP_X = 54;
const GAP_Y = 22;

function effectText(key: keyof Modifiers, value: number): string {
  const pct = key === 'staffReduction' || key === 'happiness' ? `${value > 0 ? '+' : ''}${key === 'staffReduction' ? -value : value}` : `${value > 0 ? '+' : ''}${Math.round(value * 100)}%`;
  return tk(`effect.${key}`, { v: pct });
}

/** Visual technology tree with prerequisites drawn as connections. */
export class ResearchWindow extends GameWindow {
  private selected: TechId = 'basicPower';
  private nodes = new Map<TechId, HTMLElement>();
  private progressFill: HTMLElement | null = null;
  private header: HTMLElement | null = null;
  private detail: HTMLElement | null = null;
  private signature = '';

  constructor(private readonly ctx: UIContext) {
    super('research', 'research.title', 'research', 'wide');
  }

  private status(id: TechId): 'completed' | 'active' | 'available' | 'locked' {
    const game = this.ctx.game();
    if (!game) return 'locked';
    if (game.research.isCompleted(id)) return 'completed';
    if (game.state.research.active?.id === id) return 'active';
    return game.research.prerequisitesMet(id) ? 'available' : 'locked';
  }

  private computeSignature(): string {
    const game = this.ctx.game();
    if (!game) return '';
    return `${game.state.research.completed.join(',')}|${game.state.research.active?.id ?? ''}|${TECH_IDS.map((id) => (game.research.check(id).ok ? 1 : 0)).join('')}|${this.selected}`;
  }

  rebuild(): void {
    this.body.replaceChildren();
    this.nodes.clear();
    const game = this.ctx.game();
    if (!game) return;
    this.signature = this.computeSignature();
    if (!this.nodes.size && game.state.research.active) this.selected = game.state.research.active.id;

    this.header = h('div', { class: 'rs-head' });
    this.progressFill = h('div', { class: 'bar-fill' });
    this.body.append(this.header, h('div', { class: 'bar rs-progress' }, this.progressFill), h('p', { class: 'muted small', text: t('research.hint') }));

    const cols = Math.max(...TECH_IDS.map((id) => TECHS[id].col)) + 1;
    const rows = Math.max(...TECH_IDS.map((id) => TECHS[id].row)) + 1;
    const width = cols * NODE_W + (cols - 1) * GAP_X;
    const height = rows * NODE_H + (rows - 1) * GAP_Y;
    const canvas = h('div', { class: 'tree-canvas', style: { width: `${width}px`, height: `${height}px` } });
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    svg.classList.add('tree-links');
    const pos = (id: TechId): { x: number; y: number } => ({ x: TECHS[id].col * (NODE_W + GAP_X), y: TECHS[id].row * (NODE_H + GAP_Y) });
    for (const id of TECH_IDS) {
      for (const req of TECHS[id].requires) {
        const a = pos(req);
        const b = pos(id);
        const x1 = a.x + NODE_W;
        const y1 = a.y + NODE_H / 2;
        const x2 = b.x;
        const y2 = b.y + NODE_H / 2;
        const path = document.createElementNS(ns, 'path');
        const mx = (x1 + x2) / 2;
        path.setAttribute('d', `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`);
        path.setAttribute('class', `link ${game.research.isCompleted(req) ? 'done' : ''}`);
        svg.append(path);
      }
    }
    canvas.append(svg);
    for (const id of TECH_IDS) {
      const p = pos(id);
      const st = this.status(id);
      const def = TECHS[id];
      const affordable = game.research.check(id).ok;
      const node = h(
        'button',
        {
          class: `tech-node st-${st}${affordable ? ' affordable' : ''}${id === this.selected ? ' selected' : ''}`,
          attrs: { type: 'button' },
          dataset: { tech: id },
          style: { left: `${p.x}px`, top: `${p.y}px`, width: `${NODE_W}px`, height: `${NODE_H}px` },
        },
        h('span', { class: 'tn-name', text: tk(`tech.${id}.name`) }),
        h('span', { class: 'tn-cost', text: st === 'completed' ? t('research.status.completed') : t('research.cost', { rp: def.research, cr: def.credits, h: def.hours }) }),
        st === 'active' ? h('div', { class: 'tn-bar' }, h('div', { class: 'tn-fill' })) : null,
      );
      node.addEventListener('click', () => {
        this.ctx.playSound('click');
        this.selected = id;
        this.rebuild();
      });
      this.nodes.set(id, node);
      canvas.append(node);
    }
    this.body.append(h('div', { class: 'tree-scroll scroll' }, canvas));
    this.detail = h('div', { class: 'tech-detail' });
    this.body.append(this.detail);
    this.renderDetail();
    this.refresh();
  }

  private renderDetail(): void {
    const game = this.ctx.game();
    if (!game || !this.detail) return;
    const id = this.selected;
    const def = TECHS[id];
    const st = this.status(id);
    const parts: HTMLElement[] = [
      h('div', { class: 'td-head' }, h('span', { class: 'td-name', text: tk(`tech.${id}.name`) }), h('span', { class: `status-pill st-${st === 'completed' ? 'active' : st === 'locked' ? 'disabled' : 'constructing'}`, text: t(`research.status.${st}`) })),
      h('p', { class: 'mod-desc', text: tk(`tech.${id}.desc`) }),
    ];
    const unlocks: string[] = [];
    for (const m of def.unlocksModules ?? []) unlocks.push(tk(`module.${m}.name`));
    for (const f of def.features ?? []) unlocks.push(tk(`feature.${f}`));
    if (unlocks.length) parts.push(h('div', { class: 'section-title', text: t('research.unlocks') }), h('ul', { class: 'feature-list' }, ...unlocks.map((u) => h('li', { text: u }))));
    const effects = (Object.entries(def.effects) as [keyof Modifiers, number][]).map(([k, v]) => effectText(k, v));
    if (effects.length) parts.push(h('div', { class: 'section-title', text: t('research.effects') }), h('ul', { class: 'feature-list' }, ...effects.map((e) => h('li', { text: e }))));
    if (def.requires.length) parts.push(h('p', { class: 'muted small', text: t('research.requires', { list: def.requires.map((r) => tk(`tech.${r}.name`)).join(', ') }) }));
    const actions = h('div', { class: 'win-actions' });
    if (st === 'available') {
      const check = game.research.check(id);
      const go = button(h('span', { class: 'btn-inner' }, icon('research'), `${t('research.start')} · ${t('research.cost', { rp: def.research, cr: def.credits, h: def.hours })}`), () => {
        const result = game.research.start(id);
        if (result.ok) this.ctx.playSound('click');
        else {
          this.ctx.playSound('error');
          game.notify('warning', `research.error.${result.reason}`);
        }
        this.rebuild();
      }, 'btn primary');
      go.disabled = !check.ok;
      actions.append(go);
      if (!check.ok) actions.append(h('span', { class: 'muted small', text: t(`research.error.${check.reason}`) }));
    } else if (st === 'active') {
      actions.append(button(t('research.cancel'), () => {
        game.research.cancel();
        this.rebuild();
      }, 'btn ghost'));
    }
    parts.push(actions);
    this.detail.replaceChildren(...parts);
  }

  override refresh(): void {
    const game = this.ctx.game();
    if (!game) return;
    if (this.computeSignature() !== this.signature) {
      this.rebuild();
      return;
    }
    const active = game.state.research.active;
    if (this.header) {
      const text = active ? t('research.active', { tech: `tech.${active.id}.name` }) : t('research.idle');
      setText(this.header, `${text} · ${t('research.points', { v: Math.floor(game.state.resources.research) })} · ${t('research.speed', { v: game.research.speed().toFixed(1) })}`);
    }
    const ratio = active ? active.progress / active.duration : 0;
    if (this.progressFill) this.progressFill.style.width = `${Math.min(100, ratio * 100)}%`;
    if (active) {
      const fill = this.nodes.get(active.id)?.querySelector<HTMLElement>('.tn-fill');
      if (fill) fill.style.width = `${Math.min(100, ratio * 100)}%`;
    }
  }
}
