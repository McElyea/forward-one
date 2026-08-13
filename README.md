# Forward One

A browser-first whitewater rhythm racer built with Phaser 4, TypeScript, and Vite.

The scaffold includes a playable timing loop, data definitions for Class II–V levels, solo mode, and a multiplayer preview with simulated racers. The simulation implements the same `RaceAdapter` interface a future Supabase realtime room will use.

## Run on macOS

Install [Node.js](https://nodejs.org/) 22 or newer, then:

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. Use Space, F, or ↑ for forward strokes and B or ↓ for backwards strokes; touch devices have a large button for each direction. The layout adapts to the viewport in both orientations, so it plays on a phone as well as a desktop. Each guide call is entirely forward or entirely backwards. Press the requested direction when a paddle marker reaches the yellow timing line. Escape returns to the menu. The put-in screen offers four bundled Kokoro guide voices—Bella, Heart, Liam, and Eric—with Bella as the default. Selecting a voice previews and remembers it on that device.

## Commands

```bash
npm run dev       # local development server
npm run build     # type-check and create dist/
npm run test      # run unit tests once
npm run preview   # serve the production build locally
npm run voice:generate # regenerate all bundled Forward and Backwards calls
```

The `dist/` directory is a static site and can be deployed to Cloudflare Pages, Vercel, Netlify, GitHub Pages, or itch.io.

Kokoro is a development-only dependency. Its 82M-parameter model is used only by `npm run voice:generate`; players receive small WAV clips and never download the model.

## Project structure

```text
src/game/
  levels.ts                 data-driven Class II–V runs
  rhythm/RhythmEngine.ts    framework-independent timing judgments
  race/RaceAdapter.ts       solo/multiplayer boundary
  race/SimulatedRaceAdapter.ts
  scenes/MenuScene.ts
  scenes/RiverScene.ts
  ui/layout.ts              viewport-driven regions and type scale
```

## Contributing

[AGENTS.md](AGENTS.md) collects the constraints that are not obvious from reading the source: the Phaser scene-reuse rule, why the test suite runs without a DOM, which compiler flags fail the build, and which files are generated and must not be hand-edited. Worth reading before a first change, by people and coding agents alike.

## Multiplayer path

The first hosted multiplayer implementation should add a `SupabaseRaceAdapter` without changing `RiverScene`. It will use Presence for lobby membership and Broadcast for the shared start time, progress snapshots, and finish events. Client input-event records can later support server validation and ghost races.

## License

Forward One is available under the [MIT License](LICENSE).
