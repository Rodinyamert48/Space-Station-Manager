import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import '@babylonjs/core/Meshes/thinInstanceMesh';
import type { Scene } from '@babylonjs/core/scene';
import { Rng } from '../core/Rng';
import { CREW_ROLE_DEFS } from '../data/crew';
import { DIR_VEC, OPPOSITE, addVec, type Dir } from '../data/grid';
import type { ModuleType } from '../data/modules';
import type { Game } from '../game/Game';
import type { CrewMember, ModuleState } from '../game/state';
import { ModelKit } from './models/ModelKit';
import { cellToWorld } from './StationView';

/** Walking speed in world units per game hour. */
const WALK_SPEED = 5;
/** Distance from module centre where corridors begin. */
const PORT_INSET = 4.4;
/** Height offset so feet rest on corridor floors. */
const FLOOR = -0.3;

interface Agent {
  key: string;
  color: Color4;
  points: Vector3[];
  /** Whether each segment (points[i] → points[i+1]) is visible from outside. */
  visible: boolean[];
  seg: number;
  along: number;
  pos: Vector3;
  heading: number;
  spot: Vector3 | null;
  phase: number;
  eva?: { center: Vector3; radius: number; speed: number; tilt: number };
}

/** Interior spots visible through glass (domes) where people can be seen standing around. */
const VISIBLE_SPOTS: Partial<Record<ModuleType, { y: number; radius: number }>> = {
  command: { y: 2.95, radius: 1.3 },
  restaurant: { y: 0.32, radius: 2.4 },
};

/**
 * Crew and visitor NPCs rendered as thin instances. Movement follows module-graph paths and is
 * only visible inside glass corridors and domes; per-frame work is just interpolation.
 */
export class CrewView {
  private readonly mesh: Mesh;
  private readonly agents = new Map<string, Agent>();
  private matrices: Float32Array;
  private colors: Float32Array;
  private capacity: number;
  private maxVisible = 60;
  private lastHour = 0;
  private readonly rng = new Rng(99);
  private readonly tmpMatrix = new Matrix();
  private readonly tmpQuat = new Quaternion();
  private readonly tmpScale = new Vector3(1, 1, 1);

  constructor(scene: Scene) {
    const kit = new ModelKit(scene, 'npc');
    kit.cyl({ slot: 'hull', d: 0.36, dTop: 0.42, h: 0.62, pos: [0, 0.45, 0], tess: 8 });
    kit.sphere({ slot: 'hull', d: 0.3, seg: 6, pos: [0, 0.92, 0] });
    kit.box({ slot: 'hull', w: 0.22, h: 0.3, d: 0.12, pos: [0, 0.55, -0.22] });
    kit.cyl({ slot: 'hull', d: 0.14, h: 0.4, pos: [-0.09, 0.1, 0], tess: 5 });
    kit.cyl({ slot: 'hull', d: 0.14, h: 0.4, pos: [0.09, 0.1, 0], tess: 5 });
    const built = [...kit.build().values()][0];
    if (!built) throw new Error('NPC mesh failed');
    this.mesh = built;
    const mat = new StandardMaterial('npcMat', scene);
    mat.diffuseColor = new Color3(1, 1, 1);
    mat.emissiveColor = new Color3(0.25, 0.25, 0.25);
    mat.specularColor = new Color3(0.2, 0.2, 0.2);
    this.mesh.material = mat;
    this.mesh.isPickable = false;
    this.mesh.alwaysSelectAsActiveMesh = true;
    this.capacity = 0;
    this.matrices = new Float32Array(0);
    this.colors = new Float32Array(0);
    this.ensureCapacity(64);
  }

  private ensureCapacity(n: number): void {
    if (n <= this.capacity) return;
    this.capacity = Math.max(n, this.capacity * 2);
    this.matrices = new Float32Array(this.capacity * 16);
    this.colors = new Float32Array(this.capacity * 4);
    this.mesh.thinInstanceSetBuffer('matrix', this.matrices, 16, false);
    this.mesh.thinInstanceSetBuffer('color', this.colors, 4, false);
    // Keep at least one (zero-scaled) instance so the material always compiles with
    // per-instance colours enabled.
    this.mesh.thinInstanceCount = 1;
  }

  setMaxVisible(max: number): void {
    this.maxVisible = max;
  }

  // ---------------------------------------------------------------- paths

  private center(m: ModuleState): Vector3 {
    return cellToWorld(m.cell);
  }

  private spotFor(m: ModuleState, seed: number): Vector3 | null {
    const spot = VISIBLE_SPOTS[m.type];
    if (!spot) return null;
    const a = (seed * 2.399) % (Math.PI * 2);
    const r = spot.radius * (0.35 + ((seed * 0.618) % 0.65));
    return this.center(m).addInPlaceFromFloats(Math.cos(a) * r, spot.y, Math.sin(a) * r);
  }

  private dirBetween(a: ModuleState, b: ModuleState): Dir {
    for (const d of Object.keys(DIR_VEC) as Dir[]) {
      const c = addVec(a.cell, DIR_VEC[d]);
      if (c.x === b.cell.x && c.y === b.cell.y && c.z === b.cell.z) return d;
    }
    return 'pz';
  }

  /** Waypoints from one module to another through connecting corridors. */
  private route(game: Game, fromId: number, toId: number, seed: number): { points: Vector3[]; visible: boolean[]; spot: Vector3 | null } {
    const ids = game.station.path(fromId, toId);
    const mods = ids.map((id) => game.station.getModule(id)).filter((m): m is ModuleState => !!m);
    const points: Vector3[] = [];
    const visible: boolean[] = [];
    const first = mods[0];
    if (!first) return { points: [], visible: [], spot: null };
    points.push(this.spotFor(first, seed) ?? this.center(first));
    for (let i = 0; i + 1 < mods.length; i++) {
      const a = mods[i] as ModuleState;
      const b = mods[i + 1] as ModuleState;
      const d = this.dirBetween(a, b);
      const v = DIR_VEC[d];
      const vertical = v.y !== 0;
      const floor = vertical ? 0 : FLOOR;
      const portA = this.center(a).addInPlaceFromFloats(v.x * PORT_INSET, floor, v.z * PORT_INSET + 0);
      const ov = DIR_VEC[OPPOSITE[d]];
      const portB = this.center(b).addInPlaceFromFloats(ov.x * PORT_INSET, floor, ov.z * PORT_INSET);
      if (vertical) {
        portA.y = this.center(a).y + v.y * PORT_INSET;
        portB.y = this.center(b).y + ov.y * PORT_INSET;
      }
      visible.push(false);
      points.push(portA);
      visible.push(true);
      points.push(portB);
    }
    const last = mods[mods.length - 1] as ModuleState;
    const spot = this.spotFor(last, seed);
    visible.push(false);
    points.push(spot ?? this.center(last));
    return { points, visible, spot };
  }

  private setRoute(agent: Agent, game: Game, fromId: number, toId: number, seed: number): void {
    const r = this.route(game, fromId, toId, seed);
    if (r.points.length === 0) return;
    agent.points = r.points;
    agent.visible = r.visible;
    agent.seg = 0;
    agent.along = 0;
    agent.spot = r.spot;
    agent.pos.copyFrom(r.points[0] as Vector3);
  }

  // ---------------------------------------------------------------- agents

  syncAll(game: Game): void {
    this.agents.clear();
    for (const c of game.crew.members) this.addCrew(c, game);
    for (const ship of game.ships.list) this.syncVisitors(ship.id, game);
    this.lastHour = game.smoothHour;
  }

  addCrew(c: CrewMember, game: Game): void {
    const agent: Agent = {
      key: `crew-${c.id}`,
      color: Color4.FromHexString(`${CREW_ROLE_DEFS[c.role].color}ff`),
      points: [],
      visible: [],
      seg: 0,
      along: 0,
      pos: new Vector3(),
      heading: 0,
      spot: null,
      phase: this.rng.range(0, 6.28),
    };
    this.agents.set(agent.key, agent);
    this.setRoute(agent, game, c.locationId, c.locationId, c.id);
  }

  removeCrew(id: number): void {
    this.agents.delete(`crew-${id}`);
  }

  moveCrew(c: CrewMember, from: number, to: number, game: Game): void {
    const agent = this.agents.get(`crew-${c.id}`);
    if (!agent) return;
    // Start from wherever the module path begins; if mid-walk, restart from the old target.
    this.setRoute(agent, game, game.station.getModule(from) ? from : to, to, c.id + to);
  }

  /** Passengers stroll to the lounge while their ship is docked. */
  syncVisitors(shipId: number, game: Game): void {
    const ship = game.ships.get(shipId);
    const prefix = `visitor-${shipId}-`;
    const docked = ship?.status === 'docked' && ship.passengers > 0;
    if (!docked) {
      for (const key of [...this.agents.keys()]) if (key.startsWith(prefix)) this.agents.delete(key);
      return;
    }
    if (!ship || [...this.agents.keys()].some((k) => k.startsWith(prefix))) return;
    const lounge = game.station.modules.find((m) => m.type === 'restaurant' && m.status === 'active') ?? game.station.command();
    const count = Math.min(6, ship.passengers);
    for (let i = 0; i < count; i++) {
      const agent: Agent = {
        key: `${prefix}${i}`,
        color: new Color4(0.92, 0.94, 1, 1),
        points: [],
        visible: [],
        seg: 0,
        along: -i * 0.8,
        pos: new Vector3(),
        heading: 0,
        spot: null,
        phase: this.rng.range(0, 6.28),
      };
      this.setRoute(agent, game, ship.berthId, lounge.id, shipId * 7 + i);
      agent.along = -i * 0.8;
      this.agents.set(agent.key, agent);
    }
  }

  /** Spacewalkers around modules under construction. */
  private syncEva(game: Game): void {
    const sites = new Set<string>();
    for (const m of game.station.modules) {
      if (m.status !== 'constructing') continue;
      for (let i = 0; i < 2; i++) {
        const key = `eva-${m.id}-${i}`;
        sites.add(key);
        if (this.agents.has(key)) continue;
        this.agents.set(key, {
          key,
          color: new Color4(1, 0.62, 0.2, 1),
          points: [],
          visible: [],
          seg: 0,
          along: 0,
          pos: new Vector3(),
          heading: 0,
          spot: null,
          phase: this.rng.range(0, 6.28),
          eva: { center: cellToWorld(m.cell), radius: 5.5 + i, speed: (i ? -1 : 1) * this.rng.range(0.25, 0.45), tilt: this.rng.range(-0.4, 0.4) },
        });
      }
    }
    for (const key of [...this.agents.keys()]) if (key.startsWith('eva-') && !sites.has(key)) this.agents.delete(key);
  }

  // ---------------------------------------------------------------- frame

  update(dt: number, game: Game): void {
    const now = game.smoothHour;
    const dh = Math.max(0, Math.min(1, now - this.lastHour));
    this.lastHour = now;
    this.syncEva(game);
    this.ensureCapacity(Math.min(this.maxVisible, this.agents.size));
    let n = 0;
    const time = performance.now() / 1000;
    for (const agent of this.agents.values()) {
      if (n >= this.maxVisible) break;
      let visible = false;
      let bob = 0;
      if (agent.eva) {
        const e = agent.eva;
        agent.phase += dt * e.speed;
        agent.pos.set(
          e.center.x + Math.cos(agent.phase) * e.radius,
          e.center.y + Math.sin(agent.phase * 1.7) * 2 + e.tilt * 3,
          e.center.z + Math.sin(agent.phase) * e.radius,
        );
        agent.heading = -agent.phase;
        visible = true;
      } else {
        visible = this.advance(agent, dh);
        if (!visible && agent.spot && agent.seg >= agent.points.length - 1) {
          visible = true;
          bob = Math.sin(time * 1.3 + agent.phase) * 0.02;
          agent.heading += Math.sin(time * 0.4 + agent.phase) * dt * 0.3;
        }
      }
      if (!visible) continue;
      Quaternion.RotationYawPitchRollToRef(agent.heading, agent.eva ? 0.5 : 0, 0, this.tmpQuat);
      this.tmpScale.setAll(agent.eva ? 1.1 : 1);
      Matrix.ComposeToRef(this.tmpScale, this.tmpQuat, new Vector3(agent.pos.x, agent.pos.y + bob, agent.pos.z), this.tmpMatrix);
      this.tmpMatrix.copyToArray(this.matrices, n * 16);
      const c = agent.color;
      this.colors[n * 4] = c.r;
      this.colors[n * 4 + 1] = c.g;
      this.colors[n * 4 + 2] = c.b;
      this.colors[n * 4 + 3] = 1;
      n++;
    }
    if (n === 0) {
      this.matrices.fill(0, 0, 16);
      n = 1;
    }
    this.mesh.thinInstanceCount = n;
    this.mesh.thinInstanceBufferUpdated('matrix');
    this.mesh.thinInstanceBufferUpdated('color');
  }

  /** Moves an agent along its path; returns whether it is currently visible. */
  private advance(agent: Agent, dh: number): boolean {
    const pts = agent.points;
    if (pts.length < 2 || agent.seg >= pts.length - 1) return false;
    agent.along += dh * WALK_SPEED;
    while (agent.seg < pts.length - 1) {
      const a = pts[agent.seg] as Vector3;
      const b = pts[agent.seg + 1] as Vector3;
      const len = Vector3.Distance(a, b);
      if (agent.along < len) {
        const t = Math.max(0, agent.along) / Math.max(1e-6, len);
        Vector3.LerpToRef(a, b, t, agent.pos);
        if (Math.abs(b.x - a.x) + Math.abs(b.z - a.z) > 1e-3) agent.heading = Math.atan2(b.x - a.x, b.z - a.z);
        return (agent.visible[agent.seg] ?? false) && agent.along >= 0;
      }
      agent.along -= len;
      agent.seg++;
    }
    agent.pos.copyFrom(pts[pts.length - 1] as Vector3);
    return false;
  }

  /** World position of a crew member (for camera focus). */
  crewPosition(id: number): Vector3 | null {
    return this.agents.get(`crew-${id}`)?.pos.clone() ?? null;
  }
}

