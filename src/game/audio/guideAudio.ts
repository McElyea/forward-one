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

/** A clip the loader can queue: the cache key it lands under, and where it lives. */
export type GuideAudioClip = {
  key: string
  url: string
}

export function guideAudioClip(
  voiceId: GuideVoiceId,
  direction: PaddleDirection,
  strokes: GuideCallNumber,
): GuideAudioClip {
  return {
    key: guideAudioKey(voiceId, direction, strokes),
    url: `${import.meta.env.BASE_URL}audio/guide/${voiceId}/${direction}-${strokes}.wav`,
  }
}

/** Every call one voice can make during a run: two directions x four stroke counts. */
export function guideVoiceClips(voiceId: GuideVoiceId): GuideAudioClip[] {
  const clips: GuideAudioClip[] = []
  for (const direction of ['forward', 'backward'] as const) {
    for (const strokes of [1, 2, 3, 4] as const) {
      clips.push(guideAudioClip(voiceId, direction, strokes))
    }
  }
  return clips
}

/** The one clip the put-in screen plays when a voice is chosen. */
export function guideVoicePreviewClip(voiceId: GuideVoiceId): GuideAudioClip {
  return guideAudioClip(voiceId, 'forward', 4)
}

/** One preview per bundled voice — everything the put-in screen can play. */
export function guideVoicePreviewClips(): GuideAudioClip[] {
  return GUIDE_VOICES.map((voice) => guideVoicePreviewClip(voice.id))
}

function queueClips(scene: Phaser.Scene, clips: GuideAudioClip[]): void {
  for (const clip of clips) {
    if (scene.cache.audio.exists(clip.key)) continue

    scene.load.audio(clip.key, clip.url)
  }
}

/**
 * Queue the calls for one voice. A run only ever speaks in the voice the player
 * chose, so loading all four costs 3.4 MB that is never played.
 */
export function loadGuideAudio(
  scene: Phaser.Scene,
  voiceId: GuideVoiceId = getSelectedGuideVoiceId(),
): void {
  queueClips(scene, guideVoiceClips(voiceId))
}

/** Queue the put-in screen's previews: one clip per voice rather than all eight. */
export function loadGuideVoicePreviews(scene: Phaser.Scene): void {
  queueClips(scene, guideVoicePreviewClips())
}
