import { t } from '../../i18n/i18n';
import type { SaveMeta } from '../../save/SaveManager';
import type { SettingsStore } from '../../settings/Settings';
import { button, h } from '../dom';
import { icon } from '../icons';
import { SettingsPanel } from './SettingsPanel';

export interface MenuActions {
  continueGame: () => void;
  newGame: () => void;
  resume: () => void;
  save: () => void;
  toMainMenu: () => void;
  loadLast: () => void;
  click: () => void;
}


/** Title screen, pause menu, settings, credits and game-over screens. */
export class Menus {
  private screen: HTMLElement | null = null;

  constructor(
    private readonly layer: HTMLElement,
    private readonly settings: SettingsStore,
    private readonly actions: MenuActions,
  ) {}

  get visible(): boolean {
    return this.screen !== null;
  }

  hide(): void {
    this.screen?.remove();
    this.screen = null;
    this.layer.classList.remove('active');
  }

  private mount(el: HTMLElement): void {
    this.hide();
    this.screen = el;
    this.layer.append(el);
    this.layer.classList.add('active');
    requestAnimationFrame(() => el.classList.add('open'));
  }

  private menuButton(label: string, onClick: () => void, cls = ''): HTMLButtonElement {
    return button(label, () => {
      this.actions.click();
      onClick();
    }, `menu-btn ${cls}`);
  }

  showMain(save: SaveMeta | null, storageWarning: boolean): void {
    const buttons = h('div', { class: 'menu-buttons' });
    if (save) {
      const cont = this.menuButton(t('menu.continue'), this.actions.continueGame, 'primary');
      cont.append(h('span', { class: 'menu-sub', text: t('menu.lastSave', { day: save.day, stage: save.stage, credits: Math.round(save.credits) }) }));
      buttons.append(cont);
    }
    buttons.append(
      this.menuButton(t('menu.newGame'), this.actions.newGame, save ? '' : 'primary'),
      this.menuButton(t('menu.settings'), () => this.showSettings(() => this.showMain(save, storageWarning))),
      this.menuButton(t('menu.credits'), () => this.showCredits(() => this.showMain(save, storageWarning))),
    );
    this.mount(
      h(
        'div',
        { class: 'menu-screen main-menu' },
        h('div', { class: 'menu-brand' }, h('div', { class: 'menu-logo' }, icon('stage')), h('h1', { class: 'menu-title', text: t('app.title') }), h('p', { class: 'menu-tagline', text: t('menu.tagline') })),
        buttons,
        storageWarning ? h('p', { class: 'warn-text menu-warning', text: t('menu.storageWarning') }) : null,
        h('div', { class: 'menu-footer', text: t('menu.version', { v: __APP_VERSION__ }) }),
      ),
    );
  }

  showPause(): void {
    this.mount(
      h(
        'div',
        { class: 'menu-screen pause-menu' },
        h('div', { class: 'menu-card panel' }, h('h2', { class: 'menu-heading', text: t('menu.paused') }), h(
          'div',
          { class: 'menu-buttons' },
          this.menuButton(t('menu.resume'), this.actions.resume, 'primary'),
          this.menuButton(t('menu.save'), this.actions.save),
          this.menuButton(t('menu.settings'), () => this.showSettings(() => this.showPause())),
          this.menuButton(t('menu.mainMenu'), this.actions.toMainMenu),
        )),
      ),
    );
  }

  showSettings(back: () => void): void {
    const panel = new SettingsPanel(this.settings, this.actions.click);
    this.mount(
      h(
        'div',
        { class: 'menu-screen settings-screen' },
        h(
          'div',
          { class: 'menu-card panel wide' },
          h('div', { class: 'menu-card-head' }, h('h2', { class: 'menu-heading', text: t('settings.title') }), button(icon('close'), () => {
            this.actions.click();
            back();
          }, 'icon-btn')),
          h('div', { class: 'menu-card-body scroll' }, panel.el),
        ),
      ),
    );
  }

  showCredits(back: () => void): void {
    this.mount(
      h(
        'div',
        { class: 'menu-screen' },
        h(
          'div',
          { class: 'menu-card panel' },
          h('h2', { class: 'menu-heading', text: t('credits.title') }),
          ...(['credits.body1', 'credits.body2', 'credits.body3', 'credits.body4', 'credits.body5'] as const).map((k) => h('p', { class: 'credits-line', text: t(k) })),
          this.menuButton(t('menu.back'), back),
        ),
      ),
    );
  }

  showGameOver(days: number, hasSave: boolean): void {
    this.mount(
      h(
        'div',
        { class: 'menu-screen' },
        h(
          'div',
          { class: 'menu-card panel gameover' },
          h('div', { class: 'dialog-icon danger' }, icon('warning')),
          h('h2', { class: 'menu-heading', text: t('gameover.title') }),
          h('p', { class: 'credits-line', text: t('gameover.body', { days }) }),
          h(
            'div',
            { class: 'menu-buttons' },
            hasSave ? this.menuButton(t('gameover.load'), this.actions.loadLast, 'primary') : null,
            this.menuButton(t('gameover.new'), this.actions.newGame),
            this.menuButton(t('menu.mainMenu'), this.actions.toMainMenu),
          ),
        ),
      ),
    );
  }
}
