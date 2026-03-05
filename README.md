# World of Goo — Web Edition

A browser-based tribute to **2D Boy's** physics puzzle classic, built entirely from scratch with TypeScript, Phaser 3, and Matter.js.

## Quick Start

```bash
npm install
npm run dev
```

Open http://localhost:5173 in your browser.

## Production Build

```bash
npm run build
npm run preview   # preview the built version
```

The output is in `dist/` — static files you can deploy anywhere.

## Controls

| Action              | Input                         |
|---------------------|-------------------------------|
| Pick up a goo ball  | Left-click on a free goo ball |
| Place a goo ball    | Release near the structure    |
| Pan camera          | Right-click drag              |
| Undo last move      | Click UNDO or press **Z**     |
| Retry level         | Click RETRY or press **R**    |
| Back to menu        | Click MENU or press **Esc**   |

## Game Mechanics

- **Build structures** by dragging free goo balls and attaching them to existing structural goo balls.
- **Reach the pipe** — free goo balls crawling on your structure get sucked in when they reach the pipe.
- **Save enough goo** to complete each level.

### Goo Ball Types

| Type     | Color | Ability                                            |
|----------|-------|----------------------------------------------------|
| Common   | Black | Standard goo, up to 4 connections                  |
| Ivy      | Green | Can be detached and reattached (click on them)      |
| Balloon  | Red   | Floats upward, lifts structures (1 connection max)  |
| Bone     | White | Rigid connections that barely flex (2 connections)   |
| Water    | Blue  | Cannot form connections — just flows toward the pipe |

## Project Structure

```
src/
  main.ts                  Entry point & Phaser config
  data/
    GooTypes.ts            Goo ball type definitions
    levels.ts              13 level configurations
    types.ts               Shared TypeScript interfaces
  game/
    SoundManager.ts        Procedural Web Audio sound effects
  scenes/
    BootScene.ts           Texture generation
    MenuScene.ts           Main menu with animated goo balls
    LevelSelectScene.ts    Level grid with progress tracking
    GameScene.ts           Core gameplay (physics, input, rendering)
```

## Tech Stack

- **Phaser 3.80** — game framework (rendering, scenes, input)
- **Matter.js** (via Phaser) — physics simulation
- **TypeScript** — type safety
- **Vite** — dev server and bundler

All visuals are rendered programmatically via Phaser Graphics (no external image assets).
All sounds are generated procedurally via Web Audio API.
