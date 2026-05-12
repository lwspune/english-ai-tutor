import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import BottomNav from '../../components/BottomNav'
import { isDueForMaintenance } from '../../lib/srs'

const VOCAB_GRADES = new Set(['11', '12', 'MBA'])

export default function VocabHome() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const allowed = VOCAB_GRADES.has(String(profile.grade))

  const [loading, setLoading] = useState(allowed)
  const [total, setTotal] = useState(0)
  const [mastered, setMastered] = useState(0)
  const [due, setDue] = useState(0)
  const [dueSoon, setDueSoon] = useState(0)
  const [seen, setSeen] = useState(0)
  const [seenFromReading, setSeenFromReading] = useState(0)

  useEffect(() => {
    if (!allowed) return
    async function load() {
      const { count: totalCount } = await supabase
        .from('vocabulary_words')
        .select('*', { count: 'exact', head: true })
      const { data: progress } = await supabase
        .from('student_word_progress')
        .select('mastered_at, next_review_at, last_encounter_source')
        .eq('student_id', profile.id)

      const nowDate = new Date()
      const now = nowDate.getTime()
      const in24h = now + 24 * 60 * 60 * 1000
      const rows = progress ?? []
      setTotal(totalCount ?? 0)
      setMastered(rows.filter(r => r.mastered_at).length)
      setDue(rows.filter(r => {
        if (r.mastered_at) return isDueForMaintenance(r, nowDate)
        return new Date(r.next_review_at).getTime() <= now
      }).length)
      setDueSoon(rows.filter(r => {
        if (r.mastered_at) return false
        const t = new Date(r.next_review_at).getTime()
        return t > now && t <= in24h
      }).length)
      setSeen(rows.length)
      setSeenFromReading(rows.filter(r => r.last_encounter_source === 'reading').length)
      setLoading(false)
    }
    load()
  }, [profile.id, allowed])

  const newAvailable = Math.max(0, total - seen)
  const canPractice = due > 0 || newAvailable > 0
  const inProgress = Math.max(0, seen - mastered)
  const showMasteryTimelineHint = seen > 0 && mastered === 0

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate('/student')}
          className="text-slate-500 hover:text-slate-800 text-sm min-h-[44px] flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 rounded"
          aria-label="Back to home"
        >
          ← Back
        </button>
        <h1 className="text-base font-semibold text-slate-800">Vocabulary</h1>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {!allowed ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center">
            <p className="text-sm text-slate-600">Vocabulary practice unlocks in grade 11.</p>
            <p className="text-xs text-slate-400 mt-2">Keep building your reading skills in the meantime.</p>
          </div>
        ) : loading ? (
          <p className="text-sm text-slate-400">Loading...</p>
        ) : (
          <>
            <div className="bg-white rounded-2xl border border-slate-200 px-5 py-4">
              <div className="flex items-baseline justify-between">
                <div>
                  <p className="text-3xl font-bold text-slate-800">
                    <span data-testid="mastered-count">{mastered}</span>
                    <span className="text-slate-400 text-lg font-normal"> / </span>
                    <span data-testid="total-count" className="text-slate-400 text-lg font-normal">{total}</span>
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Words mastered</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-400">{Math.round(total > 0 ? (mastered / total) * 100 : 0)}%</p>
                </div>
              </div>
              <div className="mt-3 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-500 transition-all"
                  style={{ width: `${total > 0 ? (mastered / total) * 100 : 0}%` }}
                  aria-label={`${mastered} of ${total} mastered`}
                />
              </div>
              {inProgress > 0 && (
                <p data-testid="in-progress-count" className="text-xs text-slate-500 mt-3">
                  <span className="font-semibold text-slate-700">{inProgress}</span>{' '}
                  {inProgress === 1 ? 'word' : 'words'} in progress — practising your way toward mastery.
                </p>
              )}
              {showMasteryTimelineHint && (
                <p data-testid="mastery-timeline-hint" className="text-xs text-slate-400 mt-2 leading-relaxed">
                  Words climb through 5 boxes with spaced practice. The first masteries usually take 25+ days of consistent reviews — keep going.
                </p>
              )}
              {seenFromReading > 0 && (
                <p data-testid="seen-from-reading" className="text-xs text-slate-500 mt-3">
                  <span className="font-semibold text-slate-700">{seenFromReading}</span>{' '}
                  {seenFromReading === 1 ? 'word' : 'words'} encountered through your reading sessions.
                </p>
              )}
            </div>

            <div className="bg-indigo-50 rounded-2xl border border-indigo-200 px-5 py-5">
              <p className="text-sm text-indigo-900">
                <span data-testid="due-count" className="text-2xl font-bold">{due}</span>{' '}
                {due === 1 ? 'word' : 'words'} due today
              </p>
              {dueSoon > 0 && (
                <p data-testid="due-soon-hint" className="text-xs text-indigo-700 mt-1">
                  + <span className="font-semibold">{dueSoon}</span> more due within 24h
                </p>
              )}
              <p className="text-xs text-indigo-700 mt-1">
                {newAvailable > 0 ? `+ up to 5 new words from ${newAvailable} unseen` : 'No new words remaining'}
              </p>
              <button
                onClick={() => navigate('/student/vocab/practice')}
                disabled={!canPractice}
                className="mt-4 w-full bg-indigo-600 text-white text-sm font-medium px-4 py-3 rounded-xl hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
              >
                Start Practice
              </button>
              {!canPractice && (
                <p className="text-xs text-indigo-700 mt-2 text-center">
                  All caught up — come back tomorrow.
                </p>
              )}
            </div>
          </>
        )}
      </main>

      <BottomNav />
    </div>
  )
}
