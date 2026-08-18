import { describe, expect, it } from 'vitest'
import agentsGuide from '../AGENTS.md?raw'
import ciWorkflow from '../.github/workflows/ci.yml?raw'
import dockerfile from '../Dockerfile?raw'
import manifestSource from '../package.json?raw'
import readme from '../README.md?raw'

/**
 * `README.md`, `package.json`, and `ci.yml` describe the same project to three
 * different audiences, and nothing else in the suite reads any of them. Three
 * disagreements between them had to be corrected by hand once already; these
 * assertions turn the next one into a test failure rather than into a
 * contributor running a command that no longer exists.
 *
 * The three files arrive as `?raw` text rather than through `node:fs` so that
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
describe('the container image stays in step with the project it builds', () => {
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
 * `AGENTS.md` points at the source it describes as `path:line`, and its opening
 * paragraph promises that every claim in it was verified against what it cites.
 * Line numbers are the half of that promise that rots without anyone touching the
 * file: a field added to a scene moves every declaration below it, and nothing
 * re-reads the guide. Two of its citations had gone stale before this was written.
 *
 * What is checkable here is narrower than "the claim is true": the file has to
 * exist, the lines have to be in range, and one of the identifiers the citing
 * sentence names in backticks has to appear on one of them. A citation that slides
 * onto a different line still mentioning the same symbol passes, so this replaces
 * none of the reading — it only stops the drift that nobody would notice.
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
}

interface Citation {
  file: string
  from: number
  to: number
  /** The line the citation sits on, whose other backticks name what it points at. */
  sentence: string
}

const CITATIONS = /`([\w./-]+\.(?:ts|json|yml|md|css|mjs)):(\d+(?:-\d+)?)`/g
const IS_CITATION = /^[\w./-]+\.(?:ts|json|yml|md|css|mjs):\d+(?:-\d+)?$/

const citations: Citation[] = agentsGuide.split('\n').flatMap((line) =>
  [...line.matchAll(CITATIONS)].map((cited) => {
    const bounds = cited[2].split('-').map(Number)
    return {
      file: cited[1],
      from: bounds[0],
      to: bounds[bounds.length - 1],
      sentence: line,
    }
  }),
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
      'AGENTS.md has no `path:line` citations — the format they are parsed from has changed',
    ).toBeGreaterThan(0)

    const missing = citations
      .filter((citation) => !(citation.file in citableText))
      .map((citation) => `${citation.file}:${citation.from}`)

    expect(
      missing,
      `AGENTS.md citations naming a file that does not exist: ${missing.join(', ')}`,
    ).toEqual([])
  })

  it('cites lines that name what the sentence around them names', () => {
    const stale = citations
      .filter((citation) => {
        // Absent files are the assertion above; reporting them twice helps nobody.
        if (!(citation.file in citableText)) return false

        const cited = citableText[citation.file].split('\n').slice(citation.from - 1, citation.to)
        const named = identifiersNamedOn(citation.sentence)

        return !cited.some((line) => named.some((identifier) => line.includes(identifier)))
      })
      .map((citation) => `${citation.file}:${citation.from}`)

    expect(
      stale,
      `AGENTS.md citations whose lines are out of range or no longer mention ` +
        `anything the citing sentence names: ${stale.join(', ')}`,
    ).toEqual([])
  })
})
