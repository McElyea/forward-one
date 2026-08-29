import { describe, expect, it } from 'vitest'
import agentsGuide from '../AGENTS.md?raw'
import ciWorkflow from '../.github/workflows/ci.yml?raw'
import dockerfile from '../Dockerfile?raw'
import nginxConfig from '../docker/nginx.conf?raw'
import manifestSource from '../package.json?raw'
import readme from '../README.md?raw'
import tsconfigSource from '../tsconfig.json?raw'

/**
 * `README.md`, `AGENTS.md`, `package.json`, `ci.yml`, the `Dockerfile` and the
 * nginx config describe the same project to different audiences, and nothing
 * else in the suite reads any of them. Three disagreements between them had to
 * be corrected by hand once already; these assertions turn the next one into a
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
