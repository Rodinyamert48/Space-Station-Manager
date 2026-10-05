import { formatCompact } from '../../core/math';
import type { GameSpeed } from '../../game/state';
import { t, tk } from '../../i18n/i18n';
import type { UIContext } from '../context';
import { button, h, setText, toggleClass } from '../dom';
import { icon, type IconName } from '../icons';

export interface NavEntry {
  id: string;
  icon: IconName;
  label: () => string;
}

export function reputationTier(value: number): number {
  return Math.min(4, Math.floor(value / 20));
}

/** Top dashboard bar: credits, clock, speed controls, reputation, stage and window navigation. */
export class TopBar {
  readonly el: HTMLElement;
  private readonly credits: HTMLElement;
  private readonly creditsDelta: HTMLElement;
  private readonly clock: HTMLElement;
  private readonly day: HTMLElement;
  private readonly rep: HTMLElement;
  private readonly repTier: HTMLElement;
  private readonly stage: HTMLElement;
  private readonly speedButtons = new Map<GameSpeed, HTMLButtonElement>();
  private readonly navButtons = new Map<string, HTMLButtonElement>();
  private readonly nav: HTMLElement;
  private readonly fps: HTMLElement;

  constructor(
    private readonly ctx: UIContext,
    private readonly openWindow: (id: string) => void,
  ) {
    this.credits = h('span', { class: 'tb-value' });
    this.creditsDelta = h('span', { class: 'tb-delta' });
    this.clock = h('span', { class: 'tb-value' });
    this.day = h('span', { class: 'tb-label' });
    this.rep = h('span', { class: 'tb-value' });
    this.repTier = h('span', { class: 'tb-label' });
    this.stage = h('span', { class: 'tb-stage-name' });
    this.fps = h('span', { class: 'tb-fps' });

    const speeds = h('div', { class: 'speed-group', title: t('hud.speed') });
    const speedDefs: [GameSpeed, IconName | string][] = [
      [0, 'pause'],
      [1, '1×'],
      [2, '2×'],
      [4, '4×'],
    ];
    for (const [speed, label] of speedDefs) {
      const content = speed === 0 ? icon(label as IconName) : label;
      const b = button(content, () => {
        ctx.playSound('click');
        ctx.game()?.setSpeed(speed);
        this.refresh();
      }, 'speed-btn', speed === 0 ? t('hud.pause') : `${speed}×`);
      this.speedButtons.set(speed, b);
      speeds.append(b);
    }
    // Mobile shows a single cycling button instead of the full group.
    const speedCycle = button('1×', () => {
      const game = ctx.game();
      if (!game) return;
      ctx.playSound('click');
      const order: GameSpeed[] = [0, 1, 2, 4];
      game.setSpeed(order[(order.indexOf(game.speed) + 1) % order.length] as GameSpeed);
      this.refresh();
    }, 'speed-btn speed-cycle');
    this.speedButtons.set(-1 as GameSpeed, speedCycle);

    this.nav = h('nav', { class: 'tb-nav' });
    const menuBtn = button(icon('menu'), () => ctx.openMainMenu(), 'icon-btn tb-menu', t('hud.menu'));

    this.el = h(
      'header',
      { class: 'topbar panel' },
      h('div', { class: 'tb-stage' }, h('span', { class: 'tb-stage-icon' }, icon('stage')), h('div', { class: 'tb-stage-text' }, this.stage)),
      h('div', { class: 'tb-block tb-credits' }, h('span', { class: 'tb-icon credits' }, icon('credits')), h('div', { class: 'tb-col' }, this.credits, this.creditsDelta)),
      h('div', { class: 'tb-block tb-clock' }, h('span', { class: 'tb-icon' }, icon('clock')), h('div', { class: 'tb-col' }, this.clock, this.day)),
      speeds,
      speedCycle,
      h('div', { class: 'tb-block tb-rep', title: t('hud.reputation') }, h('span', { class: 'tb-icon rep' }, icon('reputation')), h('div', { class: 'tb-col' }, this.rep, this.repTier)),
      this.nav,
      this.fps,
      menuBtn,
    );
  }

  setNav(entries: NavEntry[]): void {
    this.nav.replaceChildren();
    this.navButtons.clear();
    for (const entry of entries) {
      const b = button(
        h('span', { class: 'nav-inner' }, icon(entry.icon), h('span', { class: 'nav-label', text: entry.label() })),
        () => {
          this.ctx.playSound('click');
          this.openWindow(entry.id);
        },
        'nav-btn',
        entry.label(),
      );
      b.dataset.nav = entry.id;
      this.navButtons.set(entry.id, b);
      this.nav.append(b);
    }
  }

  setActiveWindow(id: string | null): void {
    for (const [key, b] of this.navButtons) toggleClass(b, 'active', key === id);
  }

  setBadge(id: string, count: number): void {
    const b = this.navButtons.get(id);
    if (!b) return;
    let badge = b.querySelector('.badge');
    if (count <= 0) {
      badge?.remove();
      return;
    }
    if (!badge) {
      badge = h('span', { class: 'badge' });
      b.append(badge);
    }
    setText(badge, String(count));
  }

  refresh(netToday = 0): void {
    const game = this.ctx.game();
    if (!game) return;
    const s = game.state;
    setText(this.credits, formatCompact(s.resources.credits));
    toggleClass(this.credits, 'negative', s.resources.credits < 0);
    setText(this.creditsDelta, netToday === 0 ? '' : `${netToday > 0 ? '+' : ''}${formatCompact(netToday)}`);
    toggleClass(this.creditsDelta, 'neg', netToday < 0);
    const hour = s.time.hour % 24;
    const hh = Math.floor(hour).toString().padStart(2, '0');
    const mm = (Math.floor((hour % 1) * 6) * 10).toString().padStart(2, '0');
    setText(this.clock, `${hh}:${mm}`);
    setText(this.day, t('hud.day', { day: game.day }));
    setText(this.rep, Math.round(s.reputation).toString());
    setText(this.repTier, tk(`rep.tier.${reputationTier(s.reputation)}`));
    setText(this.stage, `${t('hud.stage')} ${s.stage} · ${tk(`stage.${s.stage}`)}`);
    for (const [speed, b] of this.speedButtons) {
      if ((speed as number) === -1) {
        setText(b, game.speed === 0 ? '❚❚' : `${game.speed}×`);
        toggleClass(b, 'paused', game.speed === 0);
      } else toggleClass(b, 'active', game.speed === speed);
    }
    const settings = this.ctx.settings.current;
    toggleClass(this.fps, 'hidden', !settings.showFps);
    if (settings.showFps) setText(this.fps, t('hud.fps', { fps: Math.round(this.ctx.world.fps) }));
  }
}
