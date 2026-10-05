import type { Game } from '../game/Game';
import type { Notice } from '../game/events';
import { onLanguageChange } from '../i18n/i18n';
import type { UIContext } from './context';
import { h, toggleClass } from './dom';
import { NoticeFeed } from './hud/NoticeFeed';
import { ResourcePanel } from './hud/ResourcePanel';
import { TopBar, type NavEntry } from './hud/TopBar';
import { icon } from './icons';
import type { GameWindow } from './windows/Window';

export type Layout = 'desktop' | 'mobile';

const MOBILE_BREAKPOINT = 900;
const REFRESH_INTERVAL = 0.2;

/**
 * Builds and lays out the HUD. Desktop gets a dashboard with side panels; small screens get a
 * dedicated layout with a compact top bar, a bottom navigation bar and bottom sheets.
 */
export class UIManager {
  layout: Layout = 'desktop';
  readonly topBar: TopBar;
  readonly feed: NoticeFeed;
  readonly resources: ResourcePanel;
  private readonly hud: HTMLElement;
  private readonly left: HTMLElement;
  private readonly right: HTMLElement;
  private readonly bottom: HTMLElement;
  private readonly strip: HTMLElement;
  private readonly mobileNav: HTMLElement;
  private readonly sheetLayer: HTMLElement;
  readonly overlayLayer: HTMLElement;
  readonly menuLayer: HTMLElement;
  private readonly windows = new Map<string, GameWindow>();
  private active: GameWindow | null = null;
  private refreshTimer = 0;
  private gameSubs: (() => void)[] = [];
  private navEntries: NavEntry[] = [];
  private mobileNavEntries: NavEntry[] = [];
  private leftContent: HTMLElement | null = null;
  private stripRefresh: (() => void) | null = null;
  focusNotice: ((n: Notice) => void) | null = null;

  constructor(
    readonly root: HTMLElement,
    private readonly ctx: UIContext,
  ) {
    this.topBar = new TopBar(ctx, (id) => this.toggleWindow(id));
    this.feed = new NoticeFeed((n) => this.focusNotice?.(n));
    this.resources = new ResourcePanel(ctx);
    this.left = h('aside', { class: 'hud-left' });
    this.right = h('aside', { class: 'hud-right' }, h('div', { class: 'panel res-dock' }, this.resources.el));
    this.bottom = h('div', { class: 'hud-bottom' }, this.feed.el);
    this.strip = h('div', { class: 'hud-strip' });
    this.mobileNav = h('nav', { class: 'mobile-nav' });
    this.hud = h('div', { class: 'hud hidden' }, h('div', { class: 'hud-top' }, this.topBar.el), this.strip, this.left, this.right, this.bottom, this.mobileNav);
    this.sheetLayer = h('div', { class: 'sheet-layer' });
    this.sheetLayer.addEventListener('click', (e) => {
      if (e.target === this.sheetLayer) this.closeWindow();
    });
    this.overlayLayer = h('div', { class: 'overlay-layer' });
    this.menuLayer = h('div', { class: 'menu-layer' });
    root.append(this.hud, this.sheetLayer, this.overlayLayer, this.menuLayer);

    this.updateLayout();
    window.addEventListener('resize', () => this.updateLayout());
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.active) {
        this.closeWindow();
        e.stopPropagation();
      }
    });
    onLanguageChange(() => this.relabel());
  }

  private updateLayout(): void {
    const mobile = window.innerWidth < MOBILE_BREAKPOINT || (window.innerHeight < 520 && matchMedia('(pointer: coarse)').matches);
    const layout: Layout = mobile ? 'mobile' : 'desktop';
    const changed = layout !== this.layout;
    this.layout = layout;
    this.root.dataset.layout = layout;
    if (changed && this.active) {
      const id = this.active.id;
      this.closeWindow(true);
      this.openWindow(id);
    }
    this.mountLeft();
  }

  /** Content shown in the desktop left sidebar (the build panel). On mobile it lives in a sheet. */
  setLeftContent(el: HTMLElement | null): void {
    this.leftContent = el;
    this.mountLeft();
  }

  private mountLeft(): void {
    this.left.replaceChildren();
    if (this.leftContent && this.layout === 'desktop') this.left.append(this.leftContent);
  }

  setNav(desktop: NavEntry[], mobile: NavEntry[]): void {
    this.navEntries = desktop;
    this.mobileNavEntries = mobile;
    this.topBar.setNav(desktop);
    this.renderMobileNav();
  }

  /** Compact resource chips shown under the mobile top bar. */
  setStrip(el: HTMLElement, refresh: () => void): void {
    this.strip.replaceChildren(el);
    this.stripRefresh = refresh;
  }

  private renderMobileNav(): void {
    this.mobileNav.replaceChildren();
    for (const entry of this.mobileNavEntries) {
      const b = h('button', { class: 'mnav-btn', attrs: { type: 'button' }, dataset: { nav: entry.id } }, icon(entry.icon), h('span', { text: entry.label() }));
      b.addEventListener('click', () => {
        this.ctx.playSound('click');
        this.toggleWindow(entry.id);
      });
      this.mobileNav.append(b);
    }
  }

  registerWindow(win: GameWindow): void {
    this.windows.set(win.id, win);
    win.onRequestClose = () => this.closeWindow();
  }

  getWindow<T extends GameWindow>(id: string): T | undefined {
    return this.windows.get(id) as T | undefined;
  }

  get activeWindowId(): string | null {
    return this.active?.id ?? null;
  }

  toggleWindow(id: string): void {
    if (this.active?.id === id) this.closeWindow();
    else this.openWindow(id);
  }

  openWindow(id: string): void {
    const win = this.windows.get(id);
    if (!win) return;
    if (this.active && this.active !== win) this.closeWindow(true);
    this.active = win;
    win.open();
    const docked = this.layout === 'desktop' && win.size === 'normal';
    if (docked) this.right.append(win.el);
    else this.sheetLayer.append(win.el);
    toggleClass(this.right, 'has-window', docked);
    toggleClass(this.sheetLayer, 'open', !docked);
    toggleClass(this.sheetLayer, 'wide', win.size === 'wide' && this.layout === 'desktop');
    requestAnimationFrame(() => win.el.classList.add('open'));
    this.topBar.setActiveWindow(id);
    for (const b of this.mobileNav.querySelectorAll<HTMLElement>('.mnav-btn')) toggleClass(b, 'active', b.dataset.nav === id);
  }

  closeWindow(immediate = false): void {
    const win = this.active;
    if (!win) return;
    this.active = null;
    win.close();
    win.el.classList.remove('open');
    const finish = (): void => {
      if (!win.isOpen) win.el.remove();
    };
    if (immediate) finish();
    else window.setTimeout(finish, 220);
    toggleClass(this.right, 'has-window', false);
    toggleClass(this.sheetLayer, 'open', false);
    this.topBar.setActiveWindow(null);
    for (const b of this.mobileNav.querySelectorAll<HTMLElement>('.mnav-btn')) toggleClass(b, 'active', false);
  }

  showHud(visible: boolean): void {
    toggleClass(this.hud, 'hidden', !visible);
    if (!visible) this.closeWindow(true);
  }

  bindGame(game: Game | null): void {
    for (const fn of this.gameSubs.splice(0)) fn();
    this.feed.clear();
    this.closeWindow(true);
    if (!game) return;
    this.gameSubs.push(game.bus.on('notice', (n) => this.feed.push(n)));
    this.refreshAll();
  }

  /** Subscribes to a game event for the lifetime of the current game binding. */
  track(unsubscribe: () => void): void {
    this.gameSubs.push(unsubscribe);
  }

  refreshAll(): void {
    this.topBar.refresh();
    this.resources.refresh();
    this.stripRefresh?.();
    this.active?.refresh();
  }

  update(dt: number, netToday = 0): void {
    this.refreshTimer += dt;
    if (this.refreshTimer < REFRESH_INTERVAL) return;
    this.refreshTimer = 0;
    this.topBar.refresh(netToday);
    if (this.layout === 'desktop') this.resources.refresh();
    this.stripRefresh?.();
    this.active?.refresh();
  }

  private relabel(): void {
    this.topBar.setNav(this.navEntries);
    this.renderMobileNav();
    this.resources.rebuild();
    for (const win of this.windows.values()) win.relabel();
  }
}
