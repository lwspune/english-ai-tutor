import { describe, it, expect, beforeEach, vi } from 'vitest'
import { awardMilestone, fetchRecentMilestones, MILESTONE_KIND } from './milestones'

const { rpcMock, fromMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  fromMock: vi.fn(),
}))

vi.mock('./supabase', () => ({
  supabase: {
    rpc: (...args) => rpcMock(...args),
    from: (table) => fromMock(table),
  },
}))

beforeEach(() => {
  rpcMock.mockReset()
  fromMock.mockReset()
  rpcMock.mockResolvedValue({ data: 'awarded-id', error: null })
})

describe('awardMilestone', () => {
  it('calls supabase.rpc with kind + payload', async () => {
    await awardMilestone('streak_5', {})
    expect(rpcMock).toHaveBeenCalledWith('award_milestone', { p_kind: 'streak_5', p_payload: {} })
  })

  it('returns the new milestone id on success', async () => {
    rpcMock.mockResolvedValue({ data: 'mid-123', error: null })
    const id = await awardMilestone('streak_5', {})
    expect(id).toBe('mid-123')
  })

  it('returns null when the RPC returns null (dedupe hit)', async () => {
    rpcMock.mockResolvedValue({ data: null, error: null })
    const id = await awardMilestone('streak_5', {})
    expect(id).toBeNull()
  })

  it('returns null and does NOT throw on RPC error (best-effort)', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'not earned' } })
    const id = await awardMilestone('streak_5', {})
    expect(id).toBeNull()
  })

  it('passes the payload through verbatim', async () => {
    await awardMilestone('personal_best_accuracy', { session_id: 'abc' })
    expect(rpcMock).toHaveBeenCalledWith('award_milestone', {
      p_kind: 'personal_best_accuracy',
      p_payload: { session_id: 'abc' },
    })
  })
})

describe('fetchRecentMilestones', () => {
  it('fetches milestones for a student ordered by achieved_at desc with limit', async () => {
    const limitMock = vi.fn(() => Promise.resolve({ data: [{ id: 'a' }, { id: 'b' }], error: null }))
    const orderMock = vi.fn(() => ({ limit: limitMock }))
    const eqMock = vi.fn(() => ({ order: orderMock }))
    const selectMock = vi.fn(() => ({ eq: eqMock }))
    fromMock.mockImplementation(() => ({ select: selectMock }))

    const rows = await fetchRecentMilestones('student-1', 10)

    expect(fromMock).toHaveBeenCalledWith('milestones')
    expect(eqMock).toHaveBeenCalledWith('student_id', 'student-1')
    expect(orderMock).toHaveBeenCalledWith('achieved_at', { ascending: false })
    expect(limitMock).toHaveBeenCalledWith(10)
    expect(rows).toEqual([{ id: 'a' }, { id: 'b' }])
  })

  it('returns empty array on error rather than throwing', async () => {
    const limitMock = vi.fn(() => Promise.resolve({ data: null, error: { message: 'rls' } }))
    const orderMock = vi.fn(() => ({ limit: limitMock }))
    const eqMock = vi.fn(() => ({ order: orderMock }))
    fromMock.mockImplementation(() => ({ select: () => ({ eq: eqMock }) }))

    const rows = await fetchRecentMilestones('student-1', 10)
    expect(rows).toEqual([])
  })
})

describe('MILESTONE_KIND', () => {
  it('enumerates all valid kinds', () => {
    expect(MILESTONE_KIND).toMatchObject({
      STREAK_5: 'streak_5',
      STREAK_10: 'streak_10',
      STREAK_20: 'streak_20',
      PERSONAL_BEST_ACCURACY: 'personal_best_accuracy',
      PERSONAL_BEST_WPM: 'personal_best_wpm',
      COMPREHENSION_ACED: 'comprehension_aced',
      WORD_MASTERED: 'word_mastered',
    })
  })
})
