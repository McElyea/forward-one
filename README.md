# Forward One

[![CI](https://github.com/McElyea/forward-one/actions/workflows/ci.yml/badge.svg)](https://github.com/McElyea/forward-one/actions/workflows/ci.yml)

A browser-first whitewater survival racer built with Phaser 4, TypeScript, and Vite.

The game combines an escalating guide-call rhythm loop with rocks, strainers, cross-currents, and wave trains. Class II–V water sets the starting pressure, then calls repeat faster until the player is swept away. Solo mode records survival time. With Supabase configured, online rooms start at eight seats and can be expanded to 16, 32, or 64; the zero-configuration build keeps the original three-rival preview available.

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

The `dist/` directory is a static site and can be deployed to Cloudflare Pages, Vercel, Netlify, GitHub Pages, or itch.io. Multiplayer does not change that deployment shape: the browser connects directly to a managed Supabase project.

Barlow Condensed and Inter are bundled rather than fetched from Google Fonts, so loading the game makes no third-party font request. This is a correctness requirement and not only a privacy one: Phaser rasterizes each text object into a texture once and never restyles it, so a font that arrives after the menu is drawn never appears. `src/main.ts` waits for the faces before starting the game, with a timeout so a font failure still boots. Both families are third-party font software under the SIL Open Font License 1.1 rather than this repository's MIT license — see [`src/assets/fonts/LICENSE.txt`](src/assets/fonts/LICENSE.txt). A configured online race connects to its Supabase project at runtime.

## Run it in a container

[`Dockerfile`](Dockerfile) builds the same `dist/` on Node 22 and then serves it with nginx, for hosts that take a container rather than a folder of files. Node, npm, and `node_modules` stay in the discarded build stage; the image that ships is nginx, the bundle, and the guide audio.

```bash
docker build -t forward-one .
docker run --rm -p 8080:8080 forward-one
```

Then open <http://localhost:8080>.

The server listens on **8080** as an unprivileged user, so it needs no root and no added capability. It answers `GET /healthz` with a fixed `200` for container healthchecks, fingerprinted `/assets` are served `immutable` while `index.html` is `no-cache`, and TLS and security headers are left to whatever reverse proxy sits in front — [`docker/nginx.conf`](docker/nginx.conf) says why for each. The container itself keeps no state and needs no volume or database. Online rooms use Supabase when its two public Vite variables are supplied during the build.

Kokoro is a development-only dependency. Its 82M-parameter model is used only by `npm run voice:generate`; players receive small WAV clips and never download the model.

## Project structure

```text
src/game/
  levels.ts                 data-driven Class II–V runs
  rhythm/RhythmEngine.ts    framework-independent timing judgments
  race/RaceAdapter.ts       solo/multiplayer boundary
  race/SimulatedRaceAdapter.ts
  race/SupabaseRaceAdapter.ts
  multiplayer/SupabaseRoomConnection.ts
  survival/SurvivalEngine.ts endless obstacle schedule, intensity, ejection, and recovery
  run/runOutcome.ts         what the summary screen says when a run ends
  scenes/MenuScene.ts
  scenes/LobbyScene.ts
  scenes/RiverScene.ts
  ui/layout.ts              viewport-driven regions and type scale
  ui/fontLoading.ts         gates boot until the bundled faces are usable
  ui/runClock.ts            the M:SS.CC run clock, shared by the HUD and the summary

src/assets/fonts/           self-hosted Barlow Condensed and Inter (woff2, OFL 1.1)
```

## Contributing

[AGENTS.md](AGENTS.md) collects the constraints that are not obvious from reading the source: the Phaser scene-reuse rule, why the test suite runs without a DOM, which compiler flags fail the build, and which files are generated and must not be hand-edited. Worth reading before a first change, by people and coding agents alike.

## Multiplayer setup

Online races use anonymous Supabase Auth, private Realtime Presence for lobby membership, and Broadcast for the shared start and sparse survival heartbeats. The deterministic river continues to run locally; active opponents advance from the shared database-generated start time. Ranking retains every player, while the in-race rail shows at most eight useful positions—the leader, the local paddler, and nearby racers—so a 64-player room remains legible on a phone.

1. Create a Supabase project and enable **Authentication → Providers → Anonymous Sign-Ins**.
2. In Realtime settings, disable public channels so the migration's room-membership policies are enforced.
3. Run [`supabase/migrations/20260819000000_multiplayer_rooms.sql`](supabase/migrations/20260819000000_multiplayer_rooms.sql) in the SQL editor or with the Supabase CLI.
4. Copy [`.env.example`](.env.example) to `.env.local` and set the project URL and **publishable** key. Never put a secret or service-role key in a `VITE_` variable.
5. Restart `npm run dev`, or rebuild before deploying—the Vite variables are compiled into the static bundle.

Without both variables, the second menu button intentionally remains the simulated survival race. Before a public launch, enable CAPTCHA or Turnstile for anonymous sign-ins and arrange periodic cleanup of old anonymous Auth users; race rooms themselves expire after two hours and are removed as new rooms are created.

## License

Forward One is available under the [MIT License](LICENSE).
