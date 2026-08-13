# Working on Forward One

Notes for anyone — human or automated — making changes here. `README.md` covers what the
game is and how to run it; this file covers the constraints that decide whether a change
compiles, and the ones where the obvious first attempt is wrong.

Everything below was verified against the source it cites. When a claim and the code
disagree, the code is right and this file is a bug.

## Commands

```bash
npm install            # first time
npm run dev            # Vite dev server
npm run build          # tsc && vite build — the type-check and the bundle
npm run test           # vitest run — the full suite, once
npm run test:watch     # vitest in watch mode
npm run preview        # serve the production build
npm run voice:generate # regenerate the bundled guide calls (dev-only, see below)
```

**`npm run build` and `npm run test` are the correctness gate.** Run both before pushing.
A CI workflow that runs them on every pull request is proposed in
[#4](https://github.com/McElyea/forward-one/issues/4); until it lands, nothing runs them
for you and a green local result is the only evidence a change works.

Note that `npm run build` *is* the type-check — `tsconfig.json` sets `"noEmit": true`, so
`tsc` validates and `vite build` produces `dist/`. `npx tsc` on its own is the fast
inner-loop check.

## Architecture invariants

**Scenes stay presentation-only; testable logic lives in plain modules.**
`src/game/rhythm/RhythmEngine.ts` (stroke judging) and `src/game/audio/guideAudio.ts`
(cache keys, voice selection) are the pattern to copy — both are framework-independent and
both have tests. `MenuScene` and `RiverScene` draw and wire input. When a change needs new
logic, put it in a plain module and call it from the scene; that is the difference between
a change that can be covered by a test and one that cannot (see Testing).

**Multiplayer goes behind `RaceAdapter`.** `src/game/race/RaceAdapter.ts` is the
solo/multiplayer boundary, and `README.md` states the intent: a hosted backend arrives as a
new adapter implementation *without* `RiverScene` changing. `SoloRaceAdapter` and
`SimulatedRaceAdapter` are the two existing implementations. If a change to race or
progress behaviour requires editing `RiverScene` to accommodate a specific backend, the
change is in the wrong place.

**Colours and text styles come from `src/game/ui/theme.ts`** — `COLORS`, `headingStyle()`,
`bodyStyle()` — not from inline literals.

**Scene coordinates are absolute against a 1280×720 design canvas.**
`src/game/startGame.ts:9-10` fixes the canvas at that size and `:14` scales it with
`Phaser.Scale.FIT`. Position new elements in that coordinate space. Never read
`window.innerWidth` / `window.innerHeight` — the canvas is not the viewport.

## Phaser lifecycle: the trap

**Phaser constructs each scene once and reuses that instance for every `scene.start()`.**
Class-field initializers therefore run exactly once, at construction — never again on a
second visit.

This means any mutable scene state must be reset in `init()`, not by a field initializer.
`RiverScene.init()` (`src/game/scenes/RiverScene.ts:73`) is the reference: it reassigns
every field it owns on entry. `MenuScene` has no `init()`, which is the cause of
[#1](https://github.com/McElyea/forward-one/issues/1) — its `levelCards` array keeps
growing each time the player returns to the put-in screen.

When adding a field to a scene, ask what its value is on the *second* `create()`. If the
answer is "whatever the last visit left there", it belongs in `init()`.

## Testing

**vitest, in the node environment.** There is no `vite.config.ts` and no `vitest.config.ts`
in this repo, and `package.json` runs a bare `vitest run` — so vitest's defaults apply:

- **Environment is `node`.** There is no DOM. A test that imports `phaser`, constructs a
  `Phaser.Scene`, or touches `window` / `document` fails at import, with an error that
  points at the import rather than at the real problem.
- **No globals.** Import everything explicitly: `import { describe, expect, it } from 'vitest'`.
- **Tests are colocated** with their source as `<Source>.test.ts` —
  `src/game/rhythm/RhythmEngine.test.ts`, `src/game/audio/guideAudio.test.ts`. There is no
  top-level `test/` tree.

The practical consequence: **to make something testable, extract it.** This is why
`getSelectedGuideVoiceId()` and `selectGuideVoice()` (`src/game/audio/guideAudio.ts:25`
and `:34`, both reading `window.localStorage`) have no coverage, while the pure helpers
beside them in the same file do. Covering the browser-dependent half would require adding
a `vite.config.ts` with `test.environment: 'jsdom'` plus the dependency — a deliberate
change, not something to slip into an unrelated PR.

**`tsc` and `vitest` never render a frame.** Neither exercises the scene lifecycle, input
handlers, audio playback, or asset loading. A change to a scene, to `startGame.ts`, or to
anything under `public/audio/` needs a manual pass in the browser on top of a green suite —
at minimum: menu → start a run → return to the menu → start a second run, which is the path
that exercises scene re-`create()`.

## The compiler is the linter

There is **no ESLint, Prettier, Biome, or any other linter or formatter** in this repo.
Nothing will reformat your code or catch style drift. What `tsconfig.json` does enforce:

- `verbatimModuleSyntax` (`:13`) — importing a type as a value is a **build error**. Use
  `import type { … }` for anything from `src/game/types.ts`.
- `noUnusedLocals` and `noUnusedParameters` (`:18-19`) — an unused import or parameter
  **fails the build**, it is not a warning. Prefix a deliberately-unused parameter with `_`,
  as `SoloRaceAdapter.update()` does.
- `erasableSyntaxOnly`, `noFallthroughCasesInSwitch`.

`"strict"` is **not** currently set; enabling it is proposed in
[#3](https://github.com/McElyea/forward-one/issues/3).

## Do not touch

- **`public/audio/`** — 4.6 MB of generated WAVs (four voices × two directions × four
  stroke counts). They are produced by `npm run voice:generate`, which downloads an 82M
  Kokoro model. Never hand-edit, re-encode, or add a clip by hand; regenerate. `kokoro-js`
  is a dev dependency and players never download the model.
- **The `sharp` override** in `package.json:23-25` — pinned to `0.35.3` for `kokoro-js`.
  Dropping it breaks voice generation.
- **`src/game/levels.ts`** — cue timing and level data are gameplay-feel decisions. Fixing
  a defect that happens to live nearby is fine; retuning the difficulty is not, unless that
  is explicitly what was asked for.

## Style

Match the file you are editing. There is no formatter, so this is enforced by nothing:

- 2-space indent
- single quotes
- **no semicolons**
- trailing commas in multi-line literals
- numeric separators for large millisecond values (`38_000`, `2_200`)
