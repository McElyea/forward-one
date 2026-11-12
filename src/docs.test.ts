import { describe, expect, it } from 'vitest'
import agentsGuide from '../AGENTS.md?raw'
import ciWorkflow from '../.github/workflows/ci.yml?raw'
import dockerfile from '../Dockerfile?raw'
import envExample from '../.env.example?raw'
import pageShell from '../index.html?raw'
import nginxConfig from '../docker/nginx.conf?raw'
import manifestSource from '../package.json?raw'
import readme from '../README.md?raw'
import tsconfigSource from '../tsconfig.json?raw'
import { MIN_RACE_PADDLERS } from './game/multiplayer/lobbyState'
import {
  DEFAULT_ROOM_CAPACITY,
  isRoomCode,
  MAX_ROOM_CAPACITY,
  MIN_ROOM_CAPACITY,
  ROOM_CAPACITY_OPTIONS,
  sanitizePlayerName,
} from './game/multiplayer/roomPolicy'
import { parseRaceRoom } from './game/multiplayer/roomProtocol'
import { RACER_COLORS, TEXT_COLORS } from './game/ui/theme'

/**
 * `README.md`, `AGENTS.md`, `package.json`, `ci.yml`, `.env.example`,
 * `index.html`, the `Dockerfile` and the nginx config describe the same project to different
 * audiences, and nothing else in the suite reads any of them. Three
 * disagreements between them had to be corrected by hand once already; these
 * assertions turn the next one into a
 * test failure rather than into a contributor running a command that no longer
 * exists — or trusting a rule the code stopped enforcing.
 *
 * What the README says about *behaviour* is checked the same way: the numbers
 * it quotes for ejection, recovery and being swept away, the keys it offers,
 * and the guide voices it lists are all read back out of the source that
 * decides them, so prose and code cannot drift apart quietly.
 *
 * Every file arrives as `?raw` text rather than through `node:fs` so that
 * nothing here needs a path resolved at runtime or the Node type definitions
 * that `tsconfig.json` deliberately keeps out of `types`.
 */

interface PackageManifest {
  engines: { node: string }
  scripts: Record<string, string>
}

const manifest = JSON.parse(manifestSource) as PackageManifest

/** The body of the first fenced block under a `## ` heading, without its fences. */
const fencedBlockUnder = (heading: string, language: string): string => {
  const newline = '\\r?\\n'
  const pattern = new RegExp(
    `## ${heading}(?:${newline})+\`\`\`${language}${newline}([\\s\\S]*?)${newline}\`\`\``,
  )
  const block = pattern.exec(readme)
  if (block === null) {
    throw new Error(`README has no \`\`\`${language} block under "## ${heading}"`)
  }
  return block[1]
}

/** The single capture of `pattern`, or an error naming what stopped being parseable. */
const soleMatch = (label: string, pattern: RegExp, text: string): string => {
  const found = pattern.exec(text)
  if (found === null) {
    throw new Error(`${label} could not be read — the format it is parsed from has changed`)
  }
  return found[1]
}

const documentedCommands = fencedBlockUnder('Commands', 'bash')
  .split('\n')
  .map((line) => /^npm run ([\w:-]+)/.exec(line))
  .filter((command): command is RegExpExecArray => command !== null)
  .map((command) => command[1])

// The tree's first line is the directory the rest of it is relative to.
const structureLines = fencedBlockUnder('Project structure', 'text')
  .split('\n')
  .filter((line) => line.trim() !== '')

const documentedPaths = structureLines
  .slice(1)
  .map((entry) => `${structureLines[0].trim()}${entry.trim().split(/\s+/)[0]}`)
  // The tree documents TypeScript modules; the glob below can only speak to
  // those, so anything else listed there is left for a human to check.
  .filter((path) => path.endsWith('.ts'))

// Globbed from `src` rather than from `src/game` so that retitling the tree's
// root line cannot quietly turn every path in it into a false report. Eager and
// raw, because the AGENTS.md citations below are checked against the text of the
// line they name, not only against the path.
const sourceText: Record<string, string> = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>('./**/*.ts', { query: '?raw', import: 'default', eager: true }),
  ).map(([path, text]) => [path.replace('./', 'src/'), text]),
)

const sourceFiles = new Set(Object.keys(sourceText))

// Globbed rather than listed one by one so that a migration added later is held
// to the same agreement without anyone remembering to add it here.
const migrationText: Record<string, string> = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>('../supabase/migrations/*.sql', {
      query: '?raw',
      import: 'default',
      eager: true,
    }),
  ).map(([path, text]) => [path.replace('../', ''), text]),
)

describe('the README stays in step with the project it documents', () => {
  it('documents every npm script', () => {
    const undocumented = Object.keys(manifest.scripts)
      .filter((script) => !documentedCommands.includes(script))

    expect(
      undocumented,
      `package.json scripts with no line in the README "Commands" block: ${undocumented.join(', ')}`,
    ).toEqual([])
  })

  it('invents no npm script', () => {
    const phantom = documentedCommands.filter((command) => !(command in manifest.scripts))

    expect(
      phantom,
      `README "Commands" lines naming scripts package.json does not define: ${phantom.join(', ')}`,
    ).toEqual([])
  })

  it('states the same Node floor as engines and CI', () => {
    const declared = soleMatch('package.json engines.node', /^>=(\d+)/, manifest.engines.node)
    const built = soleMatch('the ci.yml node-version', /node-version:\s*'?(\d+)/, ciWorkflow)
    const prose = soleMatch('the README Node sentence', /Node\.js\]\([^)]*\)\s+(\d+) or newer/, readme)

    expect(
      built,
      `ci.yml builds on Node ${built} but package.json declares engines.node ">=${declared}"`,
    ).toBe(declared)
    expect(
      prose,
      `the README asks for Node ${prose} or newer but package.json declares engines.node ">=${declared}"`,
    ).toBe(declared)
  })

  it('lists only project-structure paths that exist', () => {
    const missing = documentedPaths.filter((path) => !sourceFiles.has(path))

    expect(
      missing,
      `README "Project structure" paths that no longer exist: ${missing.join(', ')}`,
    ).toEqual([])
  })

  // The tree is where a newcomer looks for a module, and it had fallen seventeen
  // modules behind — among them `theme.ts`, `levelSelection.ts` and
  // `guideAudio.ts`, the three AGENTS.md holds up as the patterns to copy.
  it('lists every module under its root', () => {
    const root = structureLines[0].trim()
    const unlisted = [...sourceFiles]
      .filter((path) => path.startsWith(root) && !path.endsWith('.test.ts'))
      .filter((path) => !documentedPaths.includes(path))

    expect(
      unlisted,
      `modules missing from the README "Project structure": ${unlisted.join(', ')}`,
    ).toEqual([])
  })
})

/**
 * The Dockerfile is a fourth description of the same project, and the one least
 * likely to be re-read: it runs `npm run build` on a Node it names itself, so a
 * bump to `engines.node` that misses it produces an image built on a Node the
 * project no longer claims to support — and the failure, if any, surfaces at
 * deploy time rather than here.
 */
/** The number a README sentence spells out, e.g. "Three failed" -> 3. */
const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
}

const spelledNumber = (label: string, pattern: RegExp): number => {
  const word = soleMatch(label, pattern, readme).toLowerCase()
  const value = NUMBER_WORDS[word]
  if (value === undefined) {
    throw new Error(`${label} reads "${word}", which is not a number this test knows`)
  }
  return value
}

/** A `const NAME = 12` in one of the globbed sources. */
const sourceConstant = (path: string, name: string): number => {
  const text = sourceText[path]
  if (text === undefined) {
    throw new Error(`${path} is no longer where this test expects it`)
  }
  return Number(soleMatch(`${name} in ${path}`, new RegExp(`const ${name} = (\\d+)`), text))
}

describe('the README stays in step with the rules the code enforces', () => {
  const survival = 'src/game/survival/SurvivalEngine.ts'

  it('states the number of missed calls that throws the player overboard', () => {
    const documented = spelledNumber(
      'the README ejection sentence',
      /(\w+) failed obstacle calls throw the player overboard/,
    )

    expect(
      documented,
      'the README and MAX_STABILITY disagree on how much punishment a raft takes',
    ).toBe(sourceConstant(survival, 'MAX_STABILITY'))
  })

  it('states the number of calls that get a swimmer back aboard', () => {
    const documented = spelledNumber(
      'the README recovery sentence',
      /land (\w+) calls to regain the raft/,
    )

    expect(
      documented,
      'the README and RECOVERY_CALLS disagree on what it takes to get back aboard',
    ).toBe(sourceConstant(survival, 'RECOVERY_CALLS'))
  })

  it('states the number of missed recovery calls that ends the run', () => {
    const documented = spelledNumber(
      'the README swept-away sentence',
      /miss (\w+) consecutive recovery calls and the run ends/,
    )

    expect(
      documented,
      'the README and MAX_DRIFT disagree on when a swimmer is swept away',
    ).toBe(sourceConstant(survival, 'MAX_DRIFT'))
  })

  it('names the keys the river scene actually binds', () => {
    const river = sourceText['src/game/scenes/RiverScene.ts']
    if (river === undefined) throw new Error('RiverScene is no longer where this test expects it')

    const bound = new Map<string, string>()
    for (const binding of river.matchAll(/keyboard\?\.on\('keydown-([A-Z]+)', this\.(\w+)/g)) {
      bound.set(binding[1], binding[2])
    }

    // The README writes keys as a player sees them; Phaser names them its way.
    const KEY_NAMES: Record<string, string> = {
      Space: 'SPACE',
      F: 'F',
      '\u2191': 'UP',
      B: 'B',
      '\u2193': 'DOWN',
    }
    const offered = (list: string): string[] =>
      list
        .split(/,|\bor\b/)
        .map((key) => key.trim())
        .filter((key) => key !== '')
        .map((key) => {
          const named = KEY_NAMES[key]
          if (named === undefined) {
            throw new Error(`the README offers a "${key}" key this test cannot name`)
          }
          return named
        })

    const sentence = /Use ([^.]+?) for forward strokes and ([^.]+?) for backwards strokes/.exec(
      readme,
    )
    if (sentence === null) {
      throw new Error('the README controls sentence could not be read — its format has changed')
    }

    const boundTo = (handler: string): string[] =>
      [...bound.entries()]
        .filter(([, target]) => target === handler)
        .map(([key]) => key)
        .sort()

    expect(
      offered(sentence[1]).sort(),
      'the README and RiverScene disagree about the forward-stroke keys',
    ).toEqual(boundTo('onForwardPaddle'))
    expect(
      offered(sentence[2]).sort(),
      'the README and RiverScene disagree about the backwards-stroke keys',
    ).toEqual(boundTo('onBackwardPaddle'))

    expect(readme, 'the README stopped saying how to leave a run').toContain(
      'Escape pauses the run',
    )
    expect(bound.get('ESC'), 'Escape no longer opens the pause screen').toBe('togglePause')
  })
})

/**
 * `RaceAdapter` is the solo/multiplayer boundary, and both guides describe it by
 * naming the classes behind it. The README once dropped that description when
 * the hosted adapter landed, while `AGENTS.md` went on citing the README for it,
 * so an adapter added later has to be named in both before the suite is green.
 */
describe('the guides name every race adapter behind the boundary', () => {
  const adapters = Object.entries(sourceText)
    .filter(([path]) => !path.endsWith('.test.ts'))
    .flatMap(([path, text]) =>
      [...text.matchAll(/export class (\w+) implements RaceAdapter\b/g)].map((found) => ({
        path,
        name: found[1],
      })),
    )

  it('can still find the implementations', () => {
    expect(
      adapters.length,
      'no `export class … implements RaceAdapter` could be read — the format has changed',
    ).toBeGreaterThan(0)
  })

  it('lists every implementation in the README project structure', () => {
    const unlisted = adapters
      .filter((adapter) => !documentedPaths.includes(adapter.path))
      .map((adapter) => adapter.path)

    expect(
      unlisted,
      `RaceAdapter implementations missing from the README "Project structure": ${unlisted.join(', ')}`,
    ).toEqual([])
  })

  it('names every implementation in the README and AGENTS.md', () => {
    const guides: Record<string, string> = { 'README.md': readme, 'AGENTS.md': agentsGuide }
    for (const [guide, text] of Object.entries(guides)) {
      const unnamed = adapters
        .filter((adapter) => !new RegExp(`\\b${adapter.name}\\b`).test(text))
        .map((adapter) => adapter.name)

      expect(
        unnamed,
        `${guide} never names these RaceAdapter implementations: ${unnamed.join(', ')}`,
      ).toEqual([])
    }
  })
})

describe('the README stays in step with the guide voices that ship', () => {
  const guideAudio = sourceText['src/game/audio/guideAudio.ts']

  it('names every bundled voice', () => {
    if (guideAudio === undefined) throw new Error('guideAudio.ts moved')
    const shipped = [...guideAudio.matchAll(/name: '(\w+)'/g)].map((voice) => voice[1])

    expect(shipped.length, 'no voice names could be read from guideAudio.ts').toBeGreaterThan(0)
    for (const name of shipped) {
      expect(readme, `the README does not mention the ${name} guide voice`).toContain(name)
    }
  })

  it('names the same default the code falls back to', () => {
    if (guideAudio === undefined) throw new Error('guideAudio.ts moved')
    const defaultId = soleMatch(
      'DEFAULT_GUIDE_VOICE_ID',
      /DEFAULT_GUIDE_VOICE_ID: GuideVoiceId = '(\w+)'/,
      guideAudio,
    )
    const defaultName = soleMatch(
      `the ${defaultId} entry in GUIDE_VOICES`,
      new RegExp(`id: '${defaultId}', name: '(\\w+)'`),
      guideAudio,
    )
    const documented = soleMatch(
      'the README default-voice sentence',
      /with (\w+) as the default/,
      readme,
    )

    expect(
      documented,
      `the README calls ${documented} the default guide voice, the code falls back to ${defaultName}`,
    ).toBe(defaultName)
  })
})

describe('the container image stays in step with the project it builds', () => {
  it('serves on the port the README tells a reader to open', () => {
    const listening = soleMatch('the nginx listen directive', /listen\s+(\d+)/, nginxConfig)
    const documented = soleMatch(
      'the README container port sentence',
      /The server listens on \*\*(\d+)\*\*/,
      readme,
    )

    expect(
      documented,
      `the README sends a reader to port ${documented} but nginx listens on ${listening}`,
    ).toBe(listening)
  })

  it('exposes and health-checks the port nginx listens on', () => {
    const listening = soleMatch('the nginx listen directive', /listen\s+(\d+)/, nginxConfig)
    const exposed = soleMatch('the Dockerfile EXPOSE line', /^EXPOSE (\d+)/m, dockerfile)
    const probed = soleMatch(
      'the Dockerfile HEALTHCHECK command',
      /CMD wget[^\n]*http:\/\/127\.0\.0\.1:(\d+)\//,
      dockerfile,
    )

    expect(
      exposed,
      `the image exposes ${exposed} but nginx listens on ${listening}`,
    ).toBe(listening)
    expect(
      probed,
      `the healthcheck probes ${probed} but nginx listens on ${listening}`,
    ).toBe(listening)
  })

  it('health-checks a path nginx actually answers', () => {
    const path = soleMatch(
      'the Dockerfile HEALTHCHECK path',
      /CMD wget[^\n]*http:\/\/127\.0\.0\.1:\d+(\/\S*)/,
      dockerfile,
    )

    // An exact-match block, not a substring: `location = /healthz` contains
    // `location = /health`, so `toContain` would pass on a healthcheck that
    // fetches a path nginx never answers.
    const exactBlock = new RegExp(
      `location\\s*=\\s*${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{`,
    )

    expect(
      exactBlock.test(nginxConfig),
      `the healthcheck fetches ${path}, which nginx has no location block for`,
    ).toBe(true)
  })

  it('builds on the Node major that engines declares', () => {
    const declared = soleMatch('package.json engines.node', /^>=(\d+)/, manifest.engines.node)
    const image = soleMatch('the Dockerfile build stage', /^FROM node:(\d+)/m, dockerfile)

    expect(
      image,
      `the Dockerfile builds on Node ${image} but package.json declares engines.node ">=${declared}"`,
    ).toBe(declared)
  })
})

/**
 * A `VITE_*` value is named in five places: the source that reads it, the
 * `.env.example` a developer copies, the Dockerfile's `ARG` and `ENV` lines that
 * carry it into `npm run build`, and the README's `docker build` example. Vite
 * substitutes an unset key with `undefined` and says nothing, so a key renamed in
 * one of them builds cleanly and ships a bundle that quietly falls back to the
 * simulated race. Each list is read back here and held to the keys the code reads.
 */
describe('every build-time variable the code reads is one the setup supplies', () => {
  const sorted = (keys: Iterable<string>): string[] => [...new Set(keys)].sort()

  const readKeys = sorted(
    Object.entries(sourceText)
      .filter(([path]) => !path.endsWith('.test.ts'))
      .flatMap(([, text]) =>
        [...text.matchAll(/import\.meta\.env\.(VITE_\w+)/g)].map((read) => read[1]),
      ),
  )

  it('can still find the keys the code reads', () => {
    expect(readKeys.length, 'no import.meta.env.VITE_* read could be found — the format has changed').toBeGreaterThan(0)
  })

  it('lists every key in .env.example, and no other', () => {
    const listed = sorted([...envExample.matchAll(/^(VITE_\w+)=/gm)].map((line) => line[1]))

    expect(listed, '.env.example and the keys src/ reads have drifted apart').toEqual(readKeys)
  })

  it('declares a build argument for every key, and no other', () => {
    const declared = sorted([...dockerfile.matchAll(/^ARG (VITE_\w+)=/gm)].map((line) => line[1]))

    expect(declared, 'the Dockerfile ARG lines and the keys src/ reads have drifted apart').toEqual(readKeys)
  })

  it('hands each build argument to the build under its own name', () => {
    const exported = [...dockerfile.matchAll(/(VITE_\w+)=\$(\w+)/g)]
    const renamed = exported
      .filter(([, key, argument]) => key !== argument)
      .map(([, key, argument]) => `${key}=$${argument}`)

    expect(renamed, `ENV lines that read a different argument: ${renamed.join(', ')}`).toEqual([])
    expect(
      sorted(exported.map(([, key]) => key)),
      'the Dockerfile ENV lines and the keys src/ reads have drifted apart',
    ).toEqual(readKeys)
  })

  it('shows every key in the README docker build example, and no other', () => {
    const shown = sorted([...readme.matchAll(/--build-arg (VITE_\w+)=/g)].map((flag) => flag[1]))

    expect(shown, 'the README --build-arg flags and the keys src/ reads have drifted apart').toEqual(readKeys)
  })
})

/**
 * `AGENTS.md` points at the source it describes, and its opening paragraph
 * promises that every claim in it was verified against what it cites.
 *
 * Citations name a file and not a line in it. Line numbers rotted without anyone
 * touching the guide — an import added to `RiverScene` moved every declaration
 * below it, and four of five consecutive edits to this file were a number nobody
 * reviewed. Two citations had gone stale before the check existed at all.
 *
 * What is checkable here is narrower than "the claim is true": a cited path has
 * to exist, and one of the identifiers the citing sentence names in backticks has
 * to appear somewhere in it. This replaces none of the reading — it only stops the
 * drift that nobody would notice.
 *
 * A bare filename naming a file the repo does not have — `vite.config.ts`, which
 * the guide mentions precisely because it is absent — is a mention rather than a
 * citation, so only paths into the tree are held to existing.
 *
 * The sentence is taken to be the one line of `AGENTS.md` the citation sits on,
 * which asks one thing of whoever writes the next citation: keep it on the same
 * line as the symbol it points at, rather than wrapping between them.
 */

/** The files `AGENTS.md` cites, keyed the way it writes their paths. */
const citableText: Record<string, string> = {
  ...sourceText,
  'package.json': manifestSource,
  'README.md': readme,
  Dockerfile: dockerfile,
  '.github/workflows/ci.yml': ciWorkflow,
  'tsconfig.json': tsconfigSource,
}

interface Citation {
  file: string
  /** The line the citation sits on, whose other backticks name what it points at. */
  sentence: string
}

const CITATIONS = /`([\w./-]+\.(?:ts|json|yml|md|css|mjs))`/g
const IS_CITATION = /^[\w./-]+\.(?:ts|json|yml|md|css|mjs)$/

const citations: Citation[] = agentsGuide.split('\n').flatMap((line) =>
  [...line.matchAll(CITATIONS)].map((cited) => ({ file: cited[1], sentence: line })),
)

/** The identifiers a citing line names in backticks, the citation itself aside. */
const identifiersNamedOn = (sentence: string): string[] =>
  [...sentence.matchAll(/`([^`]+)`/g)]
    .map((span) => span[1])
    .filter((span) => !IS_CITATION.test(span))
    .flatMap((span) => span.split(/[^A-Za-z0-9_]+/))
    // Two characters and under match almost any line of code by accident.
    .filter((identifier) => identifier.length > 2)

describe('AGENTS.md still cites the source it describes', () => {
  it('cites files that exist', () => {
    expect(
      citations.length,
      'AGENTS.md has no `path` citations — the format they are parsed from has changed',
    ).toBeGreaterThan(0)

    // A bare filename can be a mention rather than a citation — the guide names
    // `vite.config.ts` precisely because the repo does not have one. This file is
    // excluded because it cannot glob-import itself, and it plainly exists: it is
    // the thing running.
    const missing = citations
      .filter((citation) => citation.file.includes('/') && citation.file !== 'src/docs.test.ts')
      .filter((citation) => !(citation.file in citableText))
      .map((citation) => citation.file)

    expect(
      missing,
      `AGENTS.md citations naming a file that does not exist: ${missing.join(', ')}`,
    ).toEqual([])
  })

  it('cites files that name what the sentence around them names', () => {
    const stale = citations
      .filter((citation) => {
        // Absent files are the assertion above; reporting them twice helps nobody.
        if (!(citation.file in citableText)) return false

        const named = identifiersNamedOn(citation.sentence)
        // A path named with nothing else in backticks points at the file itself.
        if (named.length === 0) return false

        const cited = citableText[citation.file]

        // Whole words only. Searching a file rather than a line makes a bare
        // substring far too easy to hit by accident — `init` is in `initial`.
        return !named.some((identifier) => new RegExp(`\\b${identifier}\\b`).test(cited))
      })
      .map((citation) => citation.file)

    expect(
      stale,
      `AGENTS.md citations naming a file that no longer mentions ` +
        `anything the citing sentence names: ${stale.join(', ')}`,
    ).toEqual([])
  })
})

/**
 * `src/game/levels.ts` decides which rivers exist; the multiplayer schema repeats
 * those ids as literal lists, in a table constraint and in every function that
 * takes a level. Nothing tied the two together, so a fifth level would have been
 * selectable on the put-in screen, playable solo, and rejected by the database on
 * every online path — with a green build and a green suite.
 */
describe('the multiplayer schema stays in step with the levels that ship', () => {
  const levels = sourceText['src/game/levels.ts']

  const shippedIds = [...(levels ?? '').matchAll(/^\s+id: '([\w-]+)',$/gm)]
    .map((level) => level[1])
    .sort()

  const schemaLists = Object.entries(migrationText).flatMap(([path, sql]) =>
    [...sql.matchAll(/level_id (?:not )?in \(([^)]*)\)/g)].map((list) => ({
      path,
      ids: [...list[1].matchAll(/'([^']+)'/g)].map((id) => id[1]).sort(),
    })),
  )

  it('can still read the ids from both sides', () => {
    if (levels === undefined) throw new Error('levels.ts moved')

    expect(shippedIds.length, 'no level ids could be read from levels.ts').toBeGreaterThan(0)
    expect(
      schemaLists.length,
      'no level_id list could be read from supabase/migrations — the format has changed',
    ).toBeGreaterThanOrEqual(4)
  })

  it('accepts exactly the levels the game ships, everywhere it checks', () => {
    for (const list of schemaLists) {
      expect(
        list.ids,
        `${list.path} accepts [${list.ids.join(', ')}] but levels.ts ships [${shippedIds.join(', ')}]`,
      ).toEqual(shippedIds)
    }
  })
})

/**
 * Every capture group of `pattern` (which must be global) across the migrations,
 * oldest file first, so that the last entry is the definition a replayed schema
 * ends up with.
 */
const schemaCaptures = (label: string, pattern: RegExp): string[][] => {
  const found = Object.keys(migrationText)
    .sort()
    .flatMap((path) => [...migrationText[path].matchAll(pattern)].map((match) => match.slice(1)))
  if (found.length === 0) {
    throw new Error(`${label} could not be read from supabase/migrations — the format has changed`)
  }
  return found
}

/** The first capture of the newest place `pattern` matches, for a redefined object. */
const latestCapture = (label: string, pattern: RegExp): string => {
  const found = schemaCaptures(label, pattern)
  return found[found.length - 1][0]
}

/**
 * The same rule the level ids obey holds for everything else a room is made of:
 * the browser and the database each enforce their half, and neither build reads
 * the other. A client that disagrees with the schema compiles, passes its own
 * unit tests, plays solo, and fails only on a live project — where the player
 * sees a Postgres exception, or a room code no invite can reach.
 */
describe('the multiplayer schema stays in step with the rules the client applies', () => {
  const allocatedMember = { playerId: 'host-id', name: 'HOST', colorIndex: 0 }
  const allocatedRoom = {
    id: 'room-id',
    code: 'RAFT23',
    levelId: 'class-ii',
    maxPlayers: DEFAULT_ROOM_CAPACITY,
    hostPlayerId: 'host-id',
    matchmaking: false,
    state: 'lobby',
    serverNow: '2026-08-19T11:59:57.000Z',
    startsAt: null,
    members: [allocatedMember],
  }

  it('bounds room capacity where validateRoomCapacity does', () => {
    const bounds = schemaCaptures(
      'the room capacity bounds',
      /max_players (?:not )?between (\d+) and (\d+)/g,
    )

    for (const bound of bounds) {
      expect(
        bound,
        `the schema bounds capacity at ${bound.join('-')}, the client at ` +
          `${MIN_ROOM_CAPACITY}-${MAX_ROOM_CAPACITY}`,
      ).toEqual([String(MIN_ROOM_CAPACITY), String(MAX_ROOM_CAPACITY)])
    }
  })

  it('defaults room capacity to DEFAULT_ROOM_CAPACITY', () => {
    const defaults = schemaCaptures(
      'the room capacity default',
      /max_players smallint (?:not null )?default (\d+)/g,
    )

    for (const [capacity] of defaults) {
      expect(capacity, 'the schema and roomPolicy.ts default a room to different sizes').toBe(
        String(DEFAULT_ROOM_CAPACITY),
      )
    }
  })

  it('needs the number of paddlers canStartRace needs', () => {
    // The host's start check, and the count that opens a quick-match countdown.
    const minimums = schemaCaptures(
      'the minimum paddler count',
      /member_count (?:<|>=) (\d+)/g,
    )

    for (const [paddlers] of minimums) {
      expect(paddlers, 'the schema and lobbyState.ts need different numbers of paddlers').toBe(
        String(MIN_RACE_PADDLERS),
      )
    }
  })

  it('stores paddler names of the length sanitizePlayerName produces', () => {
    const longest = sanitizePlayerName('x'.repeat(100)).length
    const limits = schemaCaptures(
      'the paddler name length',
      /player_name\)+ (?:not )?between (\d+) and (\d+)/g,
    )

    for (const limit of limits) {
      expect(
        limit,
        `the schema takes names of ${limit.join('-')} characters, the client cuts them at ${longest}`,
      ).toEqual(['1', String(longest)])
    }
  })

  it('checks room codes against the pattern the client validates with', () => {
    const client = soleMatch(
      'ROOM_CODE in roomPolicy.ts',
      /const ROOM_CODE = \/(.+)\/$/m,
      sourceText['src/game/multiplayer/roomPolicy.ts'],
    )

    expect(latestCapture('the room code constraint', /\(code ~ '([^']+)'\)/g)).toBe(client)
  })

  it('generates exactly the room codes the client accepts', () => {
    const alphabet = latestCapture(
      'the room code alphabet',
      /alphabet constant text := '(\w+)'/g,
    )
    const length = Number(
      latestCapture('the room code length', /for position in 1\.\.(\d+) loop/g),
    )

    const accepted = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789']
      .filter((character) => isRoomCode(character.repeat(length)))

    expect(
      accepted.sort(),
      'new_race_room_code() and isRoomCode() disagree about what a room code is',
    ).toEqual([...alphabet].sort())
  })

  it('hands out one colour index for each racer colour', () => {
    const [firstColor, lastColor] = schemaCaptures(
      'the color_index constraint',
      /color_index between (\d+) and (\d+)/g,
    )[0]

    expect(
      [firstColor, lastColor],
      'the schema allows a colour index RACER_COLORS has no entry for, or wastes one',
    ).toEqual(['0', String(RACER_COLORS.length - 1)])

    for (const [wrap] of schemaCaptures('the colour index wrap', /member_count % (\d+)/g)) {
      expect(wrap, 'room colours wrap at a size other than RACER_COLORS').toBe(
        String(RACER_COLORS.length),
      )
    }
  })

  it('stores only room states parseRaceRoom accepts', () => {
    const states = [
      ...latestCapture(
        'the room state constraint',
        /default 'lobby' check \(state in \(([^)]*)\)\)/g,
      ).matchAll(/'([^']+)'/g),
    ].map((state) => state[1])

    expect(states.length, 'no room state could be read from the constraint').toBeGreaterThan(0)
    for (const state of states) {
      expect(
        () => parseRaceRoom({ ...allocatedRoom, state }),
        `the schema allows a room state of ${state}, which every client refuses`,
      ).not.toThrow()
    }
  })

  // Only the newest definition counts: the first migration's payload predates
  // `matchmaking`, which is exactly the shape of the drift this is here to catch.
  // The parse is what ties this to `parseRaceRoom` — a field it starts to require
  // has to join the object above, and then this comparison, before going green.
  it('answers with the fields parseRaceRoom reads', () => {
    const payload = latestCapture(
      'the race_room_payload definition',
      /function public\.race_room_payload\(p_room_id uuid\)[\s\S]*?\$\$([\s\S]*?)\$\$/g,
    )
    const answered = [...payload.matchAll(/'(\w+)', /g)].map((field) => field[1]).sort()

    expect(() => parseRaceRoom(allocatedRoom)).not.toThrow()
    expect(answered, 'race_room_payload and parseRaceRoom describe different rooms').toEqual(
      [...Object.keys(allocatedRoom), ...Object.keys(allocatedMember)].sort(),
    )
  })

  it('leaves a paddler a missed heartbeat before giving their place away', () => {
    const heartbeatMs = Number(
      soleMatch(
        'ROOM_HEARTBEAT_MS',
        /const ROOM_HEARTBEAT_MS = ([\d_]+)/,
        sourceText['src/game/multiplayer/SupabaseRoomConnection.ts'],
      ).replaceAll('_', ''),
    )
    const staleAfterSeconds = schemaCaptures(
      'the stale paddler windows',
      /_seen_at < now\(\) - interval '(\d+) seconds'/g,
    ).map(([seconds]) => Number(seconds))

    expect(
      heartbeatMs * 2,
      'one lost heartbeat is enough for the schema to evict a paddler or replace a host',
    ).toBeLessThanOrEqual(Math.min(...staleAfterSeconds) * 1_000)
  })
})

/**
 * The README quotes three multiplayer numbers a host plans around — how big a
 * room starts and how far it grows, how many racers the rail keeps, and how long
 * a room lives — and each is decided somewhere the README never reads: the menu's
 * capacity options, a constant in `RiverScene`, and a column default in the
 * schema.
 */
describe('the README stays in step with the multiplayer numbers it quotes', () => {
  it('offers the room sizes the menu offers, starting from the default', () => {
    const sentence = /online rooms start at (\w+) seats and can be expanded to ([^;.]+)/.exec(
      readme,
    )
    if (sentence === null) {
      throw new Error('the README room-size sentence could not be read — its format has changed')
    }
    const startsAt = NUMBER_WORDS[sentence[1].toLowerCase()]
    if (startsAt === undefined) {
      throw new Error(
        `the README room size reads "${sentence[1]}", which is not a number this test knows`,
      )
    }
    const expandsTo = sentence[2]
      .split(/,|\bor\b/)
      .map((size) => size.trim())
      .filter((size) => size !== '')
      .map(Number)

    expect(startsAt, 'the README and roomPolicy.ts start a room at different sizes').toBe(
      DEFAULT_ROOM_CAPACITY,
    )
    expect(
      [startsAt, ...expandsTo],
      'the README and ROOM_CAPACITY_OPTIONS offer different room sizes',
    ).toEqual([...ROOM_CAPACITY_OPTIONS])
  })

  it('keeps as many racers on the rail as the river scene draws', () => {
    const documented = spelledNumber(
      'the README rail sentence',
      /the in-race rail shows at most (\w+) useful positions/,
    )

    expect(
      documented,
      'the README and MAX_VISIBLE_RAIL_RACERS disagree on how crowded the rail gets',
    ).toBe(sourceConstant('src/game/scenes/RiverScene.ts', 'MAX_VISIBLE_RAIL_RACERS'))
  })

  it('expires rooms when the schema does', () => {
    const documented = spelledNumber(
      'the README room-expiry sentence',
      /race rooms themselves expire after (\w+) hours/,
    )
    const lifetimes = schemaCaptures(
      'the room lifetime',
      /expires_at timestamptz (?:not null )?default now\(\) \+ interval '(\d+) hours'/g,
    )

    for (const [hours] of lifetimes) {
      expect(hours, 'the README and the schema give a room different lifetimes').toBe(
        String(documented),
      )
    }
  })
})

/**
 * `supabase-js` takes a function name and its arguments as plain strings and a
 * plain object, so a misspelling is checked by nothing until PostgREST answers
 * that no such function exists. Each call the client makes is read back here and
 * held to the signature the migrations leave behind.
 */
describe('every RPC the client calls is one the schema offers', () => {
  const rpcCalls = Object.entries(sourceText)
    .filter(([path]) => !path.endsWith('.test.ts'))
    .flatMap(([path, text]) =>
      [...text.matchAll(/\.rpc\('(\w+)'(?:, \{([^}]*)\})?/g)].map((call) => ({
        path,
        name: call[1],
        args: [...(call[2] ?? '').matchAll(/(\w+):/g)].map((arg) => arg[1]),
      })),
    )

  it('can still find the calls', () => {
    expect(rpcCalls.length, 'no .rpc() call could be read — the format has changed').toBeGreaterThan(0)
  })

  it('calls functions that exist, with the arguments they take', () => {
    // A later `create or replace` overwrites the entry, as it does in the database.
    const functions = new Map(
      schemaCaptures(
        'the schema functions',
        /create (?:or replace )?function public\.(\w+)\(([^)]*)\)/g,
      ).map(([name, parameters]) => [
        name,
        parameters
          .split(',')
          .map((parameter) => parameter.trim())
          .filter((parameter) => parameter !== '')
          .map((parameter) => ({
            name: parameter.split(/\s+/)[0],
            optional: /\sdefault\s/.test(parameter),
          })),
      ]),
    )

    for (const call of rpcCalls) {
      const declared = functions.get(call.name)
      if (declared === undefined) {
        throw new Error(`${call.path} calls ${call.name}, which no migration defines`)
      }

      const unknown = call.args.filter(
        (arg) => !declared.some((parameter) => parameter.name === arg),
      )
      const omitted = declared
        .filter((parameter) => !parameter.optional && !call.args.includes(parameter.name))
        .map((parameter) => parameter.name)

      expect(unknown, `${call.name} does not take these arguments: ${unknown.join(', ')}`).toEqual([])
      expect(omitted, `${call.name} needs these arguments too: ${omitted.join(', ')}`).toEqual([])
    }
  })

  // The migrations revoke each function from `public`, so one that is never granted
  // back exists, matches its call, and refuses every signed-in paddler.
  it('calls only functions granted to signed-in paddlers', () => {
    const granted = schemaCaptures(
      'the function grants',
      /grant execute on function public\.(\w+)\([^)]*\) to authenticated/g,
    ).map(([name]) => name)

    const refused = rpcCalls.map((call) => call.name).filter((name) => !granted.includes(name))

    expect(refused, `RPCs the client calls without a grant: ${refused.join(', ')}`).toEqual([])
  })
})

/**
 * `index.html` is the one file every player loads and the one nothing else in the
 * suite reads. It names the element the game mounts on, the module that boots it,
 * and the colour the browser paints its chrome — each of which is repeated in the
 * source, and none of which `tsc` can see across the HTML boundary. A renamed
 * mount throws at boot, a moved entry builds a page with no game on it, and a
 * re-inked theme leaves a strip of the old colour around the canvas.
 */
describe('the page shell stays in step with the game it boots', () => {
  const sourceOf = (path: string): string => {
    const text = sourceText[path]
    if (text === undefined) {
      throw new Error(`${path} is no longer where this test expects it`)
    }
    return text
  }

  it('mounts the game on the element the page provides', () => {
    const provided = soleMatch('the index.html mount element', /<div id="([\w-]+)"/, pageShell)
    const queried = soleMatch(
      'the main.ts mount selector',
      /querySelector<\w+>\('#([\w-]+)'\)/,
      sourceOf('src/main.ts'),
    )

    expect(
      queried,
      `main.ts mounts the game on #${queried} but index.html provides #${provided}`,
    ).toBe(provided)
  })

  it('loads an entry module that exists', () => {
    const entry = soleMatch(
      'the index.html entry script',
      /<script type="module" src="\/([^"]+)"/,
      pageShell,
    )

    expect(sourceFiles.has(entry), `index.html loads /${entry}, which is not in the tree`).toBe(true)
  })

  it('paints the browser chrome and the canvas in the theme ink', () => {
    const chrome = soleMatch(
      'the index.html theme-color',
      /<meta name="theme-color" content="(#[0-9a-fA-F]{6})"/,
      pageShell,
    )
    const canvas = soleMatch(
      'the startGame.ts backgroundColor',
      /backgroundColor: '(#[0-9a-fA-F]{6})'/,
      sourceOf('src/game/startGame.ts'),
    )

    expect(
      chrome.toLowerCase(),
      `index.html paints the browser chrome ${chrome} but the theme ink is ${TEXT_COLORS.ink}`,
    ).toBe(TEXT_COLORS.ink)
    expect(
      canvas.toLowerCase(),
      `startGame.ts clears the canvas to ${canvas} but the theme ink is ${TEXT_COLORS.ink}`,
    ).toBe(TEXT_COLORS.ink)
  })
})

/**
 * The gate is named in three places besides the workflow that runs it: the README
 * tells a contributor what CI runs, `AGENTS.md` tells an agent which commands
 * decide whether a change may land, and the Dockerfile runs the build half of it
 * so that a tree failing the gate cannot produce an image. A step dropped from
 * `ci.yml` would leave all three describing a check nobody performs.
 */
describe('the gate the guides describe is the gate CI and the image run', () => {
  const ciSteps = [...ciWorkflow.matchAll(/^\s*- run: (.+)$/gm)].map((step) => step[1].trim())

  it('runs exactly the steps the README says CI runs, in order', () => {
    const sentence = soleMatch(
      'the README CI sentence',
      /Every push to `main` and every pull request runs ([^\n]*?) on Node/,
      readme,
    )
    const documented = [...sentence.matchAll(/`([^`]+)`/g)].map((command) => command[1])

    expect(
      ciSteps,
      `ci.yml runs ${ciSteps.join(', ')} but the README says ${documented.join(', ')}`,
    ).toEqual(documented)
  })

  it('runs every command AGENTS.md names as the correctness gate', () => {
    const gate = /\*\*`(npm run [\w:-]+)` and `(npm run [\w:-]+)` are the correctness gate\.\*\*/
      .exec(agentsGuide)
    if (gate === null) {
      throw new Error('the AGENTS.md gate sentence could not be read — the format it is parsed from has changed')
    }
    const skipped = gate.slice(1).filter((command) => !ciSteps.includes(command))

    expect(skipped, `AGENTS.md gate commands ci.yml never runs: ${skipped.join(', ')}`).toEqual([])
  })

  // AGENTS.md: the build stage needs `tsc` and `vite`, which are devDependencies,
  // so `npm ci --omit=dev` there breaks the image rather than slimming it.
  it('builds the image with the full install and the gate build', () => {
    const steps = [...dockerfile.matchAll(/^RUN (npm [^\n]+)$/gm)].map((step) => step[1].trim())

    expect(steps, `the Dockerfile build stage runs ${steps.join(', ')}`).toEqual([
      'npm ci',
      'npm run build',
    ])
  })
})
