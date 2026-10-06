# Space Station Manager

A browser-based 3D space station management game built with **Babylon.js**, **TypeScript** and **Vite**.
Grow a small orbital outpost into a mega station: build modules, keep the crew alive, trade with
passing ships, research new technology, take contracts and survive incidents.

**Play:** https://rodinyamert48.github.io/Space-Station-Manager/

Runs on desktop and mobile browsers (phones and tablets get a dedicated touch layout).

## Features

- Modular station building on a 3D grid with connection points, rotation and placement checks
- 15 module types, from power and life support to factories, laboratories, docking and defense
- Ten resources with live production/consumption, storage limits and shortages
- Economy with daily income/expenses, salaries, upkeep and bankruptcy
- Ship traffic with docking requests, priorities, berths, trading and a dynamic market
- Crew with roles, needs, happiness, jobs and pathfinding through the station
- Technology tree, contracts, random events with choices, reputation and seven station stages
- Guided first-session tutorial
- Low / Medium / High / Ultra graphics, resolution scale, FPS limit
- Autosave plus manual save (localStorage), English and Turkish

## Controls

| Action | Desktop | Touch |
| --- | --- | --- |
| Orbit camera | Left drag, `Q` / `E` | One-finger drag |
| Pan | Right drag, `WASD` / arrows | Two-finger drag |
| Zoom | Mouse wheel, `+` / `-` | Pinch |
| Select module / ship | Click | Tap |
| Place module | Click a glowing connection point | Tap a point, then tap again or press Build |
| Rotate module | `R` | Rotate button |
| Pause / speed | `Space`, `1`, `2`, `3` | Speed button |
| Recenter camera | `H` | — |
| Pause menu | `Esc` | Menu button |

## Development

Requires Node.js 20.19+ (22 recommended).

```bash
npm install
npm run dev        # dev server on http://localhost:5173
npm test           # unit tests (Vitest)
npm run typecheck  # TypeScript strict check
npm run build      # typecheck + production build into dist/
npm run preview    # serve the production build
```

Pushes to the default branch are built, tested and published to GitHub Pages by
`.github/workflows/deploy.yml`.

## Project layout

```
src/
  app/       application lifecycle, HUD wiring
  core/      event bus, RNG, math helpers
  data/      module, resource, ship, tech, event and mission definitions
  game/      simulation (Game facade + systems); no rendering code
  world/     Babylon.js scene, procedural models, views and effects
  ui/        DOM HUD, windows, menus
  save/      save format, validation, storage backends
  settings/  settings and quality presets
  audio/     procedural sound effects and ambient music
  i18n/      translations
tests/       unit tests for the simulation and save system
```
