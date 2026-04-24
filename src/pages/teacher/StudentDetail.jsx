import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { computeAvgComprehension } from '../../lib/studentStats'
import { MetricCard } from '../../components/PerformanceCharts'
import { WPM_TARGETS } from '../../lib/wpmTargets'

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
      <span className="font-semibold text-gray-800">{display}</span>
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

export default function StudentDetail() {
  const { studentId } = useParams()
  const navigate = useNavigate()
  const [student, setStudent] = useState(null)
  const [sessions, setSessions] = useState([])

  useEffect(() => {
    async function load() {
      const [{ data: p }, { data: s }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', studentId).single(),
        supabase.from('sessions')
          .select('*, passages(title)')
          .eq('student_id', studentId)
          .order('created_at', { ascending: true }),
      ])
      setStudent(p)
      setSessions(s ?? [])
    }
    load()
  }, [studentId])

  if (!student) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
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
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate('/teacher')} className="text-gray-500 hover:text-gray-800 text-sm">← Back</button>
        <h1 className="text-base font-semibold text-gray-800">{student.full_name}</h1>
        <span className="text-sm text-gray-400">Grade {student.grade}</span>
        {wpmTarget && (
          <span className="text-xs text-gray-400 ml-auto">WPM target: {wpmTarget}</span>
        )}
      </header>

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
            <div key={stat.label} className="bg-white rounded-2xl border border-gray-200 p-4 text-center">
              <p className="text-2xl font-bold text-gray-800">{stat.value}</p>
              <p className="text-xs text-gray-500 mt-1">{stat.label}</p>
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
              <h2 className="text-base font-semibold text-gray-700 mb-3">Performance Trends</h2>
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

        {/* Session progress table */}
        <div>
          <h2 className="text-base font-semibold text-gray-700 mb-3">Session Progress</h2>
          {sessions.length === 0 ? (
            <p className="text-sm text-gray-400">No sessions yet.</p>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">#</th>
                    <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Passage</th>
                    <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                    <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Accuracy</th>
                    <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">WPM</th>
                    <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Phrasing</th>
                    <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Skipped</th>
                    <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Subs</th>
                    <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Comp.</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s, i) => {
                    const prev = sessions[i - 1] ?? null
                    const phrasing = s.score_phrasing ?? s.score_fluency ?? 0
                    const prevPhrasing = prev ? (prev.score_phrasing ?? prev.score_fluency ?? 0) : null
                    const wpmColor = Math.abs(s.score_wpm - wpmTarget) <= 15
                      ? 'text-green-600'
                      : s.score_wpm < wpmTarget ? 'text-yellow-600' : 'text-blue-600'

                    return (
                      <tr key={s.id} className={i < sessions.length - 1 ? 'border-b border-gray-100' : ''}>
                        <td className="px-3 py-3 text-gray-400 text-xs">{i + 1}</td>
                        <td className="px-3 py-3 text-gray-800 max-w-[120px] truncate">{s.passages?.title}</td>
                        <td className="px-3 py-3 text-gray-500 text-xs whitespace-nowrap">
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
                            <span className="font-semibold text-gray-800">{s.score_comprehension}%</span>
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
                          <td className="px-3 py-3 text-center text-gray-300 text-xs">—</td>
                        )}
                      </tr>
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
