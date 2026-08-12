import type Phaser from 'phaser'
import type { PaddleDirection } from '../types'

const VOICE_STORAGE_KEY = 'forward-one.guide-voice'

export const GUIDE_VOICES = [
  { id: 'af_bella', name: 'Bella' },
  { id: 'af_heart', name: 'Heart' },
  { id: 'am_liam', name: 'Liam' },
  { id: 'am_eric', name: 'Eric' },
] as const

export type GuideVoiceId = (typeof GUIDE_VOICES)[number]['id']

export const DEFAULT_GUIDE_VOICE_ID: GuideVoiceId = 'af_bella'

export type GuideCallNumber = 1 | 2 | 3 | 4

export function isGuideVoiceId(value: string | null): value is GuideVoiceId {
  return GUIDE_VOICES.some((voice) => voice.id === value)
}

export function getSelectedGuideVoiceId(): GuideVoiceId {
  try {
    const savedVoiceId = window.localStorage.getItem(VOICE_STORAGE_KEY)
    return isGuideVoiceId(savedVoiceId) ? savedVoiceId : DEFAULT_GUIDE_VOICE_ID
  } catch {
    return DEFAULT_GUIDE_VOICE_ID
  }
}

export function selectGuideVoice(voiceId: GuideVoiceId): void {
  try {
    window.localStorage.setItem(VOICE_STORAGE_KEY, voiceId)
  } catch {
    // Storage may be unavailable. Bella remains the next-session default.
  }
}

export function guideAudioKey(
  voiceId: GuideVoiceId,
  direction: PaddleDirection,
  strokes: GuideCallNumber,
): string {
  return `guide-${voiceId}-${direction}-${strokes}`
}

export function loadGuideAudio(scene: Phaser.Scene): void {
  for (const voice of GUIDE_VOICES) {
    for (const direction of ['forward', 'backward'] as const) {
      for (const strokes of [1, 2, 3, 4] as const) {
        const key = guideAudioKey(voice.id, direction, strokes)
        if (scene.cache.audio.exists(key)) continue

        scene.load.audio(
          key,
          `${import.meta.env.BASE_URL}audio/guide/${voice.id}/${direction}-${strokes}.wav`,
        )
      }
    }
  }
}
