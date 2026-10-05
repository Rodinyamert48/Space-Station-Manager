import { CREW_ROLE_DEFS } from '../../data/crew';
import { MODULES } from '../../data/modules';
import type { Game } from '../Game';
import type { DayReport, ExpenseCategory, IncomeCategory } from '../state';

/** Credits charged per unit of energy consumed (grid maintenance). */
export const ENERGY_COST = 0.04;
/** Consecutive day-ends in debt that end the campaign. */
export const BANKRUPTCY_DAYS = 3;
const HISTORY_DAYS = 30;

/**
 * Credits ledger and daily bills. All income and spending is categorised here so the daily
 * report and the statistics stay consistent.
 */
export class EconomySystem {
  constructor(private readonly game: Game) {}

  earn(amount: number, category: IncomeCategory): void {
    if (amount <= 0) return;
    const s = this.game.state;
    this.game.resources.adjustCredits(amount);
    s.economy.today.income[category] = (s.economy.today.income[category] ?? 0) + amount;
    s.stats.creditsEarned += amount;
  }

  /** Spends credits if available. Returns false (and spends nothing) when short. */
  spend(amount: number, category: ExpenseCategory): boolean {
    if (amount <= 0) return true;
    if (this.game.state.resources.credits < amount) return false;
    this.charge(amount, category);
    return true;
  }

  /** Mandatory payments (salaries, upkeep) that can push the station into debt. */
  charge(amount: number, category: ExpenseCategory): void {
    if (amount <= 0) return;
    const s = this.game.state;
    this.game.resources.adjustCredits(-amount);
    s.economy.today.expenses[category] = (s.economy.today.expenses[category] ?? 0) + amount;
    s.stats.creditsSpent += amount;
  }

  /** Reverses part of a previous expense (refunds), keeping the ledger honest. */
  refund(amount: number, category: ExpenseCategory): void {
    if (amount <= 0) return;
    const s = this.game.state;
    this.game.resources.adjustCredits(amount);
    s.economy.today.expenses[category] = (s.economy.today.expenses[category] ?? 0) - amount;
    s.stats.creditsSpent -= amount;
  }

  recordEnergyUse(amount: number): void {
    this.game.state.economy.energyConsumedToday += amount;
  }

  netToday(): number {
    const { income, expenses } = this.game.state.economy.today;
    let net = 0;
    for (const v of Object.values(income)) net += v ?? 0;
    for (const v of Object.values(expenses)) net -= v ?? 0;
    return net;
  }

  /** Daily salary bill at the current pay rate. */
  dailySalaries(): number {
    const crew = this.game.state.crew;
    let total = 0;
    for (const m of crew.members) total += CREW_ROLE_DEFS[m.role].salary;
    return Math.round(total * crew.salaryRate);
  }

  /** Daily module maintenance (powered-down modules cost half). */
  dailyUpkeep(): number {
    let total = 0;
    for (const m of this.game.station.modules) {
      if (m.status !== 'active') continue;
      total += MODULES[m.type].upkeep * (m.enabled ? 1 : 0.5);
    }
    return Math.round(total);
  }

  /** Projected energy bill for a full day at the current demand. */
  dailyEnergyEstimate(): number {
    return Math.round(this.game.resources.flows.consumption.energy * 24 * ENERGY_COST);
  }

  /** Charges the daily bills, closes the books and checks for bankruptcy. */
  endDay(day: number): DayReport {
    const g = this.game;
    const eco = g.state.economy;
    this.charge(this.dailySalaries(), 'salaries');
    this.charge(this.dailyUpkeep(), 'upkeep');
    this.charge(Math.round(eco.energyConsumedToday * ENERGY_COST), 'energy');
    eco.energyConsumedToday = 0;

    const report: DayReport = {
      day,
      income: { ...eco.today.income },
      expenses: { ...eco.today.expenses },
      net: this.netToday(),
      credits: g.state.resources.credits,
    };
    eco.history.push(report);
    if (eco.history.length > HISTORY_DAYS) eco.history.shift();
    eco.today = { income: {}, expenses: {} };

    if (g.state.resources.credits < 0) {
      eco.debtDays++;
      if (eco.debtDays >= BANKRUPTCY_DAYS) {
        eco.bankrupt = true;
        g.bus.emit('bankrupt', {});
      } else {
        g.notify('danger', 'notice.inDebt', { days: BANKRUPTCY_DAYS - eco.debtDays });
      }
    } else {
      eco.debtDays = 0;
    }
    return report;
  }
}
