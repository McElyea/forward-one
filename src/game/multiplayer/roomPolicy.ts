export const MIN_ROOM_CAPACITY = 2
export const DEFAULT_ROOM_CAPACITY = 8
export const MAX_ROOM_CAPACITY = 64

export const ROOM_CAPACITY_OPTIONS = [8, 16, 32, 64] as const

const ROOM_CODE = /^[A-HJ-NP-Z2-9]{6}$/

export function validateRoomCapacity(value: number): number {
  if (!Number.isInteger(value) || value < MIN_ROOM_CAPACITY || value > MAX_ROOM_CAPACITY) {
    throw new Error(
      `Room capacity must be a whole number from ${MIN_ROOM_CAPACITY} to ${MAX_ROOM_CAPACITY}`,
    )
  }
  return value
}

export function normalizeRoomCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
}

export function isRoomCode(value: string): boolean {
  return ROOM_CODE.test(normalizeRoomCode(value))
}

export function sanitizePlayerName(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N} _-]/gu, '')
    .slice(0, 18)
}
