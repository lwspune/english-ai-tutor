import { describe, it, expect } from 'vitest'
import { computeSessionCost, formatCost } from './costUtils'

describe('computeSessionCost', () => {
  it('returns null when all three metrics are null (old session)', () => {
    expect(computeSessionCost({ whisper_duration_seconds: null, llm_input_tokens: null, llm_output_tokens: null })).toBeNull()
  })

  it('computes Whisper-only cost when LLM tokens are null', () => {
    // 60s = 1 minute × $0.006 = $0.006
    const cost = computeSessionCost({ whisper_duration_seconds: 60, llm_input_tokens: null, llm_output_tokens: null })
    expect(cost).toBeCloseTo(0.006, 6)
  })

  it('computes Whisper cost for 30 seconds', () => {
    // 30s = 0.5 min × $0.006 = $0.003
    const cost = computeSessionCost({ whisper_duration_seconds: 30, llm_input_tokens: null, llm_output_tokens: null })
    expect(cost).toBeCloseTo(0.003, 6)
  })

  it('computes GPT-only cost when whisper duration is null', () => {
    // 1000 input × $0.15/1M = $0.00015
    // 200 output × $0.60/1M = $0.00012
    // total = $0.00027
    const cost = computeSessionCost({ whisper_duration_seconds: null, llm_input_tokens: 1000, llm_output_tokens: 200 })
    expect(cost).toBeCloseTo(0.00027, 8)
  })

  it('computes combined Whisper + GPT cost', () => {
    // Whisper: 60s = $0.006
    // GPT: 500 input → $0.000075, 150 output → $0.00009
    // total = $0.006165
    const cost = computeSessionCost({ whisper_duration_seconds: 60, llm_input_tokens: 500, llm_output_tokens: 150 })
    expect(cost).toBeCloseTo(0.006165, 8)
  })

  it('returns 0 for zero duration and zero tokens', () => {
    expect(computeSessionCost({ whisper_duration_seconds: 0, llm_input_tokens: 0, llm_output_tokens: 0 })).toBe(0)
  })

  it('treats zero duration as a known value (not null), so returns 0 not null', () => {
    const cost = computeSessionCost({ whisper_duration_seconds: 0, llm_input_tokens: null, llm_output_tokens: null })
    expect(cost).not.toBeNull()
    expect(cost).toBe(0)
  })
})

describe('formatCost', () => {
  it('returns "—" for null', () => {
    expect(formatCost(null)).toBe('—')
  })

  it('formats a sub-cent cost with 4 decimal places', () => {
    expect(formatCost(0.006)).toBe('$0.0060')
  })

  it('formats zero as $0.0000', () => {
    expect(formatCost(0)).toBe('$0.0000')
  })

  it('formats a larger cost correctly', () => {
    expect(formatCost(0.1234)).toBe('$0.1234')
  })

  it('formats a cost over $1 correctly', () => {
    expect(formatCost(1.5)).toBe('$1.5000')
  })
})
