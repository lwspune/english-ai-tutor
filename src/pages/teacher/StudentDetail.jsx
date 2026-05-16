import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { computeAvgComprehension } from '../../lib/studentStats'
import { MetricCard } from '../../components/PerformanceCharts'
import { WPM_TARGETS } from '../../lib/wpmTargets'
import { computeSessionCost, formatCost } from '../../lib/costUtils'
import { isOutlierSession } from '../../lib/anomalyFlag'
import { extractEdgeFunctionError } from '../../lib/edgeFunctionError'

function trend(current, previous) {
  if (previous == null) return null
  const diff = current - previous
  if (Math.abs(diff) < 2) return null
  return diff > 0 ? '↑' : '↓'
}

function TrendCell({ value, display, prev, goodDirection = 'up' }) {
  const arrow = trend(value, prev)
  const improving = arrow === '↑' ? goodDirection === 'up' : goodDirection === 'down'
  return (
    <td className="px-3 py-3 text-center">
      <span className="font-semibold text-slate-800">{display}</span>
      {arrow && (
        <span className={`ml-1 text-xs font-bold ${improving ? 'text-green-500' : 'text-red-400'}`}>
          {arrow}
        </span>
      )}
    </td>
  )
}

function computeDifficultWords(sessions) {
  const wordCount = {}
  for (const s of sessions) {
    const seen = new Set()
    for (const w of s.word_results ?? []) {
      if (w.status === 'correct') continue
      const clean = w.word.replace(/[^a-zA-Z]/g, '').toLowerCase()
      if (!clean || seen.has(clean)) continue
      seen.add(clean)
      wordCount[clean] = (wordCount[clean] ?? 0) + 1
    }
  }
  return Object.entries(wordCount)
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([word]) => word)
}

function FeedbackPanel({ raw }) {
  let ai = null
  try { ai = JSON.parse(raw) } catch { /* plain text */ }

  if (ai?.wentWell) {
    return (
      <div className="space-y-2 text-sm">
        <p><span className="font-semibold text-green-700">What went well: </span>{ai.wentWell}</p>
        <p><span className="font-semibold text-amber-700">Focus on: </span>{ai.focusOn}</p>
        <p><span className="font-semibold text-blue-700">Tip: </span>{ai.tip}</p>
        {ai.practiseWords?.length > 0 && (
          <p>
            <span className="font-semibold text-red-700">Words to practise: </span>
            {ai.practiseWords.join(', ')}
          </p>
        )}
      </div>
    )
  }
  return <p className="text-sm text-slate-700">{raw}</p>
}

function ResetPasswordModal({ studentId, onClose }) {
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    const { data, error: fnError } = await supabase.functions.invoke('reset-student-password', {
      body: { student_id: studentId, new_password: password },
    })
    setSubmitting(false)
    if (fnError || !data?.success) {
      const fromBody = fnError ? await extractEdgeFunctionError(fnError) : null
      setError(fromBody || data?.error || 'Reset failed')
      return
    }
    onClose(true)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <h2 className="text-base font-semibold text-slate-800 mb-4">Reset Password</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="reset-password" className="block text-sm font-medium text-slate-700 mb-1">
              New Password
            </label>
            <div className="relative">
              <input
                id="reset-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={8}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm pr-16 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                placeholder="Min 8 characters"
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-slate-700 focus-visible:outline-none focus-visible:underline"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => onClose(false)}
              className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 focus-visible:outline-none focus-visible:underline"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              {submitting ? 'Saving…' : 'Confirm'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function StudentDetail() {
  const { studentId } = useParams()
  const navigate = useNavigate()
  const [student, setStudent] = useState(null)
  const [sessions, setSessions] = useState([])
  const [vocabProgress, setVocabProgress] = useState([])
  const [totalVocab, setTotalVocab] = useState(0)
  const [drillAttempts, setDrillAttempts] = useState([])
  const [openFeedbackId, setOpenFeedbackId] = useState(null)
  const [showResetPassword, setShowResetPassword] = useState(false)
  const [passwordResetSuccess, setPasswordResetSuccess] = useState(false)
  // Capture "now" at mount so useMemo stays pure (no Date.now() in render path).
  // Teacher view doesn't auto-refresh; one timestamp per visit is correct.
  const [loadedAt] = useState(() => Date.now())

  useEffect(() => {
    async function load() {
      const [{ data: p }, { data: s }, { data: vp }, { count: vc }, { data: da }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', studentId).single(),
        supabase.from('sessions')
          .select('*, passages(title)')
          .eq('student_id', studentId)
          .order('created_at', { ascending: true }),
        supabase.from('student_word_progress').select('*').eq('student_id', studentId),
        supabase.from('vocabulary_words').select('*', { count: 'exact', head: true }),
        supabase.from('drill_attempts')
          .select('*')
          .eq('student_id', studentId)
          .order('created_at', { ascending: false }),
      ])
      setStudent(p)
      setSessions(s ?? [])
      setVocabProgress(vp ?? [])
      setTotalVocab(vc ?? 0)
      setDrillAttempts(da ?? [])
    }
    load()
  }, [studentId])

  // Vocab + drill aggregates — computed in useMemo so Date.now() is only
  // captured when data changes, not every render. Hooks must come BEFORE
  // any early return (React rules).
  const vocabStats = useMemo(() => {
    if (totalVocab === 0) return null
    return {
      mastered: vocabProgress.filter(w => w.mastered_at).length,
      inProgress: vocabProgress.filter(w => !w.mastered_at).length,
      dueNow: vocabProgress.filter(w => !w.mastered_at && new Date(w.next_review_at).getTime() <= loadedAt).length,
      fromReading: vocabProgress.filter(w => w.last_encounter_source === 'reading').length,
      masteryPct: (vocabProgress.filter(w => w.mastered_at).length / totalVocab) * 100,
    }
  }, [vocabProgress, totalVocab, loadedAt])

  const drillStats = useMemo(() => {
    if (drillAttempts.length === 0) return null
    const correctCount = drillAttempts.filter(a => a.was_correct).length
    return {
      attempts: drillAttempts.length,
      distinctWords: new Set(drillAttempts.map(a => a.stumble_word)).size,
      correctRate: Math.round((correctCount / drillAttempts.length) * 100),
    }
  }, [drillAttempts])

  if (!student) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const wpmTarget = WPM_TARGETS[student.grade] ?? 150
  const difficultWords = computeDifficultWords(sessions)

  async function handleResetComprehension(sessionId) {
    await supabase.rpc('reset_comprehension', { p_session_id: sessionId })
    setSessions(prev => prev.map(s =>
      s.id === sessionId ? { ...s, score_comprehension: null, comprehension_answers: null } : s
    ))
  }

  const avgAccuracy = sessions.length
    ? Math.round(sessions.reduce((a, s) => a + s.score_accuracy, 0) / sessions.length)
    : null
  const latestAccuracy = sessions.length ? sessions[sessions.length - 1].score_accuracy : null
  const firstAccuracy = sessions.length ? sessions[0].score_accuracy : null
  const accuracyGain = sessions.length >= 2 ? latestAccuracy - firstAccuracy : null

  const avgWpm = sessions.length
    ? Math.round(sessions.reduce((a, s) => a + s.score_wpm, 0) / sessions.length)
    : null

  const avgPhrasing = sessions.length
    ? Math.round(sessions.reduce((a, s) => a + (s.score_phrasing ?? s.score_fluency ?? 0), 0) / sessions.length)
    : null

  const avgComprehension = computeAvgComprehension(sessions)

  return (
    <div className="min-h-screen bg-slate-50">
      {showResetPassword && (
        <ResetPasswordModal
          studentId={studentId}
          onClose={(success) => {
            setShowResetPassword(false)
            if (success) setPasswordResetSuccess(true)
          }}
        />
      )}

      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3 flex-wrap">
        <button onClick={() => navigate('/teacher')} className="text-slate-500 hover:text-slate-800 text-sm">← Back</button>
        <h1 className="text-base font-semibold text-slate-800">{student.full_name}</h1>
        <span className="text-sm text-slate-400">{student.grade === 'MBA' ? 'MBA' : `Grade ${student.grade}`}</span>
        <div className="ml-auto flex items-center gap-3 flex-wrap">
          {wpmTarget && (
            <span className="text-xs text-slate-400">WPM target: {wpmTarget}</span>
          )}
          <button
            onClick={() => { setShowResetPassword(true); setPasswordResetSuccess(false) }}
            className="text-sm text-slate-500 hover:text-slate-800 border border-slate-300 rounded-lg px-3 py-1.5 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            aria-label="Reset password"
          >
            Reset Password
          </button>
        </div>
      </header>

      {passwordResetSuccess && (
        <div className="max-w-3xl mx-auto px-4 pt-4">
          <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800 font-medium">
            Password updated successfully.
          </div>
        </div>
      )}

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">

        {/* Summary stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Sessions', value: sessions.length },
            {
              label: 'Avg Accuracy',
              value: avgAccuracy !== null ? `${avgAccuracy}%` : '—',
              sub: accuracyGain !== null
                ? `${accuracyGain >= 0 ? '+' : ''}${accuracyGain}% since first`
                : null,
              subColor: accuracyGain >= 0 ? 'text-green-600' : 'text-red-500',
            },
            { label: 'Avg Pace', value: avgWpm != null ? `${avgWpm} wpm` : '—' },
            { label: 'Avg Phrasing', value: avgPhrasing != null ? `${avgPhrasing}%` : '—' },
            { label: 'Avg Comprehension', value: avgComprehension != null ? `${avgComprehension}%` : '—' },
          ].map(stat => (
            <div key={stat.label} className="bg-white rounded-2xl border border-slate-200 p-4 text-center">
              <p className="text-2xl font-bold text-slate-800">{stat.value}</p>
              <p className="text-xs text-slate-500 mt-1">{stat.label}</p>
              {stat.sub && (
                <p className={`text-xs mt-0.5 font-medium ${stat.subColor}`}>{stat.sub}</p>
              )}
            </div>
          ))}
        </div>

        {/* Performance trends */}
        {sessions.length > 0 && (() => {
          const accuracy = sessions.map(s => s.score_accuracy)
          const wpm = sessions.map(s => s.score_wpm)
          const phrasing = sessions.map(s => s.score_phrasing ?? s.score_fluency ?? 0)
          const comprehension = sessions
            .filter(s => s.score_comprehension != null)
            .map(s => s.score_comprehension)
          const wpmMax = Math.ceil(Math.max(wpmTarget * 1.2, ...wpm) / 10) * 10
          return (
            <div>
              <h2 className="text-base font-semibold text-slate-700 mb-3">Performance Trends</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <MetricCard label="Accuracy" values={accuracy} color="#3b82f6" fillColor="#dbeafe" unit="%" />
                <MetricCard
                  label="Pace"
                  values={wpm}
                  color="#10b981"
                  fillColor="#d1fae5"
                  unit=" wpm"
                  referenceY={wpmTarget}
                  yMin={0}
                  yMax={wpmMax}
                  refLabel={`Dashed line — target: ${wpmTarget} wpm`}
                />
                <MetricCard label="Phrasing" values={phrasing} color="#8b5cf6" fillColor="#ede9fe" unit="%" />
                {comprehension.length > 0 && (
                  <MetricCard label="Comprehension" values={comprehension} color="#14b8a6" fillColor="#ccfbf1" unit="%" />
                )}
              </div>
            </div>
          )
        })()}

        {/* Difficult words */}
        {difficultWords.length > 0 && (
          <div className="bg-amber-50 rounded-2xl border border-amber-100 p-5">
            <h2 className="text-sm font-semibold text-amber-800 mb-3">
              Recurring difficult words ({difficultWords.length})
            </h2>
            <div className="flex flex-wrap gap-2">
              {difficultWords.map(word => (
                <span key={word} className="px-3 py-1 bg-amber-100 text-amber-900 rounded-full text-sm font-medium">
                  {word}
                </span>
              ))}
            </div>
            <p className="text-xs text-amber-700 mt-3">
              These words were mispronounced or skipped in 2 or more sessions. Suggest the student practise them before the next passage.
            </p>
          </div>
        )}

        {/* Vocab progress */}
        {vocabStats && (
          <div>
            <h2 className="text-base font-semibold text-slate-700 mb-3">Vocab Progress</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
              <div className="bg-white rounded-2xl border border-slate-200 p-4 text-center">
                <p data-testid="vocab-stat-mastered" className="text-2xl font-bold text-slate-800">{vocabStats.mastered}</p>
                <p className="text-xs text-slate-500 mt-1">Mastered</p>
                <p className="text-xs text-slate-400 mt-0.5">of {totalVocab}</p>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 p-4 text-center">
                <p data-testid="vocab-stat-in-progress" className="text-2xl font-bold text-slate-800">{vocabStats.inProgress}</p>
                <p className="text-xs text-slate-500 mt-1">In Progress</p>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 p-4 text-center">
                <p data-testid="vocab-stat-due-now" className={`text-2xl font-bold ${vocabStats.dueNow > 0 ? 'text-amber-600' : 'text-slate-800'}`}>{vocabStats.dueNow}</p>
                <p className="text-xs text-slate-500 mt-1">Due Now</p>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 p-4 text-center">
                <p data-testid="vocab-stat-from-reading" className="text-2xl font-bold text-slate-800">{vocabStats.fromReading}</p>
                <p className="text-xs text-slate-500 mt-1">From Reading</p>
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-4">
              <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                <span>Mastery</span>
                <span>{vocabStats.mastered} / {totalVocab}</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-500 transition-all"
                  style={{ width: `${vocabStats.masteryPct}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Drill activity */}
        {drillStats && (
          <div>
            <h2 className="text-base font-semibold text-slate-700 mb-3">Drill Activity</h2>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div className="bg-white rounded-2xl border border-slate-200 p-4 text-center">
                <p data-testid="drill-stat-attempts" className="text-2xl font-bold text-slate-800">{drillStats.attempts}</p>
                <p className="text-xs text-slate-500 mt-1">Attempts</p>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 p-4 text-center">
                <p data-testid="drill-stat-distinct-words" className="text-2xl font-bold text-slate-800">{drillStats.distinctWords}</p>
                <p className="text-xs text-slate-500 mt-1">Distinct Words</p>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 p-4 text-center">
                <p data-testid="drill-stat-correct-rate" className={`text-2xl font-bold ${drillStats.correctRate >= 60 ? 'text-green-600' : drillStats.correctRate >= 40 ? 'text-yellow-600' : 'text-red-500'}`}>{drillStats.correctRate}%</p>
                <p className="text-xs text-slate-500 mt-1">Correct</p>
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Word</th>
                    <th className="text-center px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Result</th>
                    <th className="text-center px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Attempt</th>
                    <th className="text-center px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {drillAttempts.map((a, i) => (
                    <tr key={a.id} className={i < drillAttempts.length - 1 ? 'border-b border-slate-100' : ''}>
                      <td className="px-3 py-2 font-medium text-slate-800">{a.stumble_word}</td>
                      <td className="px-3 py-2 text-center">
                        {a.was_correct ? (
                          <span className="text-green-600 font-semibold" aria-label="correct">✓</span>
                        ) : (
                          <span className="text-red-500 font-semibold" aria-label="incorrect">✗</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center text-slate-500 text-xs">{a.attempt_index}/3</td>
                      <td className="px-3 py-2 text-center text-slate-400 text-xs">{new Date(a.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Session progress table */}
        <div>
          <h2 className="text-base font-semibold text-slate-700 mb-3">Session Progress</h2>
          {sessions.length === 0 ? (
            <p className="text-sm text-slate-400">No sessions yet.</p>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">#</th>
                    <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Passage</th>
                    <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Date</th>
                    <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Accuracy</th>
                    <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">WPM</th>
                    <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Phrasing</th>
                    <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Skipped</th>
                    <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Subs</th>
                    <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Comp.</th>
                    <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Cost</th>
                    <th className="px-3 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s, i) => {
                    const prev = sessions[i - 1] ?? null
                    const phrasing = s.score_phrasing ?? s.score_fluency ?? 0
                    const prevPhrasing = prev ? (prev.score_phrasing ?? prev.score_fluency ?? 0) : null
                    const wpmColor = Math.abs(s.score_wpm - wpmTarget) <= 15
                      ? 'text-green-600'
                      : s.score_wpm < wpmTarget ? 'text-yellow-600' : 'text-indigo-600'
                    const { outlier, reason } = isOutlierSession(s, sessions)

                    return (
                      <React.Fragment key={s.id}>
                      <tr className={i < sessions.length - 1 ? 'border-b border-slate-100' : ''}>
                        <td className="px-3 py-3 text-slate-400 text-xs">{i + 1}</td>
                        <td className="px-3 py-3 text-slate-800 max-w-[180px]">
                          <span className="block truncate">{s.passages?.title}</span>
                          {outlier && (
                            <span
                              title={reason}
                              data-testid={`outlier-flag-${s.id}`}
                              className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900"
                            >
                              Outlier — review
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-slate-500 text-xs whitespace-nowrap">
                          {new Date(s.created_at).toLocaleDateString()}
                        </td>
                        <TrendCell
                          value={s.score_accuracy}
                          display={`${s.score_accuracy}%`}
                          prev={prev?.score_accuracy}
                          goodDirection="up"
                        />
                        <td className="px-3 py-3 text-center">
                          <span className={`font-semibold ${wpmColor}`}>{s.score_wpm}</span>
                          {trend(s.score_wpm, prev?.score_wpm) && (
                            <span className={`ml-1 text-xs font-bold ${
                              trend(s.score_wpm, prev?.score_wpm) === '↑' ? 'text-green-500' : 'text-red-400'
                            }`}>
                              {trend(s.score_wpm, prev?.score_wpm)}
                            </span>
                          )}
                        </td>
                        <TrendCell
                          value={phrasing}
                          display={`${phrasing}%`}
                          prev={prevPhrasing}
                          goodDirection="up"
                        />
                        <td className="px-3 py-3 text-center text-red-500 font-semibold">
                          {s.count_omissions ?? '—'}
                        </td>
                        <td className="px-3 py-3 text-center text-amber-500 font-semibold">
                          {s.count_substitutions ?? '—'}
                        </td>
                        {s.score_comprehension != null ? (
                          <td className="px-3 py-3 text-center">
                            <span className="font-semibold text-slate-800">{s.score_comprehension}%</span>
                            {trend(s.score_comprehension, prev?.score_comprehension ?? null) && (
                              <span className={`ml-1 text-xs font-bold ${
                                trend(s.score_comprehension, prev?.score_comprehension ?? null) === '↑'
                                  ? 'text-green-500' : 'text-red-400'
                              }`}>
                                {trend(s.score_comprehension, prev?.score_comprehension ?? null)}
                              </span>
                            )}
                            <button
                              onClick={() => handleResetComprehension(s.id)}
                              className="block mx-auto mt-0.5 text-xs text-red-400 hover:text-red-600 focus-visible:outline-none focus-visible:underline"
                              aria-label={`Reset comprehension for session ${i + 1}`}
                            >
                              Reset
                            </button>
                          </td>
                        ) : (
                          <td className="px-3 py-3 text-center text-slate-300 text-xs">—</td>
                        )}
                        <td className="px-3 py-3 text-center text-xs font-mono text-slate-500">
                          {formatCost(computeSessionCost(s))}
                        </td>
                        <td className="px-3 py-3 text-center">
                          {s.feedback && (
                            <button
                              onClick={() => setOpenFeedbackId(openFeedbackId === s.id ? null : s.id)}
                              className="text-xs text-indigo-500 hover:text-indigo-700 focus-visible:underline focus-visible:outline-none whitespace-nowrap"
                              aria-label={`${openFeedbackId === s.id ? 'Hide' : 'Show'} feedback for session ${i + 1}`}
                            >
                              {openFeedbackId === s.id ? 'Hide' : 'Feedback'}
                            </button>
                          )}
                        </td>
                      </tr>
                      {openFeedbackId === s.id && (
                        <tr className="bg-indigo-50">
                          <td colSpan={11} className="px-4 py-3">
                            <FeedbackPanel raw={s.feedback} />
                          </td>
                        </tr>
                      )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
