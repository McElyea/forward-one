import { describe, expect, it } from 'vitest'
import { callBanner, obstacleLabel } from './callBanner'
import type { ObstacleKind } from '../survival/SurvivalEngine'

const OBSTACLES: ObstacleKind[] = ['rock', 'strainer', 'current', 'rapid']

describe('callBanner with no call in flight', () => {
  it('tells a paddler to read the water', () => {
    const banner = callBanner('aboard', undefined)

    expect(banner.headline).toBe('READ THE WATER')
    expect(banner.subtext).toBe('THE RAPIDS KEEP BUILDING')
    expect(banner.tone).toBe('waiting')
  })

  it('tells a swimmer to find the raft', () => {
    const banner = callBanner('overboard', undefined)

    expect(banner.headline).toBe('FIND THE RAFT')
    expect(banner.subtext).toBe('THE CURRENT IS PULLING YOU AWAY')
  })
})

describe('callBanner with a call in flight', () => {
  it('names the direction and the stroke count', () => {
    const banner = callBanner('aboard', { direction: 'forward', strokes: 2, obstacle: 'rapid' })

    expect(banner.headline).toBe('FORWARD ×2')
    expect(banner.subtext).toBe('WAVE TRAIN AHEAD')
    expect(banner.tone).toBe('forward')
  })

  it('calls a backwards stroke BACKWARDS without repeating it in the obstacle line', () => {
    const banner = callBanner('aboard', { direction: 'backward', strokes: 3, obstacle: 'rock' })

    expect(banner.headline).toBe('BACKWARDS ×3')
    expect(banner.subtext).toBe('ROCK AHEAD')
    expect(banner.tone).toBe('backward')
  })

  it('tells a swimmer to swim instead of naming an obstacle they cannot hit', () => {
    const banner = callBanner('overboard', { direction: 'forward', strokes: 2, obstacle: 'rock' })

    expect(banner.subtext).toBe('SWIM TO THE RAFT  /  2 STROKES')
    expect(banner.subtext, 'a swimmer is being warned about an obstacle').not.toContain('ROCK')
  })

  it('counts one stroke in the singular', () => {
    const banner = callBanner('overboard', { direction: 'backward', strokes: 1, obstacle: 'rock' })

    expect(banner.subtext).toBe('SWIM TO THE RAFT  /  1 STROKE')
  })

  it('still asks for strokes once the river has won, so the last frame reads sanely', () => {
    const banner = callBanner('swept-away', { direction: 'forward', strokes: 1, obstacle: 'rock' })

    expect(banner.headline).toBe('FORWARD ×1')
  })
})

describe('obstacleLabel', () => {
  it('names every obstacle the survival engine can schedule', () => {
    for (const obstacle of OBSTACLES) {
      const label = obstacleLabel(obstacle)

      expect(label, `${obstacle} has no banner label`).toBeTruthy()
      expect(label).toBe(label.toUpperCase())
    }
  })
})
