import { describe, expect, it } from 'vitest'
import ciWorkflow from '../.github/workflows/ci.yml?raw'
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
  const pattern = new RegExp(`## ${heading}\\n+\`\`\`${language}\\n([\\s\\S]*?)\\n\`\`\``)
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

const sourceFiles = new Set(
  Object.keys(import.meta.glob('./game/**/*.ts')).map((path) => path.replace('./', 'src/')),
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
