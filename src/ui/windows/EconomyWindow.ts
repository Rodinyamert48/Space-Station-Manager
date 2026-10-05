import { formatCompact } from '../../core/math';
import { BANKRUPTCY_DAYS } from '../../game/systems/EconomySystem';
import type { ExpenseCategory, IncomeCategory, Ledger } from '../../game/state';
import { t, tk } from '../../i18n/i18n';
import type { UIContext } from '../context';
import { h } from '../dom';
import { barChart } from '../widgets';
import { GameWindow } from './Window';

const INCOME: IncomeCategory[] = ['trade', 'docking', 'passengers', 'services', 'missions', 'other'];
const EXPENSES: ExpenseCategory[] = ['salaries', 'upkeep', 'energy', 'construction', 'trade', 'research', 'shipServices', 'hiring', 'events'];

/** Finances: today's ledger, projected daily bills and recent history. */
export class EconomyWindow extends GameWindow {
  private lastKey = '';

  constructor(private readonly ctx: UIContext) {
    super('economy', 'eco.title', 'credits');
  }

  private ledgerTable(ledger: Ledger): HTMLElement {
    const rows: HTMLElement[] = [];
    let income = 0;
    let expense = 0;
    for (const c of INCOME) {
      const v = ledger.income[c] ?? 0;
      if (!v) continue;
      income += v;
      rows.push(h('div', { class: 'ledger-row pos' }, h('span', { text: tk(`eco.cat.${c}`) }), h('span', { class: 'num', text: `+${formatCompact(v)}` })));
    }
    for (const c of EXPENSES) {
      const v = ledger.expenses[c] ?? 0;
      if (!v) continue;
      expense += v;
      rows.push(h('div', { class: 'ledger-row neg' }, h('span', { text: tk(`eco.cat.${c}`) }), h('span', { class: 'num', text: `-${formatCompact(v)}` })));
    }
    const net = income - expense;
    return h(
      'div',
      { class: 'ledger' },
      h('div', { class: 'ledger-sum' }, h('div', null, h('span', { class: 'muted small', text: t('eco.income') }), h('b', { class: 'pos', text: `+${formatCompact(income)}` })), h('div', null, h('span', { class: 'muted small', text: t('eco.expenses') }), h('b', { class: 'neg', text: `-${formatCompact(expense)}` })), h('div', null, h('span', { class: 'muted small', text: t('eco.net') }), h('b', { class: net >= 0 ? 'pos' : 'neg', text: `${net >= 0 ? '+' : ''}${formatCompact(net)}` }))),
      ...rows,
    );
  }

  rebuild(): void {
    this.body.replaceChildren();
    const game = this.ctx.game();
    if (!game) return;
    const eco = game.state.economy;
    if (eco.debtDays > 0 || game.state.resources.credits < 0) {
      this.body.append(h('p', { class: 'warn-text', text: t('eco.debt', { days: eco.debtDays, max: BANKRUPTCY_DAYS }) }));
    }
    this.body.append(h('div', { class: 'section-title', text: t('eco.today') }), this.ledgerTable(eco.today));
    const salaries = game.economy.dailySalaries();
    const upkeep = game.economy.dailyUpkeep();
    const energy = game.economy.dailyEnergyEstimate();
    this.body.append(
      h('div', { class: 'section-title', text: t('eco.dailyBills') }),
      h(
        'div',
        { class: 'ledger' },
        h('div', { class: 'ledger-row neg' }, h('span', { text: t('eco.salaries') }), h('span', { class: 'num', text: `-${formatCompact(salaries)}` })),
        h('div', { class: 'ledger-row neg' }, h('span', { text: t('eco.upkeep') }), h('span', { class: 'num', text: `-${formatCompact(upkeep)}` })),
        h('div', { class: 'ledger-row neg' }, h('span', { text: t('eco.energy') }), h('span', { class: 'num', text: `≈ -${formatCompact(energy)}` })),
      ),
    );
    const history = eco.history.slice(-10);
    if (history.length) {
      this.body.append(
        h('div', { class: 'section-title', text: t('eco.history') }),
        barChart(history.map((d) => ({ label: String(d.day), value: d.net }))),
      );
    }
    this.lastKey = this.key();
  }

  private key(): string {
    const game = this.ctx.game();
    if (!game) return '';
    const e = game.state.economy;
    return `${Math.round(game.economy.netToday())}|${e.history.length}|${e.debtDays}`;
  }

  override refresh(): void {
    if (this.key() !== this.lastKey) this.rebuild();
  }
}
