import type { Game } from '../game/Game';
import type { PendingEvent } from '../game/state';
import { t, tk } from '../i18n/i18n';
import type { UIContext } from './context';
import { button, h, setText } from './dom';
import { icon } from './icons';

/** Decision dialog for random incidents. One at a time, in the overlay layer. */
export class EventDialog {
  private el: HTMLElement | null = null;
  private current: PendingEvent | null = null;
  private timer: HTMLElement | null = null;

  constructor(
    private readonly layer: HTMLElement,
    private readonly ctx: UIContext,
  ) {}

  get open(): boolean {
    return this.el !== null;
  }

  show(game: Game, event: PendingEvent): void {
    this.close();
    this.current = event;
    const id = event.eventId;
    const severity = game.events.severity(id);
    const module = game.station.getModule(event.moduleId);
    const params = {
      module: module ? `module.${module.type}.name` : '',
      amount: event.amount,
      good: event.good ? `res.${event.good}` : '',
      defense: game.defenseRating(),
    };
    const choices = h('div', { class: 'event-choices' });
    for (let i = 0; i < game.events.choiceCount(id); i++) {
      const cost = game.events.choiceCost(event, i);
      const costParts: string[] = [];
      if (cost?.credits) costParts.push(`${cost.credits} cr`);
      if (cost?.metal) costParts.push(`${cost.metal} ${t('res.metal')}`);
      if (cost?.electronics) costParts.push(`${cost.electronics} ${t('res.electronics')}`);
      const b = button(
        h('span', { class: 'choice-inner' }, h('span', { text: tk(`event.${id}.choice.${i}`) }), costParts.length ? h('span', { class: 'choice-cost', text: t('event.cost', { list: costParts.join(', ') }) }) : null),
        () => {
          const result = game.events.resolve(event.id, i);
          if (result.ok) {
            this.ctx.playSound('click');
            this.close();
          } else this.ctx.playSound('error');
        },
        'btn event-choice',
      );
      b.disabled = !game.events.canChoose(event, i);
      choices.append(b);
    }
    this.timer = h('span', { class: 'muted small' });
    this.el = h(
      'div',
      { class: `dialog panel event-dialog sev-${severity}` },
      h('div', { class: 'dialog-icon' }, icon(severity === 'success' ? 'star' : severity === 'info' ? 'info' : 'warning')),
      h('div', { class: 'event-title', text: tk(`event.${id}.title`) }),
      h('p', { class: 'dialog-text', text: tk(`event.${id}.desc`, params) }),
      choices,
      this.timer,
    );
    this.layer.append(this.el);
    requestAnimationFrame(() => this.el?.classList.add('open'));
    this.refresh(game);
  }

  refresh(game: Game): void {
    if (!this.current || !this.timer) return;
    if (!game.events.pending.some((p) => p.id === this.current?.id)) {
      this.close();
      return;
    }
    setText(this.timer, t('event.autoIn', { hours: Math.max(0, this.current.expiresAt - game.hour).toFixed(1) }));
  }

  close(): void {
    this.el?.remove();
    this.el = null;
    this.current = null;
  }
}
