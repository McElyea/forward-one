export type RapidClass = 2 | 3 | 4 | 5

export type RaceMode = 'solo' | 'multiplayer-preview'

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
  durationMs: number
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
  progress: number
  isLocal: boolean
  connected: boolean
}
