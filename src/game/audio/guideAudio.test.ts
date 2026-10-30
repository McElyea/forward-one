import { describe, expect, it } from 'vitest'
import {
  DEFAULT_GUIDE_VOICE_ID,
  GUIDE_VOICES,
  guideAudioKey,
  guideVoiceClips,
  guideVoicePreviewClip,
  guideVoicePreviewClips,
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

  it('recognizes the default voice as bundled', () => {
    expect(isGuideVoiceId(DEFAULT_GUIDE_VOICE_ID)).toBe(true)
  })

  it('rejects an empty slot, an empty string and a differently cased id', () => {
    expect(isGuideVoiceId(null), 'nothing saved yet').toBe(false)
    expect(isGuideVoiceId(''), 'an empty saved value').toBe(false)
    expect(isGuideVoiceId('AF_BELLA'), 'ids are case-sensitive').toBe(false)
  })

  it('creates a voice- and direction-specific cache key', () => {
    expect(guideAudioKey('am_liam', 'backward', 3)).toBe(
      'guide-am_liam-backward-3',
    )
  })
})

describe('the clips a guide voice needs', () => {
  it('covers both directions and all four stroke counts', () => {
    const clips = guideVoiceClips('af_bella')

    expect(clips).toHaveLength(8)
    expect(new Set(clips.map((clip) => clip.key)).size, 'duplicate cache keys').toBe(8)
  })

  it('lists every forward call before every backward call, one to four strokes', () => {
    expect(guideVoiceClips('am_eric').map((clip) => clip.key)).toEqual([
      'guide-am_eric-forward-1',
      'guide-am_eric-forward-2',
      'guide-am_eric-forward-3',
      'guide-am_eric-forward-4',
      'guide-am_eric-backward-1',
      'guide-am_eric-backward-2',
      'guide-am_eric-backward-3',
      'guide-am_eric-backward-4',
    ])
  })

  it('points each clip at the WAV generated for that voice', () => {
    const clip = guideVoiceClips('am_liam')
      .find((candidate) => candidate.key === guideAudioKey('am_liam', 'backward', 3))

    expect(clip?.url).toBe(`${import.meta.env.BASE_URL}audio/guide/am_liam/backward-3.wav`)
  })

  it('names no voice but the one asked for', () => {
    const foreign = guideVoiceClips('af_heart')
      .filter((clip) => !clip.url.includes('/af_heart/'))

    expect(foreign, 'clips fetched from another voice directory').toEqual([])
  })
})

describe('the put-in screen previews', () => {
  it('previews a voice with the call the menu plays', () => {
    expect(guideVoicePreviewClip('am_eric').key).toBe(
      guideAudioKey('am_eric', 'forward', 4),
    )
  })

  it('costs one clip per voice, not a whole voice each', () => {
    const previews = guideVoicePreviewClips()

    expect(previews).toHaveLength(GUIDE_VOICES.length)
  })

  it('previews every bundled voice in the order the menu lists them', () => {
    expect(guideVoicePreviewClips().map((clip) => clip.key)).toEqual(
      GUIDE_VOICES.map((voice) => guideAudioKey(voice.id, 'forward', 4)),
    )
  })

  it('fetches each preview from its own voice directory', () => {
    expect(guideVoicePreviewClip('af_heart').url).toBe(
      `${import.meta.env.BASE_URL}audio/guide/af_heart/forward-4.wav`,
    )
  })

  it('reuses the run clip, so the chosen voice never fetches it twice', () => {
    const preview = guideVoicePreviewClip('af_bella')
    const runKeys = guideVoiceClips('af_bella').map((clip) => clip.key)

    expect(runKeys, 'the preview must share a cache key with the run set').toContain(
      preview.key,
    )
  })
})
