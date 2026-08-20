export type RapidClass = 2 | 3 | 4 | 5

export type RaceMode = 'solo' | 'multiplayer-preview' | 'multiplayer'

export type PaddleDirection = 'forward' | 'backward'

export type StrokeRating = 'perfect' | 'good' | 'early' | 'late' | 'wrong' | 'miss'

export interface PaddleCue {
  /** Time of the first requested stroke, in milliseconds after race start. */
  at: number
  direction: PaddleDirection
  strokes: 1 | 2 | 3 | 4
  interval?: number
}

export interface LevelConfig {
  id: string
  rapidClass: RapidClass
  name: string
  description: string
  accent: string
  /** Baseline used to scale the simulated rivals' survival times. */
  survivalBenchmarkMs: number
  cues: PaddleCue[]
}

export interface StrokeTarget {
  id: string
  cueIndex: number
  strokeIndex: number
  direction: PaddleDirection
  targetTime: number
  status: 'pending' | StrokeRating
}

export interface StrokeJudgment {
  target: StrokeTarget | null
  rating: StrokeRating
  offsetMs: number | null
  points: number
}

export interface RacerSnapshot {
  id: string
  name: string
  color: number
  /** Position on the survival rail, normalised to the selected water's benchmark. */
  progress: number
  survivalMs: number
  eliminated: boolean
  isLocal: boolean
  connected: boolean
}
