import { formatCompact } from '../../core/math';
import { RESOURCES } from '../../data/resources';
import type { Mission } from '../../game/state';
import { t, tk } from '../../i18n/i18n';
import type { UIContext } from '../context';
import { button, h, setText } from '../dom';
import { icon } from '../icons';
import { GameWindow } from './Window';

/** Contract board: offers to accept and active contracts to fulfil. */
export class MissionsWindow extends GameWindow {
  private signature = '';
  private timers = new Map<number, { text: HTMLElement; fill: HTMLElement; progress: HTMLElement }>();

  constructor(private readonly ctx: UIContext) {
    super('missions', 'missions.title', 'missions');
  }

  private computeSignature(): string {
    const game = this.ctx.game();
    if (!game) return '';
    const m = game.state.missions;
    return `${m.offers.map((o) => o.id).join(',')}|${m.active.map((a) => `${a.id}:${a.progress}`).join(',')}`;
  }

  private describe(m: Mission): string {
    return tk(`mission.${m.templateId}`, { client: m.client, qty: m.qty, good: m.good ? `res.${m.good}` : '', hours: m.durationHours });
  }

  rebuild(): void {
    this.body.replaceChildren();
    this.timers.clear();
    const game = this.ctx.game();
    if (!game) return;
    this.signature = this.computeSignature();
    const s = game.state.missions;
    this.body.append(h('div', { class: 'ships-head' }, h('span', { class: 'pill' }, icon('missions'), t('missions.limit', { n: s.active.length, max: game.missions.maxActive() }))));
    if (s.active.length) {
      this.body.append(h('div', { class: 'section-title', text: t('missions.active') }));
      for (const m of s.active) this.body.append(this.card(m, true));
    }
    if (s.offers.length) {
      this.body.append(h('div', { class: 'section-title', text: t('missions.offers') }));
      for (const m of s.offers) this.body.append(this.card(m, false));
    }
    if (!s.active.length && !s.offers.length) this.body.append(h('p', { class: 'empty', text: t('missions.none') }));
    this.refresh();
  }

  private card(m: Mission, active: boolean): HTMLElement {
    const game = this.ctx.game();
    const text = h('span', { class: 'ship-timer' });
    const fill = h('div', { class: 'bar-fill' });
    const progress = h('span', { class: 'muted small' });
    this.timers.set(m.id, { text, fill, progress });
    const rewards = h(
      'div',
      { class: 'chips' },
      h('span', { class: 'cost-chip', style: { '--res-color': RESOURCES.credits.color } }, icon('credits'), formatCompact(m.rewardCredits)),
      h('span', { class: 'cost-chip', style: { '--res-color': '#7cf0d0' } }, icon('reputation'), t('missions.rep', { v: m.rewardReputation })),
      m.rewardResearch ? h('span', { class: 'cost-chip', style: { '--res-color': RESOURCES.research.color } }, icon('research'), t('missions.rp', { v: m.rewardResearch })) : null,
    );
    const actions = h('div', { class: 'ship-actions' });
    if (!active) {
      actions.append(
        button(h('span', { class: 'btn-inner' }, icon('check'), t('missions.accept')), () => {
          const result = game?.missions.accept(m.id);
          if (result && !result.ok) {
            this.ctx.playSound('error');
            game?.notify('warning', `missions.error.${result.reason}`);
          } else this.ctx.playSound('click');
          this.rebuild();
        }, 'btn success small'),
        button(t('missions.decline'), () => {
          game?.missions.decline(m.id);
          this.rebuild();
        }, 'btn ghost small'),
      );
    } else {
      if (m.kind === 'deliver') {
        const deliver = button(h('span', { class: 'btn-inner' }, icon('dock'), t('missions.deliver')), () => {
          const result = game?.missions.deliver(m.id);
          if (result?.ok) {
            this.ctx.playSound('trade');
            game?.notify('success', 'missions.deliverDone', { qty: result.qty });
          } else if (result) {
            this.ctx.playSound('error');
            game?.notify('warning', `missions.error.${result.reason}`);
          }
          this.rebuild();
        }, 'btn primary small');
        deliver.disabled = !m.good || (game?.state.resources[m.good] ?? 0) < 1;
        actions.append(deliver);
      }
      actions.append(button(t('missions.abandon'), () => {
        game?.missions.abandon(m.id);
        this.rebuild();
      }, 'btn danger small'));
    }
    return h(
      'div',
      { class: `ship-card mission-card${m.special ? ' special' : ''}`, style: { '--ship-color': m.special ? '#ff7ae0' : m.good ? RESOURCES[m.good].color : '#7cf0d0' } },
      h('div', { class: 'ship-top' }, h('span', { class: 'ship-icon' }, icon(m.good ?? (m.kind === 'dock' ? 'dock' : 'crew'))), h('div', { class: 'ship-title' }, h('span', { class: 'ship-name', text: m.client }), h('span', { class: 'ship-type', text: this.describe(m) })), m.special ? h('span', { class: 'tag special', text: t('missions.special') }) : null),
      rewards,
      active ? progress : null,
      h('div', { class: 'ship-status' }, text, h('div', { class: 'bar' }, fill)),
      actions,
    );
  }

  override refresh(): void {
    const game = this.ctx.game();
    if (!game) return;
    if (this.computeSignature() !== this.signature) {
      this.rebuild();
      return;
    }
    const all = [...game.state.missions.active, ...game.state.missions.offers];
    for (const m of all) {
      const timer = this.timers.get(m.id);
      if (!timer) continue;
      const left = Math.max(0, m.expiresAt - game.hour);
      setText(timer.text, m.acceptedAt ? t('missions.deadline', { hours: left.toFixed(1) }) : t('missions.expires', { hours: left.toFixed(1) }));
      timer.fill.style.width = `${game.missions.timeLeft(m) * 100}%`;
      if (m.kind === 'deliver') setText(timer.progress, t('mission.progressDeliver', { done: Math.floor(m.progress), qty: m.qty }));
      else if (m.kind === 'hospitality') setText(timer.progress, t('mission.progressHost', { qty: m.qty, done: Math.floor(m.progress), hours: m.durationHours }));
      else setText(timer.progress, t('mission.progressDock', { done: Math.max(0, m.progress), qty: m.qty }));
    }
  }
}
