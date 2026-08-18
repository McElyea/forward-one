# Working on Forward One

Notes for anyone — human or automated — making changes here. `README.md` covers what the
game is and how to run it; this file covers the constraints that decide whether a change
compiles, and the ones where the obvious first attempt is wrong.

Everything below was verified against the source it cites. When a claim and the code
disagree, the code is right and this file is a bug. The `file:line` citations are held to
that by `src/docs.test.ts`: a cited line that stops naming what the line citing it names
fails the suite, rather than waiting for someone to re-read this file. Write a citation on
the same line as the symbol it points at, so that check can see both.

## The gate

`README.md` lists every script; this section is only about which of them decide whether a
change is allowed to land.

```bash
npx tsc          # type-check alone — the fast inner-loop check
npm run build    # tsc && vite build
npm run test     # vitest run
```

**`npm run build` and `npm run test` are the correctness gate.** Run both before pushing.
`.github/workflows/ci.yml` runs the same two commands on every pull request and on every
push to `main`, so the hosted `CI / build` check is the authoritative signal — but it tells
you nothing you could not have learned locally in a few seconds first.

`npm run build` *is* the type-check: `tsconfig.json` sets `"noEmit": true` (`:15`), so `tsc`
validates and `vite build` is what actually produces `dist/`.

`Dockerfile` runs that same `npm run build` on `node:22-alpine` and serves the resulting
`dist/` with nginx, so a tree that fails the gate cannot produce an image either. Two things
about it are easy to get wrong: the Node major in its `FROM` line has to match
`engines.node`, which `src/docs.test.ts` now fails on rather than leaving to review; and the
build stage runs `npm ci`, not `npm ci --omit=dev`, because `tsc` and `vite` are
devDependencies — dropping them to slim the *build* stage breaks it, and the stage is
discarded anyway.

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

**Nothing is positioned with a literal coordinate. Ask `ui/layout.ts` instead.**
The canvas is sized to the viewport (`Phaser.Scale.RESIZE`, `src/game/startGame.ts:16`), so
**one game unit is one CSS pixel** — a 44-unit button really is 44px under the player's
thumb. `src/game/ui/layout.ts` turns `(width, height)` into named regions (`river`, `rail`,
`rhythmLane`, `controls`, …) and a type scale, with separate portrait and landscape
profiles. It is pure arithmetic and imports nothing, so its behaviour is pinned by
`layout.test.ts` against a matrix of real device viewports.

Two rules follow:

- **Add to the layout, don't inline a number.** A new element needs a rect or point in
  `layout.ts` and a test asserting it stays on screen and, if it is interactive, that it
  clears `MIN_TOUCH_PX`. Decorative work inside a region should be expressed as fractions
  of that region — see the normalised bank outlines at the top of `RiverScene.ts`.
- **Handle re-layout, because rotating a phone fires it mid-run.** `MenuScene` holds no run
  state, so it restarts on resize, carrying the chosen level through `init(data)`.
  `RiverScene` cannot restart without throwing the run away, so every object registers a
  placement closure via its `onLayout()` helper; a resize re-runs them all. That array is
  reset in `init()` like any other scene state.

Never read `window.innerWidth` / `window.innerHeight` — take the size from `this.scale`.

## Phaser lifecycle: the trap

**Phaser constructs each scene once and reuses that instance for every `scene.start()`.**
Class-field initializers therefore run exactly once, at construction — never again on a
second visit.

This means any mutable scene state must be reset in `init()`, not by a field initializer.
`RiverScene.init()` (`src/game/scenes/RiverScene.ts:115`) is the reference: it reassigns
every field it owns on entry, down to the `layoutAppliers` array of placement closures.
`MenuScene.init()` (`src/game/scenes/MenuScene.ts:44`) does the same for the put-in screen.

`MenuScene` is also the worked example of what happens without one. It had no `init()` until
[#11](https://github.com/McElyea/forward-one/pull/11), so `create()` pushed four more level
cards onto the same array on every visit and the code that read a level back by card position
threw from the fifth card on — [#1](https://github.com/McElyea/forward-one/issues/1), which
made the game one run per page load. The fix was both halves: clear the per-visit state
in `init()`, and stop correlating two arrays by position (`src/game/ui/levelSelection.ts`).

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
`getSelectedGuideVoiceId()` and `selectGuideVoice()` (`src/game/audio/guideAudio.ts:23`
and `:32`, both reading `window.localStorage`) have no coverage, while the pure helpers
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
- `noUnusedLocals` and `noUnusedParameters` (`:19-20`) — an unused import or parameter
  **fails the build**, it is not a warning. Prefix a deliberately-unused parameter with `_`,
  as `SoloRaceAdapter.recordStroke()` does.
- `erasableSyntaxOnly` (`:21`) — rejects any TypeScript syntax that emits runtime code. In
  practice that means **constructor parameter properties**: `constructor(private readonly
  levels: …)` fails to compile. Declare the field and assign it in the body instead.
- `noFallthroughCasesInSwitch`.
- `strict` (`:18`) — `strictNullChecks`, `noImplicitAny` and the rest are on. Fix a strict
  error by narrowing, not with `!`, `as any`, or `@ts-expect-error`.

`noUncheckedIndexedAccess` is **not** set, which is why an unguarded array access compiles
here. `npx tsc --noUncheckedIndexedAccess` lists what turning it on would report — read that
list before assuming an index is safe, and enable the flag only as a change of its own.

## Do not touch

- **`public/audio/`** — 4.6 MB of generated WAVs (four voices × two directions × four
  stroke counts). They are produced by `npm run voice:generate`, which downloads an 82M
  Kokoro model. Never hand-edit, re-encode, or add a clip by hand; regenerate. `kokoro-js`
  is a dev dependency and players never download the model.
- **The `sharp` override** in `package.json:26-28` — pinned to `0.35.3` for `kokoro-js`.
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
