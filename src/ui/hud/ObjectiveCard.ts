import type { ModuleType } from '../../data/modules';
import type { TutorialStepDef } from '../../data/tutorial';
import type { Game } from '../../game/Game';
import { t, tk } from '../../i18n/i18n';
import type { UIContext } from '../context';
import { confirmDialog } from '../Dialog';
import { button, h, setText, toggleClass } from '../dom';
import { icon } from '../icons';

export interface ObjectiveActions {
  build(type: ModuleType): void;
  open(id: 'ships' | 'research'): void;
}

const TARGET_CLASS = 'tut-target';

/**
 * The tutorial's current objective: what to do, why, and a shortcut that starts it. Also
 * highlights the build card or navigation button that leads to the objective.
 */
export class ObjectiveCard {
  readonly el: HTMLElement;
  private readonly label: HTMLElement;
  private readonly title: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly dots: HTMLElement;
  private readonly actionText: HTMLElement;
  private readonly actionBtn: HTMLButtonElement;
  private step: TutorialStepDef | null = null;
  private rendered: number | null = null;

  constructor(
    private readonly ctx: UIContext,
    private readonly root: HTMLElement,
    private readonly overlay: HTMLElement,
    private readonly actions: ObjectiveActions,
  ) {
    this.label = h('span', { class: 'obj-label' });
    this.title = h('div', { class: 'obj-title' });
    this.hint = h('div', { class: 'obj-hint' });
    this.dots = h('div', { class: 'obj-dots' });
    this.actionText = h('span', { class: 'btn-text' });
    this.actionBtn = button(h('span', { class: 'btn-inner' }, this.actionText), () => this.runAction(), 'btn small primary');
    const skip = button(icon('close'), () => void this.skip(), 'icon-btn small-icon obj-skip', t('tutorial.skip'));
    this.el = h(
      'div',
      { class: 'objective panel hidden' },
      h('div', { class: 'obj-head' }, h('span', { class: 'obj-icon' }, icon('missions')), this.label, skip),
      this.title,
      this.hint,
      h('div', { class: 'obj-foot' }, this.dots, this.actionBtn),
    );
  }

  /** Cheap to call often: re-renders only when the step changes. */
  refresh(): void {
    const game = this.ctx.game();
    const step = game?.tutorial.current ?? null;
    const index = game && step ? game.tutorial.stepIndex : null;
    if (index !== this.rendered) {
      const advanced = this.rendered !== null && index !== null;
      this.rendered = index;
      this.step = step;
      toggleClass(this.el, 'hidden', !step);
      if (game && step) this.render(game, step);
      if (advanced) {
        this.el.classList.remove('advance');
        void this.el.offsetWidth; // restart the CSS animation
        this.el.classList.add('advance');
      }
    }
    this.highlight();
  }

  relabel(): void {
    this.rendered = null;
    this.refresh();
  }

  private render(game: Game, step: TutorialStepDef): void {
    const index = game.tutorial.stepIndex;
    const total = game.tutorial.total;
    setText(this.label, `${t('tutorial.label')} · ${index + 1}/${total}`);
    setText(this.title, tk(`tutorial.${step.id}.title`));
    setText(this.hint, tk(`tutorial.${step.id}.hint`));
    this.dots.replaceChildren(...Array.from({ length: total }, (_, i) => h('span', { class: `obj-dot${i < index ? ' done' : i === index ? ' current' : ''}` })));
    setText(this.actionText, step.module ? t('tutorial.build') : t('tutorial.go'));
  }

  private highlight(): void {
    const step = this.step;
    const selectors: string[] = [];
    if (step?.module) selectors.push(`.build-card[data-module="${step.module}"]`, '[data-nav="build"]');
    if (step?.window) selectors.push(`[data-nav="${step.window}"]`);
    if (step?.tech) selectors.push(`.tech-node[data-tech="${step.tech}"]`);
    const targets = new Set(selectors.length ? this.root.querySelectorAll(selectors.join(',')) : []);
    for (const el of this.root.querySelectorAll(`.${TARGET_CLASS}`)) if (!targets.has(el)) el.classList.remove(TARGET_CLASS);
    for (const el of targets) el.classList.add(TARGET_CLASS);
  }

  private runAction(): void {
    const step = this.step;
    if (!step) return;
    this.ctx.playSound('click');
    if (step.module) this.actions.build(step.module);
    else if (step.window) this.actions.open(step.window);
  }

  private async skip(): Promise<void> {
    this.ctx.playSound('click');
    if (!(await confirmDialog(this.overlay, t('tutorial.skipConfirm')))) return;
    this.ctx.game()?.tutorial.skip();
    this.refresh();
  }
}
