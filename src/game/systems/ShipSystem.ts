import { clamp } from '../../core/math';
import { MODULES } from '../../data/modules';
import type { Good } from '../../data/resources';
import {
  LOCATIONS,
  SHIPS,
  SHIP_NAME_PREFIX,
  SHIP_NAME_WORDS,
  SHIP_OWNERS,
  SHIP_TYPES,
  type ShipTypeId,
} from '../../data/ships';
import type { Game } from '../Game';
import type { ModuleState, ShipState, TradeLine } from '../state';

/** Game hours a new ship spends flying in to the holding area. */
export const ARRIVAL_HOURS = 2.5;
/** Game hours from leaving the holding area to docking. */
export const APPROACH_HOURS = 2.2;
/** Game hours from undocking to leaving the scene. */
export const DEPART_HOURS = 1.6;
/** Units every ship visit allows before cargo modules. */
export const BASE_TRADE_ALLOWANCE = 80;
const HOLDING_SLOTS = 10;

export type TradeError = 'missing' | 'notDocked' | 'noOffer' | 'noDemand' | 'allowance' | 'noSpace' | 'noStock' | 'noCredits';
export type TradeResult = { ok: true; qty: number; total: number } | { ok: false; reason: TradeError };

const ROMAN = ['II', 'III', 'IV', 'V', 'VII', 'IX'];

/**
 * Ship traffic: arrivals, the docking queue, berth assignment, docking/undocking timelines,
 * docking fees, passenger services and trading with docked ships.
 */
export class ShipSystem {
  constructor(private readonly game: Game) {}

  private get state() {
    return this.game.state.ships;
  }

  get list(): readonly ShipState[] {
    return this.state.list;
  }

  get(id: number): ShipState | undefined {
    return this.state.list.find((s) => s.id === id);
  }

  /** Docking modules able to receive ships. */
  berths(): ModuleState[] {
    return this.game.station.modules.filter((m) => m.type === 'docking' && this.game.station.isOperational(m));
  }

  shipAtBerth(moduleId: number): ShipState | undefined {
    return this.state.list.find((s) => s.berthId === moduleId && (s.status === 'approaching' || s.status === 'docked' || s.status === 'departing'));
  }

  freeBerth(): ModuleState | undefined {
    return this.berths().find((b) => !this.shipAtBerth(b.id));
  }

  waitingCount(): number {
    return this.state.list.filter((s) => s.status === 'pending' || s.status === 'queued').length;
  }

  /** Passengers currently aboard the station from docked ships. */
  visitors(): number {
    let n = 0;
    for (const s of this.state.list) if (s.status === 'docked') n += s.passengers;
    return n;
  }

  tradeAllowance(): number {
    let cap = BASE_TRADE_ALLOWANCE;
    for (const m of this.game.station.modules) if (m.status === 'active') cap += MODULES[m.type].tradeCapacity ?? 0;
    return Math.round(cap * (1 + this.game.modifiers().tradeCapacity));
  }

  /** Expected hours between arrivals with the current station. */
  arrivalInterval(): number {
    const g = this.game;
    const berths = this.berths().length;
    if (berths === 0) return 14;
    const mods = g.modifiers();
    const traffic =
      1 + 0.18 * (g.state.stage - 1) + 0.12 * (berths - 1) + 0.12 * g.station.count('comms', true) + mods.shipTraffic + g.trafficEffect() + g.state.reputation / 200;
    return clamp(7.5 / traffic, 1.2, 14);
  }

  private eligibleTypes(): ShipTypeId[] {
    const g = this.game;
    return SHIP_TYPES.filter((type) => {
      const def = SHIPS[type];
      if (def.requires && !g.hasFeature(def.requires)) return false;
      if (g.state.reputation >= def.minReputation) return true;
      return !!def.bypassReputation && g.hasFeature(def.bypassReputation);
    });
  }

  private pickType(): ShipTypeId {
    const g = this.game;
    const low = (good: Good): boolean => g.state.resources[good] < g.resources.capacity(good) * 0.25;
    const type = g.rng.weighted(this.eligibleTypes(), (t) => {
      let w = SHIPS[t].weight;
      if (t === 'fuelTanker' && low('fuel')) w *= 2;
      if (t === 'mining' && low('metal')) w *= 1.6;
      if (t === 'cargo' && (low('food') || low('water'))) w *= 1.4;
      if (t === 'passenger' && g.station.count('restaurant', true) > 0) w *= 1.3;
      return w;
    });
    return type ?? 'cargo';
  }

  private lines(goods: Good[], count: number, totalQty: number, factor: [number, number], exclude: Good[] = []): TradeLine[] {
    const rng = this.game.rng;
    const pool = rng.shuffle(goods.filter((g) => !exclude.includes(g)));
    return pool.slice(0, Math.min(count, pool.length)).map((good) => ({
      good,
      qty: Math.max(5, Math.round((totalQty / count) * rng.range(0.7, 1.2))),
      price: Math.round(this.game.market.price(good) * rng.range(factor[0], factor[1]) * 100) / 100,
    }));
  }

  private freeHoldingSlot(): number {
    const used = new Set(this.state.list.filter((s) => s.status === 'pending' || s.status === 'queued').map((s) => s.holdingSlot));
    for (let i = 0; i < HOLDING_SLOTS; i++) if (!used.has(i)) return i;
    return this.game.rng.int(0, HOLDING_SLOTS - 1);
  }

  /** Creates a new ship approaching the station. */
  spawn(type: ShipTypeId = this.pickType(), special = false): ShipState {
    const g = this.game;
    const rng = g.rng;
    const def = SHIPS[type];
    const scale = 1 + 0.22 * (g.state.stage - 1);
    const cargoCapacity = Math.round(rng.range(def.cargo[0], def.cargo[1]) * scale);
    const origin = rng.pick(LOCATIONS);
    let destination = rng.pick(LOCATIONS);
    if (destination === origin) destination = rng.pick(LOCATIONS);
    const offers = def.sells.length ? this.lines(def.sells, rng.int(1, Math.min(2, def.sells.length)), cargoCapacity * rng.range(0.4, 0.65), def.sellFactor) : [];
    const demands = this.lines(def.buys, rng.int(1, Math.min(2, def.buys.length)), cargoCapacity * rng.range(0.25, 0.45), def.buyFactor, offers.map((o) => o.good));
    const now = g.hour;
    const ship: ShipState = {
      id: this.state.nextId++,
      type,
      size: def.size,
      name: `${rng.pick(SHIP_NAME_PREFIX)} ${rng.pick(SHIP_NAME_WORDS)}${rng.chance(0.3) ? ` ${rng.pick(ROMAN)}` : ''}`,
      owner: rng.pick(SHIP_OWNERS),
      origin,
      destination,
      cargoCapacity,
      offers,
      demands,
      researchOffer: def.sellsResearch ? Math.round(rng.range(8, 24) * scale) : 0,
      researchPrice: def.sellsResearch ? Math.round(rng.range(20, 32)) : 0,
      passengers: rng.int(def.passengers[0], def.passengers[1]),
      passengerFee: def.passengerFee,
      fee: Math.round(rng.range(def.fee[0], def.fee[1]) * (1 + 0.1 * (g.state.stage - 1))),
      status: 'pending',
      statusSince: now,
      patienceUntil: now + ARRIVAL_HOURS + def.patienceHours,
      priority: false,
      berthId: 0,
      serviceUntil: 0,
      tradeAllowance: 0,
      demandTotal: demands.reduce((sum, d) => sum + d.qty, 0),
      demandFilled: 0,
      holdingSlot: this.freeHoldingSlot(),
      complaints: 0,
      special,
    };
    this.state.list.push(ship);
    g.bus.emit('shipAdded', { ship });
    g.notify('info', 'notice.shipArrived', { ship: ship.name, type: `ship.${type}` }, { shipId: ship.id });
    if (this.state.autoAccept) this.accept(ship.id);
    return ship;
  }

  private setStatus(ship: ShipState, status: ShipState['status']): void {
    ship.status = status;
    ship.statusSince = this.game.hour;
    this.game.bus.emit('shipChanged', { ship });
  }

  accept(id: number): boolean {
    const ship = this.get(id);
    if (!ship || ship.status !== 'pending') return false;
    ship.patienceUntil = this.game.hour + SHIPS[ship.type].patienceHours * 1.5;
    this.setStatus(ship, 'queued');
    this.dispatch();
    return true;
  }

  reject(id: number): boolean {
    const ship = this.get(id);
    if (!ship || (ship.status !== 'pending' && ship.status !== 'queued')) return false;
    this.remove(ship);
    return true;
  }

  togglePriority(id: number): void {
    const ship = this.get(id);
    if (!ship || (ship.status !== 'pending' && ship.status !== 'queued')) return;
    ship.priority = !ship.priority;
    this.game.bus.emit('shipChanged', { ship });
    if (ship.priority && ship.status === 'pending') this.accept(id);
  }

  /** Ends a docked ship's visit early. */
  release(id: number): boolean {
    const ship = this.get(id);
    if (!ship || ship.status !== 'docked') return false;
    this.depart(ship);
    return true;
  }

  private remove(ship: ShipState): void {
    const list = this.state.list;
    const i = list.indexOf(ship);
    if (i >= 0) list.splice(i, 1);
    this.game.bus.emit('shipRemoved', { ship });
  }

  /** Sends queued ships to free berths, priority ships first. */
  private dispatch(): void {
    for (;;) {
      const berth = this.freeBerth();
      if (!berth) return;
      const next = this.state.list
        .filter((s) => s.status === 'queued')
        .sort((a, b) => Number(b.priority) - Number(a.priority) || a.statusSince - b.statusSince)[0];
      if (!next) return;
      next.berthId = berth.id;
      this.setStatus(next, 'approaching');
    }
  }

  private dock(ship: ShipState): void {
    const g = this.game;
    // Count first so listeners of the status change see up-to-date statistics.
    g.state.stats.shipsDocked++;
    g.state.stats.passengersServed += ship.passengers;
    this.setStatus(ship, 'docked');
    const serviceMult = Math.max(0.3, 1 + g.modifiers().serviceTime);
    ship.serviceUntil = g.hour + SHIPS[ship.type].serviceHours * serviceMult;
    ship.tradeAllowance = this.tradeAllowance();
    g.economy.earn(ship.fee, 'docking');
    if (ship.passengers > 0) g.economy.earn(ship.passengers * ship.passengerFee, 'passengers');
    g.economy.charge(ship.size === 'L' ? 22 : ship.size === 'M' ? 12 : 8, 'shipServices');
    g.notify('success', 'notice.shipDocked', { ship: ship.name, fee: ship.fee }, { shipId: ship.id });
    // Some passengers are looking for work on the station.
    if (ship.passengers > 0 && g.rng.chance(0.35)) g.crew.addApplicants(1);
    this.autoTrade(ship);
  }

  private depart(ship: ShipState): void {
    const g = this.game;
    const satisfaction = this.satisfaction(ship);
    const vip = ship.type === 'luxury' || ship.type === 'military' ? 1.5 : 1;
    const delta = (satisfaction >= 0.5 ? 0.3 + 1.2 * satisfaction : -1 + satisfaction) * vip;
    g.changeReputation(delta);
    this.setStatus(ship, 'departing');
    g.notify(satisfaction >= 0.5 ? 'info' : 'warning', 'notice.shipDeparted', { ship: ship.name, pct: Math.round(satisfaction * 100) }, { shipId: ship.id });
  }

  /** 0..1 rating of the visit: demands filled and comfort of passengers. */
  satisfaction(ship: ShipState): number {
    const trade = ship.demandTotal > 0 ? ship.demandFilled / ship.demandTotal : 1;
    const comfort = clamp(1 - ship.complaints * 0.15, 0, 1);
    const tradeWeight = ship.passengers > 0 ? 0.4 : 0.85;
    return clamp(trade * tradeWeight + comfort * (1 - tradeWeight), 0, 1);
  }

  update(): void {
    const g = this.game;
    const now = g.hour;
    if (now >= this.state.nextArrivalAt) {
      if (this.berths().length > 0 && this.waitingCount() < 3 + this.berths().length) this.spawn();
      this.state.nextArrivalAt = now + this.arrivalInterval() * g.rng.range(0.7, 1.3);
    }
    for (const ship of [...this.state.list]) {
      switch (ship.status) {
        case 'pending':
        case 'queued':
          if (now >= ship.patienceUntil) {
            g.changeReputation(ship.status === 'queued' ? -1.5 : -0.5);
            g.notify('warning', 'notice.shipGaveUp', { ship: ship.name }, { shipId: ship.id });
            this.remove(ship);
          }
          break;
        case 'approaching':
          if (!g.station.getModule(ship.berthId)) {
            ship.berthId = 0;
            this.setStatus(ship, 'queued');
          } else if (now - ship.statusSince >= APPROACH_HOURS) this.dock(ship);
          break;
        case 'docked':
          if (now >= ship.serviceUntil) this.depart(ship);
          break;
        case 'departing':
          if (now - ship.statusSince >= DEPART_HOURS) this.remove(ship);
          break;
      }
    }
    this.dispatch();
  }

  /** Hourly services: visitors spend money in restaurants and complain about shortages. */
  hourly(): void {
    const g = this.game;
    const visitors = this.visitors();
    if (visitors <= 0) return;
    let recreation = 0;
    for (const m of g.station.modules) {
      if (m.type === 'restaurant' && g.station.isOperational(m)) recreation += (MODULES.restaurant.recreation ?? 0) * (g.resources.flows.efficiency.get(m.id) ?? 0);
    }
    const served = Math.min(1, recreation / visitors);
    const shortage = g.resources.shortages.size > 0;
    let income = 0;
    for (const ship of this.state.list) {
      if (ship.status !== 'docked' || ship.passengers === 0) continue;
      const spend = ship.type === 'luxury' ? 3.2 : 1.2;
      income += ship.passengers * spend * served;
      if (shortage) ship.complaints++;
      this.autoTrade(ship);
    }
    g.economy.earn(Math.round(income * (1 + g.modifiers().restaurantIncome)), 'services');
  }

  /** Largest quantity the station can trade right now. */
  maxTrade(ship: ShipState, good: Good, side: 'buy' | 'sell'): number {
    const g = this.game;
    if (side === 'buy') {
      const line = ship.offers.find((l) => l.good === good);
      if (!line) return 0;
      const affordable = line.price > 0 ? Math.floor(Math.max(0, g.state.resources.credits) / line.price) : 0;
      return Math.max(0, Math.floor(Math.min(line.qty, ship.tradeAllowance, g.resources.space(good), affordable)));
    }
    const line = ship.demands.find((l) => l.good === good);
    if (!line) return 0;
    return Math.max(0, Math.floor(Math.min(line.qty, ship.tradeAllowance, g.state.resources[good])));
  }

  trade(id: number, good: Good, qty: number, side: 'buy' | 'sell'): TradeResult {
    const g = this.game;
    const ship = this.get(id);
    if (!ship) return { ok: false, reason: 'missing' };
    if (ship.status !== 'docked') return { ok: false, reason: 'notDocked' };
    const line = (side === 'buy' ? ship.offers : ship.demands).find((l) => l.good === good);
    if (!line || line.qty <= 0) return { ok: false, reason: side === 'buy' ? 'noOffer' : 'noDemand' };
    if (ship.tradeAllowance <= 0) return { ok: false, reason: 'allowance' };
    const amount = Math.min(Math.floor(qty), this.maxTrade(ship, good, side));
    if (amount <= 0) {
      if (side === 'buy') return { ok: false, reason: g.resources.space(good) < 1 ? 'noSpace' : 'noCredits' };
      return { ok: false, reason: 'noStock' };
    }
    const total = Math.round(line.price * amount);
    if (side === 'buy') {
      if (!g.economy.spend(total, 'trade')) return { ok: false, reason: 'noCredits' };
      g.resources.add(good, amount);
    } else {
      g.resources.remove(good, amount);
      g.economy.earn(total, 'trade');
      ship.demandFilled += amount;
    }
    line.qty -= amount;
    ship.tradeAllowance -= amount;
    g.state.stats.tradeVolume += total;
    g.state.stats.cargoMoved += amount;
    g.market.recordTrade(good, amount, side);
    g.bus.emit('traded', { ship, good, qty: amount, side, total });
    g.bus.emit('shipChanged', { ship });
    return { ok: true, qty: amount, total };
  }

  /** Buys research data from a research vessel. */
  buyResearch(id: number, qty: number): TradeResult {
    const g = this.game;
    const ship = this.get(id);
    if (!ship) return { ok: false, reason: 'missing' };
    if (ship.status !== 'docked') return { ok: false, reason: 'notDocked' };
    const affordable = Math.floor(Math.max(0, g.state.resources.credits) / Math.max(1, ship.researchPrice));
    const amount = Math.min(Math.floor(qty), ship.researchOffer, affordable);
    if (amount <= 0) return { ok: false, reason: ship.researchOffer <= 0 ? 'noOffer' : 'noCredits' };
    const total = amount * ship.researchPrice;
    if (!g.economy.spend(total, 'research')) return { ok: false, reason: 'noCredits' };
    g.resources.add('research', amount);
    ship.researchOffer -= amount;
    g.state.stats.tradeVolume += total;
    g.bus.emit('traded', { ship, good: 'research', qty: amount, side: 'buy', total });
    g.bus.emit('shipChanged', { ship });
    return { ok: true, qty: amount, total };
  }

  /** Automated cargo handling: sells surplus and restocks scarce goods within the rules. */
  autoTrade(ship: ShipState): void {
    const g = this.game;
    const rules = this.state.autoTrade;
    if (!rules.enabled || !g.hasFeature('autoTrade') || ship.status !== 'docked') return;
    for (const line of ship.demands) {
      const cap = g.resources.capacity(line.good);
      const surplus = Math.floor(g.state.resources[line.good] - cap * rules.sellAbove);
      if (surplus > 0) this.trade(ship.id, line.good, surplus, 'sell');
    }
    for (const line of ship.offers) {
      const cap = g.resources.capacity(line.good);
      const wanted = Math.floor(cap * rules.buyBelow - g.state.resources[line.good]);
      const reserve = Math.max(0, g.state.resources.credits - 800);
      const affordable = Math.floor(reserve / Math.max(0.01, line.price));
      if (wanted > 0 && affordable > 0) this.trade(ship.id, line.good, Math.min(wanted, affordable), 'buy');
    }
  }

  setAutoAccept(enabled: boolean): void {
    this.state.autoAccept = enabled;
    if (enabled) for (const s of [...this.state.list]) if (s.status === 'pending') this.accept(s.id);
  }
}
