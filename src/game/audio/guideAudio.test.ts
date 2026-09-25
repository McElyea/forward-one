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

  it('reuses the run clip, so the chosen voice never fetches it twice', () => {
    const preview = guideVoicePreviewClip('af_bella')
    const runKeys = guideVoiceClips('af_bella').map((clip) => clip.key)

    expect(runKeys, 'the preview must share a cache key with the run set').toContain(
      preview.key,
    )
  })
})

describe('the bundled guide audio', () => {
  // A lazy glob only lists the matching paths; no WAV is ever read.
  const bundled = Object.keys(import.meta.glob('../../../public/audio/guide/*/*.wav'))
    .map((path) => path.slice(path.indexOf('public/') + 'public/'.length))
    .sort()
  const requested = GUIDE_VOICES
    .flatMap((voice) => guideVoiceClips(voice.id))
    .map((clip) => clip.url.slice(import.meta.env.BASE_URL.length))
    .sort()

  it('has a generated WAV for every clip a voice can request', () => {
    const missing = requested.filter((url) => !bundled.includes(url))

    expect(missing, 'clips no file under public/ answers, so the loader would 404').toEqual([])
  })

  it('ships no WAV that no voice ever requests', () => {
    const unused = bundled.filter((url) => !requested.includes(url))

    expect(unused, 'WAVs under public/audio/guide/ that no clip points at').toEqual([])
  })
})
