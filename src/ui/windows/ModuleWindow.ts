import { clamp } from '../../core/math';
import { MODULES } from '../../data/modules';
import type { ModuleState } from '../../game/state';
import { t, tk } from '../../i18n/i18n';
import type { UIContext } from '../context';
import { confirmDialog } from '../Dialog';
import { button, h, setText } from '../dom';
import { costChips, moduleFeatures, moduleFlowChips } from '../format';
import { icon } from '../icons';
import { GameWindow } from './Window';

export function moduleStatusKey(m: ModuleState, hour: number): 'constructing' | 'damaged' | 'offline' | 'disabled' | 'active' {
  if (m.status === 'constructing') return 'constructing';
  if (m.damaged) return 'damaged';
  if (m.offlineUntil > hour) return 'offline';
  if (!m.enabled) return 'disabled';
  return 'active';
}

/** Details and actions for the selected module. */
export class ModuleWindow extends GameWindow {
  private moduleId: number | null = null;
  private statusEl: HTMLElement | null = null;
  private progressFill: HTMLElement | null = null;
  private effFill: HTMLElement | null = null;
  private effText: HTMLElement | null = null;
  private lastStatus = '';

  constructor(
    private readonly ctx: UIContext,
    private readonly overlay: HTMLElement,
    private readonly onFocus: (id: number) => void,
  ) {
    super('module', 'hud.module', 'info');
  }

  setModule(id: number | null): void {
    this.moduleId = id;
    if (this.isOpen) this.rebuild();
  }

  get selectedId(): number | null {
    return this.moduleId;
  }

  private module(): ModuleState | undefined {
    return this.moduleId === null ? undefined : this.ctx.game()?.station.getModule(this.moduleId);
  }

  rebuild(): void {
    this.body.replaceChildren();
    const game = this.ctx.game();
    const m = this.module();
    if (!game || !m) return;
    const def = MODULES[m.type];
    this.statusEl = h('span', { class: 'status-pill' });
    this.progressFill = null;
    const flows = moduleFlowChips(m.type);
    const features = moduleFeatures(m.type);

    const head = h(
      'div',
      { class: 'mod-head', style: { '--accent': def.accent } },
      h('div', { class: 'mod-name', text: tk(`module.${m.type}.name`) }),
      this.statusEl,
    );
    this.body.append(head, h('p', { class: 'mod-desc', text: tk(`module.${m.type}.desc`) }));

    this.effFill = null;
    this.effText = null;
    if (m.status === 'constructing') {
      this.progressFill = h('div', { class: 'bar-fill' });
      this.body.append(h('div', { class: 'bar' }, this.progressFill));
    } else if (Object.keys(def.produces).length > 0 || Object.keys(def.consumes).length > 0) {
      this.effFill = h('div', { class: 'bar-fill' });
      this.effText = h('span', { class: 'eff-value' });
      this.body.append(
        h('div', { class: 'eff-row' }, h('span', { class: 'section-title', text: t('res.efficiency') }), this.effText),
        h('div', { class: 'bar' }, this.effFill),
      );
    }
    if (flows.produces.length) this.body.append(this.section(t('info.produces'), h('div', { class: 'chips' }, ...flows.produces)));
    if (flows.consumes.length) this.body.append(this.section(t('info.consumes'), h('div', { class: 'chips' }, ...flows.consumes)));
    if (features.length) this.body.append(this.section(t('info.features'), h('ul', { class: 'feature-list' }, ...features.map((f) => h('li', { text: f })))));
    const required = game.crew.required(m.type);
    if (def.staff) {
      const staffing = game.crew.staffingOf(m.id);
      const names = staffing.crew.map((id) => game.crew.get(id)).filter((c) => !!c).map((c) => `${c?.name} (${tk(`role.${c?.role ?? 'worker'}`)})`);
      this.body.append(
        this.section(
          t('info.staff'),
          h(
            'div',
            { class: 'staff-box' },
            h('span', { class: `status-pill ${staffing.filled >= required ? '' : 'st-constructing'}`, text: required === 0 ? t('info.automated') : t('info.staffCount', { filled: staffing.crew.length, required }) }),
            ...names.map((n) => h('span', { class: 'muted small', text: n })),
          ),
        ),
      );
    }
    this.body.append(
      this.section(
        t('info.upkeep'),
        h('div', { class: 'kv' }, h('span', { class: 'cost-chip', style: { '--res-color': '#ffd166' } }, icon('credits'), t('info.perDay', { v: def.upkeep }))),
      ),
    );
    if (!def.unique) this.body.append(this.section(t('info.cost'), costChips(def.cost, null)));

    const actions = h('div', { class: 'win-actions' });
    actions.append(button(h('span', { class: 'btn-inner' }, icon('focus'), t('info.focus')), () => this.onFocus(m.id), 'btn ghost'));
    if (m.damaged) {
      const cost = game.repairCost(m);
      actions.append(
        button(h('span', { class: 'btn-inner' }, icon('wrench'), t('info.repairCost', cost)), () => {
          const result = game.repairModule(m.id);
          if (result.ok) this.ctx.playSound('build');
          else {
            this.ctx.playSound('error');
            game.notify('warning', 'info.repairError');
          }
          this.rebuild();
        }, 'btn success'),
      );
    }
    if (!def.unique && m.status === 'active') {
      actions.append(
        button(h('span', { class: 'btn-inner' }, icon('power'), m.enabled ? t('info.disable') : t('info.enable')), () => {
          this.ctx.playSound('click');
          game.setModuleEnabled(m.id, !m.enabled);
          this.rebuild();
        }, m.enabled ? 'btn' : 'btn success'),
      );
    }
    if (!def.unique) {
      const constructing = m.status === 'constructing';
      actions.append(
        button(h('span', { class: 'btn-inner' }, icon('trash'), constructing ? t('info.cancelBuild') : t('info.demolish')), () => void this.demolish(m), 'btn danger'),
      );
    }
    this.body.append(actions);
    this.lastStatus = '';
    this.refresh();
  }

  private async demolish(m: ModuleState): Promise<void> {
    const game = this.ctx.game();
    if (!game) return;
    const check = game.canDemolish(m.id);
    if (!check.ok) {
      this.ctx.playSound('error');
      game.notify('warning', `demolish.error.${check.reason}`);
      return;
    }
    const key = m.status === 'constructing' ? 'info.confirmCancel' : 'info.confirmDemolish';
    const ok = await confirmDialog(this.overlay, t(key, { module: `module.${m.type}.name` }), { danger: true });
    if (!ok) return;
    const result = game.demolishModule(m.id);
    if (result.ok) {
      this.ctx.playSound('build');
      this.onRequestClose?.();
    } else {
      this.ctx.playSound('error');
      game.notify('warning', `demolish.error.${result.reason}`);
    }
  }

  private section(title: string, content: HTMLElement): HTMLElement {
    return h('div', { class: 'win-section' }, h('div', { class: 'section-title', text: title }), content);
  }

  override refresh(): void {
    const game = this.ctx.game();
    const m = this.module();
    if (!game || !m) {
      if (this.isOpen) this.onRequestClose?.();
      return;
    }
    const status = moduleStatusKey(m, game.hour);
    const pct = Math.round(clamp(m.buildProgress / (MODULES[m.type].buildHours || 1), 0, 1) * 100);
    if (this.statusEl) {
      setText(this.statusEl, t(`info.status.${status}`, { pct }));
      this.statusEl.className = `status-pill st-${status}`;
    }
    if (this.progressFill) this.progressFill.style.width = `${pct}%`;
    if (this.effFill && this.effText) {
      const eff = Math.round((game.resources.flows.efficiency.get(m.id) ?? 0) * 100);
      this.effFill.style.width = `${Math.min(100, eff)}%`;
      setText(this.effText, `${eff}%`);
      this.effText.className = `eff-value${eff < 60 ? ' low' : ''}`;
    }
    const signature = `${m.status}|${m.damaged}|${m.enabled}`;
    if (this.lastStatus && this.lastStatus !== signature) this.rebuild();
    this.lastStatus = signature;
  }
}
