import { TECHS } from '../../data/research';
import { TUTORIAL_REWARD, TUTORIAL_STEPS, type TutorialStepDef, type TutorialStepId } from '../../data/tutorial';
import type { Game } from '../Game';

/**
 * First-session walkthrough. Steps complete from the game state itself (not from UI clicks), so
 * the tutorial survives save/load and never blocks the player from doing things in another order.
 */
export class TutorialSystem {
  constructor(private readonly game: Game) {
    const bus = game.bus;
    const check = (): void => this.check();
    bus.on('moduleAdded', check);
    bus.on('shipChanged', check);
    bus.on('traded', check);
    bus.on('researchCompleted', check);
  }

  get active(): boolean {
    return !this.game.state.tutorial.done;
  }

  /** The current objective, or null once the walkthrough is finished or skipped. */
  get current(): TutorialStepDef | null {
    const t = this.game.state.tutorial;
    return t.done ? null : (TUTORIAL_STEPS[t.step] ?? null);
  }

  get stepIndex(): number {
    return this.game.state.tutorial.step;
  }

  get total(): number {
    return TUTORIAL_STEPS.length;
  }

  isMet(id: TutorialStepId): boolean {
    const s = this.game.state;
    switch (id) {
      case 'power':
      case 'lifeSupport':
      case 'quarters':
        return s.station.modules.some((m) => m.type === id);
      case 'dock':
        return s.stats.shipsDocked > 0;
      case 'trade':
        return s.stats.tradeVolume > 0;
      case 'research':
        return s.research.completed.length > 0;
      case 'unlock':
        return s.research.completed.some((tech) => (TECHS[tech].unlocksModules?.length ?? 0) > 0);
    }
  }

  /** Advances past every objective that is already met. */
  check(): void {
    const t = this.game.state.tutorial;
    if (t.done) return;
    let advanced = false;
    while (!t.done) {
      const step = TUTORIAL_STEPS[t.step];
      if (step && !this.isMet(step.id)) break;
      t.step++;
      advanced = true;
      if (t.step >= TUTORIAL_STEPS.length) this.finish(true);
    }
    if (!advanced) return;
    this.game.bus.emit('tutorialChanged', { step: t.step, done: t.done });
    if (!t.done) this.announce();
  }

  /** Posts the current objective to the notification feed. */
  announce(): void {
    const step = this.current;
    if (step) this.game.notify('info', 'notice.tutorialObjective', { objective: `tutorial.${step.id}.title` });
  }

  skip(): void {
    if (this.game.state.tutorial.done) return;
    this.finish(false);
    this.game.bus.emit('tutorialChanged', { step: this.game.state.tutorial.step, done: true });
  }

  private finish(rewarded: boolean): void {
    const t = this.game.state.tutorial;
    t.done = true;
    t.step = Math.min(t.step, TUTORIAL_STEPS.length);
    if (!rewarded) return;
    this.game.economy.earn(TUTORIAL_REWARD, 'other');
    this.game.notify('success', 'notice.tutorialDone', { credits: TUTORIAL_REWARD });
  }
}
