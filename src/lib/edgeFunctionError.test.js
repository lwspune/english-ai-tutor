import { describe, it, expect } from 'vitest'
import { extractEdgeFunctionError } from './edgeFunctionError'

describe('extractEdgeFunctionError', () => {
  it('returns the error field from the JSON body when present', async () => {
    const fnError = {
      message: 'Edge Function returned a non-2xx status code',
      context: { json: async () => ({ error: 'You have reached the maximum of 3 attempts for this passage.' }) },
    }
    expect(await extractEdgeFunctionError(fnError)).toBe(
      'You have reached the maximum of 3 attempts for this passage.'
    )
  })

  it('falls back to fnError.message when context has no error field', async () => {
    const fnError = {
      message: 'Edge Function returned a non-2xx status code',
      context: { json: async () => ({}) },
    }
    expect(await extractEdgeFunctionError(fnError)).toBe(
      'Edge Function returned a non-2xx status code'
    )
  })

  it('falls back to fnError.message when context.json throws', async () => {
    const fnError = {
      message: 'Edge Function returned a non-2xx status code',
      context: { json: async () => { throw new Error('not json') } },
    }
    expect(await extractEdgeFunctionError(fnError)).toBe(
      'Edge Function returned a non-2xx status code'
    )
  })

  it('falls back to fnError.message when context is absent', async () => {
    const fnError = { message: 'Network error' }
    expect(await extractEdgeFunctionError(fnError)).toBe('Network error')
  })
})
