# Forward One

[![CI](https://github.com/McElyea/forward-one/actions/workflows/ci.yml/badge.svg)](https://github.com/McElyea/forward-one/actions/workflows/ci.yml)

A browser-first whitewater survival racer built with Phaser 4, TypeScript, and Vite.

The game combines an escalating guide-call rhythm loop with rocks, strainers, cross-currents, and wave trains. Class II–V water sets the starting pressure, then calls repeat faster until the player is swept away. Solo mode records survival time; the multiplayer preview asks the player to outlast three simulated racers behind the same `RaceAdapter` interface a future hosted room will use.

## Run it locally

Install [Node.js](https://nodejs.org/) 22 or newer — the version `package.json` declares in `engines` and the one CI builds against — then:

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. Use Space, F, or ↑ for forward strokes and B or ↓ for backwards strokes; touch devices have a large button for each direction. The layout adapts to the viewport in both orientations, so it plays on a phone as well as a desktop. Each guide call is entirely forward or entirely backwards and is tied to an approaching river obstacle. Press the requested direction when a paddle marker reaches the yellow timing line. Three failed obstacle calls throw the player overboard. While swimming, land two calls to regain the raft; miss two consecutive recovery calls and the run ends. Escape returns to the menu. The put-in screen offers four bundled Kokoro guide voices—Bella, Heart, Liam, and Eric—with Bella as the default. Selecting a voice previews and remembers it on that device.

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

Barlow Condensed and Inter are bundled rather than fetched from Google Fonts, so a deployed build makes no third-party requests at runtime. This is a correctness requirement and not only a privacy one: Phaser rasterizes each text object into a texture once and never restyles it, so a font that arrives after the menu is drawn never appears. `src/main.ts` waits for the faces before starting the game, with a timeout so a font failure still boots. Both families are third-party font software under the SIL Open Font License 1.1 rather than this repository's MIT license — see [`src/assets/fonts/LICENSE.txt`](src/assets/fonts/LICENSE.txt).

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
  survival/SurvivalEngine.ts endless obstacle schedule, intensity, ejection, and recovery
  scenes/MenuScene.ts
  scenes/RiverScene.ts
  ui/layout.ts              viewport-driven regions and type scale
  ui/fontLoading.ts         gates boot until the bundled faces are usable

src/assets/fonts/           self-hosted Barlow Condensed and Inter (woff2, OFL 1.1)
```

## Contributing

[AGENTS.md](AGENTS.md) collects the constraints that are not obvious from reading the source: the Phaser scene-reuse rule, why the test suite runs without a DOM, which compiler flags fail the build, and which files are generated and must not be hand-edited. Worth reading before a first change, by people and coding agents alike.

## Multiplayer path

The first hosted multiplayer implementation should add a `SupabaseRaceAdapter` without changing `RiverScene`. It will use Presence for lobby membership and Broadcast for the shared start time, survival snapshots, and elimination events. Client input-event records can later support server validation and ghost races.

## License

Forward One is available under the [MIT License](LICENSE).
