import { describe, expect, it } from 'vitest'
import {
  DEFAULT_GUIDE_VOICE_ID,
  guideAudioKey,
  isGuideVoiceId,
} from './guideAudio'

describe('guide audio configuration', () => {
  it('keeps Bella as the authored default', () => {
    expect(DEFAULT_GUIDE_VOICE_ID).toBe('af_bella')
  })

  it('recognizes only bundled guide voices', () => {
    expect(isGuideVoiceId('af_heart')).toBe(true)
    expect(isGuideVoiceId('am_liam')).toBe(true)
    expect(isGuideVoiceId('am_eric')).toBe(true)
    expect(isGuideVoiceId('system-default')).toBe(false)
  })

  it('creates a voice- and direction-specific cache key', () => {
    expect(guideAudioKey('am_liam', 'backward', 3)).toBe(
      'guide-am_liam-backward-3',
    )
  })
})
