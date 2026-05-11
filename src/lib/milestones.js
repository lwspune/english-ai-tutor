import { supabase } from './supabase'

export const MILESTONE_KIND = {
  STREAK_5: 'streak_5',
  STREAK_10: 'streak_10',
  STREAK_20: 'streak_20',
  PERSONAL_BEST_ACCURACY: 'personal_best_accuracy',
  PERSONAL_BEST_WPM: 'personal_best_wpm',
  COMPREHENSION_ACED: 'comprehension_aced',
  WORD_MASTERED: 'word_mastered',
}

export async function awardMilestone(kind, payload = {}) {
  const { data, error } = await supabase.rpc('award_milestone', {
    p_kind: kind,
    p_payload: payload,
  })
  if (error) return null
  return data ?? null
}

export async function fetchRecentMilestones(studentId, limit = 10) {
  const { data, error } = await supabase
    .from('milestones')
    .select('*')
    .eq('student_id', studentId)
    .order('achieved_at', { ascending: false })
    .limit(limit)
  if (error) return []
  return data ?? []
}
