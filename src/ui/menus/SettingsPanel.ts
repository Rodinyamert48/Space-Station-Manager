import { t, tk } from '../../i18n/i18n';
import type { FpsLimit, ParticleLevel, QualityLevel, SettingsStore } from '../../settings/Settings';
import { button, h } from '../dom';
import { slider, toggle } from '../widgets';

function segmented<T extends string | number>(options: readonly T[], current: T, label: (v: T) => string, onPick: (v: T) => void): HTMLElement {
  const wrap = h('div', { class: 'seg' });
  for (const option of options) {
    wrap.append(button(label(option), () => onPick(option), `seg-btn${option === current ? ' active' : ''}`));
  }
  return wrap;
}

/** All settings controls; changes apply immediately through the settings store. */
export class SettingsPanel {
  readonly el: HTMLElement;

  constructor(
    private readonly store: SettingsStore,
    private readonly onClick: () => void,
  ) {
    this.el = h('div', { class: 'settings-panel' });
    this.render();
  }

  render(): void {
    const s = this.store.current;
    const set = (patch: Parameters<SettingsStore['update']>[0]): void => {
      this.onClick();
      this.store.update(patch);
      this.render();
    };
    const row = (label: string, control: HTMLElement): HTMLElement => h('div', { class: 'set-row' }, h('span', { class: 'set-label', text: label }), control);
    const pct = (v: number): string => `${Math.round(v * 100)}%`;
    this.el.replaceChildren(
      h('div', { class: 'section-title', text: t('settings.graphics') }),
      row(
        t('settings.quality'),
        segmented<QualityLevel>(['low', 'medium', 'high', 'ultra'], s.quality, (v) => tk(`settings.quality.${v}`), (v) => {
          this.onClick();
          this.store.applyPreset(v);
          this.render();
        }),
      ),
      h('p', { class: 'muted small', text: t('settings.qualityNote') }),
      button(t('settings.reload'), () => window.location.reload(), 'btn ghost small'),
      row(t('settings.resolution'), slider({ min: 0.5, max: 1, step: 0.05, value: s.resolutionScale, onInput: (v) => this.store.update({ resolutionScale: v }), label: pct })),
      toggle(t('settings.shadows'), s.shadows, (v) => set({ shadows: v })),
      toggle(t('settings.bloom'), s.bloom, (v) => set({ bloom: v })),
      row(t('settings.particles'), segmented<ParticleLevel>(['off', 'low', 'high'], s.particles, (v) => tk(`settings.particles.${v}`), (v) => set({ particles: v }))),
      row(t('settings.fps'), segmented<FpsLimit>([30, 60, 0], s.fpsLimit, (v) => (v === 0 ? t('settings.fps.unlimited') : String(v)), (v) => set({ fpsLimit: v }))),
      h('div', { class: 'section-title', text: t('settings.audio') }),
      row(t('settings.master'), slider({ min: 0, max: 1, step: 0.05, value: s.masterVolume, onInput: (v) => this.store.update({ masterVolume: v }), label: pct })),
      row(t('settings.music'), slider({ min: 0, max: 1, step: 0.05, value: s.musicVolume, onInput: (v) => this.store.update({ musicVolume: v }), label: pct })),
      row(t('settings.sfx'), slider({ min: 0, max: 1, step: 0.05, value: s.sfxVolume, onInput: (v) => this.store.update({ sfxVolume: v }), label: pct })),
      h('div', { class: 'section-title', text: t('settings.controls') }),
      row(t('settings.sensitivity'), slider({ min: 0.4, max: 2.5, step: 0.1, value: s.cameraSensitivity, onInput: (v) => this.store.update({ cameraSensitivity: v }), label: (v) => `×${v.toFixed(1)}` })),
      row(t('settings.language'), segmented(['en', 'tr'] as const, s.language, (v) => (v === 'en' ? 'English' : 'Türkçe'), (v) => set({ language: v }))),
      toggle(t('settings.autoPause'), s.autoPauseEvents, (v) => set({ autoPauseEvents: v })),
      toggle(t('settings.showFps'), s.showFps, (v) => set({ showFps: v })),
      h('p', { class: 'muted small', text: t('settings.keys') }),
    );
  }
}
