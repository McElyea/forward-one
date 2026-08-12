import type { LevelConfig } from './types'

export const LEVELS: LevelConfig[] = [
  {
    id: 'class-ii',
    rapidClass: 2,
    name: 'Warm-up Run',
    description: 'Wide channels, clean wave trains, and room to learn the guide’s calls.',
    accent: '#ffc857',
    durationMs: 38_000,
    cues: [
      { at: 4_200, direction: 'forward', strokes: 1 },
      { at: 7_600, direction: 'forward', strokes: 2 },
      { at: 11_900, direction: 'backward', strokes: 1 },
      { at: 15_100, direction: 'forward', strokes: 2 },
      { at: 19_700, direction: 'backward', strokes: 2 },
      { at: 24_400, direction: 'forward', strokes: 2 },
      { at: 29_100, direction: 'forward', strokes: 3 },
    ],
  },
  {
    id: 'class-iii',
    rapidClass: 3,
    name: 'Broken Water',
    description: 'Irregular waves introduce faster calls and shorter recovery gaps.',
    accent: '#ff9f5a',
    durationMs: 37_000,
    cues: [
      { at: 3_700, direction: 'forward', strokes: 2 },
      { at: 7_100, direction: 'backward', strokes: 3, interval: 520 },
      { at: 11_500, direction: 'forward', strokes: 1 },
      { at: 14_200, direction: 'forward', strokes: 3, interval: 500 },
      { at: 19_000, direction: 'backward', strokes: 2 },
      { at: 22_400, direction: 'forward', strokes: 3, interval: 480 },
      { at: 27_200, direction: 'backward', strokes: 1 },
      { at: 29_600, direction: 'forward', strokes: 3, interval: 470 },
    ],
  },
  {
    id: 'class-iv',
    rapidClass: 4,
    name: 'The Narrows',
    description: 'Precise four-stroke drives thread constricted passages and heavy water.',
    accent: '#ff6b4a',
    durationMs: 36_000,
    cues: [
      { at: 3_500, direction: 'forward', strokes: 3, interval: 470 },
      { at: 7_600, direction: 'backward', strokes: 1 },
      { at: 10_200, direction: 'forward', strokes: 4, interval: 450 },
      { at: 15_000, direction: 'backward', strokes: 2, interval: 450 },
      { at: 18_300, direction: 'forward', strokes: 4, interval: 430 },
      { at: 23_100, direction: 'backward', strokes: 3, interval: 420 },
      { at: 27_300, direction: 'forward', strokes: 4, interval: 410 },
    ],
  },
  {
    id: 'class-v',
    rapidClass: 5,
    name: 'No Mistakes',
    description: 'Long, powerful rapids chain every call into one sustained final run.',
    accent: '#e84a5f',
    durationMs: 35_000,
    cues: [
      { at: 3_200, direction: 'forward', strokes: 4, interval: 420 },
      { at: 7_200, direction: 'backward', strokes: 2, interval: 400 },
      { at: 9_900, direction: 'forward', strokes: 4, interval: 390 },
      { at: 14_000, direction: 'backward', strokes: 3, interval: 380 },
      { at: 17_300, direction: 'forward', strokes: 1 },
      { at: 19_300, direction: 'forward', strokes: 4, interval: 370 },
      { at: 23_100, direction: 'backward', strokes: 2, interval: 360 },
      { at: 25_600, direction: 'forward', strokes: 4, interval: 350 },
      { at: 29_500, direction: 'backward', strokes: 3, interval: 340 },
    ],
  },
]

export function getLevel(id: string): LevelConfig {
  return LEVELS.find((level) => level.id === id) ?? LEVELS[0]
}
