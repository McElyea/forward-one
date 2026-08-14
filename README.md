# Forward One

[![CI](https://github.com/McElyea/forward-one/actions/workflows/ci.yml/badge.svg)](https://github.com/McElyea/forward-one/actions/workflows/ci.yml)

A browser-first whitewater rhythm racer built with Phaser 4, TypeScript, and Vite.

The scaffold includes a playable timing loop, data definitions for Class II–V levels, solo mode, and a multiplayer preview with simulated racers. The simulation implements the same `RaceAdapter` interface a future Supabase realtime room will use.

## Run it locally

Install [Node.js](https://nodejs.org/) 22 or newer — the version `package.json` declares in `engines` and the one CI builds against — then:

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
npm run test:watch # re-run unit tests as files change
npm run preview   # serve the production build locally
npm run voice:generate # regenerate all bundled Forward and Backwards calls
```

Every push to `main` and every pull request runs `npm ci`, `npm run build`, and `npm run test` on Node 22 — see [`.github/workflows/ci.yml`](.github/workflows/ci.yml) and the badge above.

The `dist/` directory is a static site and can be deployed to Cloudflare Pages, Vercel, Netlify, GitHub Pages, or itch.io.

## Run it in a container

[`Dockerfile`](Dockerfile) builds the same `dist/` on Node 22 and then serves it with nginx, for hosts that take a container rather than a folder of files. Node, npm, and `node_modules` stay in the discarded build stage; the image that ships is nginx, the bundle, and the guide audio.

```bash
docker build -t forward-one .
docker run --rm -p 8080:8080 forward-one
```

Then open <http://localhost:8080>.

The server listens on **8080** as an unprivileged user, so it needs no root and no added capability. It answers `GET /healthz` with a fixed `200` for container healthchecks, fingerprinted `/assets` are served `immutable` while `index.html` is `no-cache`, and TLS and security headers are left to whatever reverse proxy sits in front — [`docker/nginx.conf`](docker/nginx.conf) says why for each. The game keeps no server-side state, so the container needs no volume, no database, and no environment.

Kokoro is a development-only dependency. Its 82M-parameter model is used only by `npm run voice:generate`; players receive small WAV clips and never download the model.

## Project structure

```text
src/game/
  levels.ts                 data-driven Class II–V runs
  rhythm/RhythmEngine.ts    framework-independent timing judgments
  race/RaceAdapter.ts       solo/multiplayer boundary
  race/SimulatedRaceAdapter.ts
  run/runOutcome.ts         whether a run has finished, timed out, or is still going
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
