/** The shape of the error half of a `supabase-js` result, narrowed to what is read. */
export interface RpcError {
  message: string
}

/**
 * Turn the error half of a `supabase-js` result into a thrown error.
 *
 * `.rpc()` resolves rather than rejects when the database, RLS, or the function
 * body refuses the call, so `await` alone cannot see a failure — the error only
 * exists in the resolved value. Every call has to read it deliberately.
 */
export function failOnError(error: RpcError | null): void {
  if (error) throw new Error(error.message)
}

/**
 * The data half of a `supabase-js` result, for the calls that return a payload.
 *
 * A function declared `returns void` resolves with `data: null` on success, so
 * this must not be used to check one — `failOnError` alone is the check there.
 */
export function resultData(data: unknown, error: RpcError | null): unknown {
  failOnError(error)
  if (data === null || data === undefined) throw new Error('The room service returned no data')
  return data
}
