import { BUILD_CATEGORIES, BUILDABLE_MODULES, MODULES, type ModuleType } from '../../data/modules';
import { t, tk } from '../../i18n/i18n';
import type { UIContext } from '../context';
import { h, toggleClass } from '../dom';
import { costChips, moduleFeatures, moduleFlowChips } from '../format';
import { icon } from '../icons';

/** Module catalogue. Desktop: left sidebar. Mobile: shown inside the build sheet. */
export class BuildPanel {
  readonly el: HTMLElement;
  private readonly list: HTMLElement;
  private cards = new Map<ModuleType, HTMLElement>();
  private signature = '';

  constructor(
    private readonly ctx: UIContext,
    private readonly onSelect: (type: ModuleType) => void,
  ) {
    this.list = h('div', { class: 'build-list scroll' });
    this.el = h('div', { class: 'build-panel' }, this.list);
    this.rebuild();
  }

  rebuild(): void {
    this.list.replaceChildren(h('p', { class: 'build-hint', text: t('build.hint') }));
    this.cards.clear();
    const game = this.ctx.game();
    for (const cat of BUILD_CATEGORIES) {
      const types = BUILDABLE_MODULES.filter((m) => MODULES[m].category === cat);
      if (types.length === 0) continue;
      this.list.append(h('div', { class: 'build-cat', text: tk(`cat.${cat}`) }));
      for (const type of types) {
        const def = MODULES[type];
        const unlocked = game ? game.isModuleUnlocked(type) : true;
        const flows = moduleFlowChips(type);
        const features = moduleFeatures(type).slice(0, 2);
        const card = h(
          'button',
          { class: `build-card${unlocked ? '' : ' locked'}`, attrs: { type: 'button' }, dataset: { module: type }, style: { '--accent': def.accent } },
          h(
            'div',
            { class: 'bc-head' },
            h('span', { class: 'bc-name', text: tk(`module.${type}.name`) }),
            h('span', { class: 'bc-time' }, icon('clock'), t('build.hours', { hours: def.buildHours })),
          ),
          unlocked
            ? costChips(def.cost, game)
            : h('div', { class: 'bc-locked' }, icon('locked'), t('build.locked', { tech: tk(`tech.${def.unlockedBy ?? 'basicPower'}.name`) })),
          h('div', { class: 'bc-flows' }, ...flows.produces, ...flows.consumes),
          features.length ? h('div', { class: 'bc-features', text: features.join(' · ') }) : null,
        );
        card.title = tk(`module.${type}.desc`);
        card.addEventListener('click', () => {
          if (!unlocked) {
            this.ctx.playSound('error');
            return;
          }
          this.ctx.playSound('click');
          this.onSelect(type);
        });
        this.cards.set(type, card);
        this.list.append(card);
      }
    }
    this.signature = this.computeSignature();
  }

  /** Cheap key describing what affects card rendering (affordability, unlocks). */
  private computeSignature(): string {
    const game = this.ctx.game();
    if (!game) return '';
    return BUILDABLE_MODULES.map((type) => `${game.isModuleUnlocked(type) ? 1 : 0}${game.resources.canAfford(MODULES[type].cost) ? 1 : 0}`).join('');
  }

  setSelected(type: ModuleType | null): void {
    for (const [key, card] of this.cards) toggleClass(card, 'selected', key === type);
  }

  refresh(): void {
    if (this.computeSignature() !== this.signature) {
      const selected = [...this.cards.entries()].find(([, c]) => c.classList.contains('selected'))?.[0] ?? null;
      this.rebuild();
      this.setSelected(selected);
    }
  }
}
