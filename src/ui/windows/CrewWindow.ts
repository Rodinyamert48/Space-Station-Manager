import { CREW_ROLES, CREW_ROLE_DEFS } from '../../data/crew';
import { MODULES } from '../../data/modules';
import { SALARY_RATES } from '../../game/systems/CrewSystem';
import type { CrewMember } from '../../game/state';
import { t, tk } from '../../i18n/i18n';
import type { UIContext } from '../context';
import { confirmDialog } from '../Dialog';
import { button, h, setText } from '../dom';
import { icon } from '../icons';
import { GameWindow } from './Window';

interface RosterRow {
  id: number;
  task: HTMLElement;
  bars: [HTMLElement, HTMLElement, HTMLElement];
  need: HTMLElement;
}

/** Crew management: morale, pay, staffing gaps, recruitment and the roster. */
export class CrewWindow extends GameWindow {
  private signature = '';
  private rows: RosterRow[] = [];
  private summary: HTMLElement | null = null;

  constructor(
    private readonly ctx: UIContext,
    private readonly overlay: HTMLElement,
    private readonly onLocate: (moduleId: number) => void,
  ) {
    super('crew', 'crew.title', 'crew');
  }

  private computeSignature(): string {
    const game = this.ctx.game();
    if (!game) return '';
    const c = game.state.crew;
    return `${c.members.map((m) => m.id).join(',')}|${JSON.stringify(c.applicants)}|${c.salaryRate}|${game.crewCapacity()}|${game.crew.understaffed().map((u) => `${u.module.id}:${u.filled}`).join(',')}|${Math.floor(game.state.resources.credits / 50)}`;
  }

  rebuild(): void {
    this.body.replaceChildren();
    this.rows = [];
    const game = this.ctx.game();
    if (!game) return;
    this.signature = this.computeSignature();
    const crew = game.state.crew;

    this.summary = h('div', { class: 'crew-summary' });
    this.body.append(this.summary);

    // Pay level.
    const pay = h('div', { class: 'seg' });
    SALARY_RATES.forEach((rate, i) => {
      pay.append(
        button(`${tk(`crew.pay.${i}`)} ${Math.round(rate * 100)}%`, () => {
          this.ctx.playSound('click');
          game.crew.setSalaryRate(rate);
          this.rebuild();
        }, `seg-btn${crew.salaryRate === rate ? ' active' : ''}`),
      );
    });
    this.body.append(
      h('div', { class: 'section-title', text: t('crew.payLevel') }),
      pay,
      h('p', { class: 'muted small', text: `${t('crew.payHint')} ${t('crew.payroll', { v: game.economy.dailySalaries() })}` }),
    );

    // Staffing gaps.
    const gaps = game.crew.understaffed();
    const staffList = h('div', { class: 'staff-list' });
    if (gaps.length === 0) staffList.append(h('p', { class: 'muted small', text: t('crew.allStaffed') }));
    for (const gap of gaps) {
      const role = MODULES[gap.module.type].staff?.role ?? 'worker';
      staffList.append(
        h(
          'button',
          { class: 'staff-gap', attrs: { type: 'button' }, onClick: () => this.onLocate(gap.module.id) },
          icon('warning'),
          t('crew.staffLine', { module: `module.${gap.module.type}.name`, filled: gap.filled, required: gap.required, role: `role.${role}` }),
        ),
      );
    }
    this.body.append(h('div', { class: 'section-title', text: t('crew.staffing') }), staffList);

    // Recruitment.
    const full = crew.members.length >= game.crewCapacity();
    const recruit = h('div', { class: 'recruit-grid' });
    for (const role of CREW_ROLES) {
      const applicants = crew.applicants[role] ?? 0;
      const check = game.crew.canHire(role);
      const hireBtn = button(t('crew.hire'), () => {
        const result = game.crew.hire(role);
        if (result.ok) this.ctx.playSound('complete');
        else {
          this.ctx.playSound('error');
          game.notify('warning', `crew.hireError.${result.reason}`);
        }
        this.rebuild();
      }, 'btn small primary');
      hireBtn.disabled = !check.ok;
      recruit.append(
        h(
          'div',
          { class: `recruit-card${applicants > 0 ? '' : ' none'}`, style: { '--role-color': CREW_ROLE_DEFS[role].color } },
          h('div', { class: 'rc-head' }, h('span', { class: 'role-dot' }), h('span', { class: 'rc-name', text: tk(`role.${role}`) }), h('span', { class: 'rc-app', text: applicants > 0 ? t('crew.applicants', { v: applicants }) : t('crew.noApplicants') })),
          h('span', { class: 'muted small', text: t('crew.hireCost', { v: game.crew.hireCost(role), salary: CREW_ROLE_DEFS[role].salary }) }),
          hireBtn,
        ),
      );
    }
    this.body.append(h('div', { class: 'section-title', text: t('crew.recruit') }));
    if (full) this.body.append(h('p', { class: 'warn-text', text: t('crew.noBeds') }));
    this.body.append(recruit);

    // Roster.
    this.body.append(h('div', { class: 'section-title', text: `${t('crew.roster')} · ${crew.members.length}` }));
    const roster = h('div', { class: 'roster' });
    for (const m of crew.members) roster.append(this.rosterRow(m));
    this.body.append(roster);
    this.refresh();
  }

  private rosterRow(m: CrewMember): HTMLElement {
    const game = this.ctx.game();
    const task = h('span', { class: 'muted small' });
    const need = h('span', { class: 'need-tag' });
    const bar = (cls: string): HTMLElement => h('div', { class: `mini-bar ${cls}` }, h('div', { class: 'mini-fill' }));
    const bars: [HTMLElement, HTMLElement, HTMLElement] = [bar('happy'), bar('energy'), bar('health')];
    this.rows.push({ id: m.id, task, bars, need });
    return h(
      'div',
      { class: 'roster-row', style: { '--role-color': CREW_ROLE_DEFS[m.role].color } },
      h('div', { class: 'rr-head' }, h('span', { class: 'role-dot' }), h('span', { class: 'rr-name', text: m.name }), h('span', { class: 'rr-role', text: tk(`role.${m.role}`) }), need),
      task,
      h(
        'div',
        { class: 'rr-bars' },
        h('span', { class: 'bar-cap', title: t('crew.happiness') }, icon('happy')),
        bars[0],
        h('span', { class: 'bar-cap', title: t('crew.energy') }, icon('bolt')),
        bars[1],
        h('span', { class: 'bar-cap', title: t('crew.health') }, icon('health')),
        bars[2],
      ),
      h(
        'div',
        { class: 'rr-actions' },
        button(h('span', { class: 'btn-inner' }, icon('focus'), t('crew.locate')), () => this.onLocate(m.locationId), 'btn ghost small'),
        button(t('crew.fire'), async () => {
          if (!game) return;
          const ok = await confirmDialog(this.overlay, t('crew.confirmFire', { name: m.name }), { danger: true });
          if (ok && game.crew.fire(m.id)) this.rebuild();
        }, 'btn danger small'),
      ),
    );
  }

  override refresh(): void {
    const game = this.ctx.game();
    if (!game) return;
    if (this.computeSignature() !== this.signature) {
      this.rebuild();
      return;
    }
    if (this.summary) {
      setText(this.summary, t('crew.summary', { crew: game.state.crew.members.length, beds: game.crewCapacity(), morale: Math.round(game.crew.averageHappiness()) }));
    }
    for (const row of this.rows) {
      const m = game.crew.get(row.id);
      if (!m) continue;
      const place = game.station.getModule(m.locationId);
      setText(row.task, t(`crew.task.${m.task}`, { place: place ? `module.${place.type}.name` : '—' }));
      const values = [m.happiness, m.energy, m.health];
      row.bars.forEach((b, i) => {
        const fill = b.firstElementChild as HTMLElement;
        const v = values[i] ?? 0;
        fill.style.width = `${v}%`;
        b.classList.toggle('low', v < 30);
      });
      setText(row.need, m.need === 'none' ? '' : t(`crew.need.${m.need}`));
    }
  }
}
