import { describe, expect, it } from 'vitest'
import { failOnError, resultData } from './rpcResult'

describe('failOnError', () => {
  it('throws the message the room service reported', () => {
    expect(() => failOnError({ message: 'Sign in before creating a room' })).toThrow(
      'Sign in before creating a room',
    )
  })

  it('passes a successful result through', () => {
    expect(() => failOnError(null)).not.toThrow()
  })

  it('accepts the null data a void function returns', () => {
    // `leave_race_room` is declared `returns void`, so a successful call resolves
    // with `data: null`. Checking it with `resultData` would throw on every
    // successful leave; this is the check that call needs instead.
    expect(() => failOnError(null)).not.toThrow()
    expect(() => resultData(null, null)).toThrow('The room service returned no data')
  })
})

describe('resultData', () => {
  it('returns the payload when the call succeeded', () => {
    expect(resultData({ id: 'room-id' }, null)).toEqual({ id: 'room-id' })
  })

  it('prefers the reported error over the missing payload', () => {
    expect(() => resultData(null, { message: 'Unknown river level' })).toThrow(
      'Unknown river level',
    )
  })

  it('rejects a success that carried no payload', () => {
    expect(() => resultData(undefined, null)).toThrow('The room service returned no data')
  })
})
