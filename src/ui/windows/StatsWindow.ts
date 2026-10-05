import { formatCompact } from '../../core/math';
import { STAGES } from '../../data/stages';
import { t, tk } from '../../i18n/i18n';
import type { UIContext } from '../context';
import { h } from '../dom';
import { icon } from '../icons';
import { progress } from '../widgets';
import { GameWindow } from './Window';

/** Station overview: stage progression and lifetime statistics. */
export class StatsWindow extends GameWindow {
  private lastKey = '';

  constructor(private readonly ctx: UIContext) {
    super('stats', 'stats.title', 'stats');
  }

  private key(): string {
    const game = this.ctx.game();
    if (!game) return '';
    return JSON.stringify([game.state.stage, game.progression.requirements().map((r) => r.current), game.state.stats, Math.floor(game.state.reputation)]);
  }

  rebuild(): void {
    this.body.replaceChildren();
    const game = this.ctx.game();
    if (!game) return;
    this.lastKey = this.key();
    const s = game.state;
    const stage = STAGES[s.stage - 1];
    const stages = h('div', { class: 'stage-track' });
    for (const st of STAGES) {
      stages.append(h('div', { class: `stage-step${st.id < s.stage ? ' done' : st.id === s.stage ? ' current' : ''}`, title: tk(`stage.${st.id}`) }, h('span', { text: String(st.id) })));
    }
    this.body.append(
      h('div', { class: 'section-title', text: t('stats.progress') }),
      h('div', { class: 'stage-current' }, icon('stage'), h('span', { text: `${t('hud.stage')} ${s.stage} · ${tk(`stage.${s.stage}`)}` })),
      stages,
      h('p', { class: 'muted small', text: t('stats.perimeter', { r: stage?.buildRadius ?? 3, h: (stage?.buildHeight ?? 0) * 2 + 1 }) }),
    );
    const next = game.progression.next();
    if (next) {
      const reqs = game.progression.requirements(next);
      const list = h('div', { class: 'req-list' });
      for (const r of reqs) {
        const label = r.key === 'requiresModule' ? t('stats.req.requiresModule', { module: `module.${r.module ?? 'lab'}.name` }) : tk(`stats.req.${r.key}`);
        const value = r.key === 'requiresModule' ? (r.met ? '✓' : '—') : `${formatCompact(r.current)}/${formatCompact(r.target)}`;
        list.append(h('div', { class: `req-row${r.met ? ' met' : ''}` }, h('div', { class: 'req-head' }, h('span', { text: label }), h('b', { class: 'num', text: value })), progress(r.target ? r.current / r.target : 0)));
      }
      this.body.append(h('div', { class: 'section-title', text: t('stats.next', { stage: `stage.${next.id}` }) }), list);
    } else this.body.append(h('p', { class: 'success-text', text: t('stats.maxStage') }));

    const st = s.stats;
    const rows: [string, string][] = [
      [t('stats.days'), String(game.day)],
      [t('stats.reputation'), `${Math.round(s.reputation)}`],
      [t('stats.creditsEarned'), formatCompact(st.creditsEarned)],
      [t('stats.creditsSpent'), formatCompact(st.creditsSpent)],
      [t('stats.tradeVolume'), formatCompact(st.tradeVolume)],
      [t('stats.cargoMoved'), formatCompact(st.cargoMoved)],
      [t('stats.shipsDocked'), String(st.shipsDocked)],
      [t('stats.passengers'), String(st.passengersServed)],
      [t('stats.modulesBuilt'), String(st.modulesBuilt)],
      [t('stats.crew'), `${s.crew.members.length} (${st.peakCrew})`],
      [t('stats.research'), String(st.researchCompleted)],
      [t('stats.missions'), String(st.missionsCompleted)],
      [t('stats.events'), String(st.eventsResolved)],
      [t('stats.stationValue'), formatCompact(game.progression.stationValue())],
      [t('stats.defense'), String(game.defenseRating())],
    ];
    this.body.append(
      h('div', { class: 'section-title', text: t('stats.statistics') }),
      h('div', { class: 'stat-grid' }, ...rows.map(([k, v]) => h('div', { class: 'stat-cell' }, h('span', { class: 'muted small', text: k }), h('b', { class: 'num', text: v })))),
    );
  }

  override refresh(): void {
    if (this.key() !== this.lastKey) this.rebuild();
  }
}
