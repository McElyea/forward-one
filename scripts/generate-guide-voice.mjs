import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { KokoroTTS } from 'kokoro-js'

const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX'
const DEFAULT_VOICES = ['af_bella', 'af_heart', 'am_liam', 'am_eric']
const requestedVoices = process.argv.slice(2)
const voices = requestedVoices.length > 0 ? requestedVoices : DEFAULT_VOICES
const numbers = ['one', 'two', 'three', 'four']
const calls = [
  { direction: 'forward', spoken: 'Forward' },
  { direction: 'backward', spoken: 'Backwards' },
]

process.stdout.write('Loading Kokoro model…\n')
const tts = await KokoroTTS.from_pretrained(MODEL_ID, {
  dtype: 'q8',
  device: 'cpu',
  progress_callback: (progress) => {
    if (progress.status === 'progress' && progress.progress != null) {
      process.stdout.write(`\rDownloading model: ${Math.round(progress.progress)}%`)
    }
  },
})

process.stdout.write('\nGenerating guide calls…\n')
for (const voice of voices) {
  const outputDirectory = resolve('public', 'audio', 'guide', voice)
  await mkdir(outputDirectory, { recursive: true })

  for (const call of calls) {
    for (const [index, number] of numbers.entries()) {
      const audio = await tts.generate(`${call.spoken}, ${number}!`, {
        voice,
        speed: 1.08,
      })
      const path = resolve(outputDirectory, `${call.direction}-${index + 1}.wav`)
      await audio.save(path)
      process.stdout.write(`Created ${path}\n`)
    }
  }
}
