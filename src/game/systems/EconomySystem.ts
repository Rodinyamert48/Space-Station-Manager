import type { Game } from '../Game';
import type { ExpenseCategory, IncomeCategory } from '../state';

/**
 * Credits ledger. All income and spending is categorised here so the daily report and the
 * statistics stay consistent.
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

  netToday(): number {
    const { income, expenses } = this.game.state.economy.today;
    let net = 0;
    for (const v of Object.values(income)) net += v ?? 0;
    for (const v of Object.values(expenses)) net -= v ?? 0;
    return net;
  }
}
