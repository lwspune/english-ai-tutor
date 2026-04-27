import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import { MetricCard } from '../../components/PerformanceCharts'
import { WPM_TARGETS } from '../../lib/wpmTargets'

export default function StudentProgress() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('sessions')
        .select('score_accuracy, score_wpm, score_phrasing, score_fluency, score_comprehension, created_at')
        .eq('student_id', profile.id)
        .order('created_at', { ascending: true })
      setSessions(data ?? [])
      setLoading(false)
    }
    load()
  }, [profile.id])

  const wpmTarget = WPM_TARGETS[profile.grade] ?? 150

  const accuracy = sessions.map(s => s.score_accuracy)
  const wpm = sessions.map(s => s.score_wpm)
  const phrasing = sessions.map(s => s.score_phrasing ?? s.score_fluency ?? 0)
  const comprehension = sessions
    .filter(s => s.score_comprehension != null)
    .map(s => s.score_comprehension)

  const wpmMax = wpm.length
    ? Math.ceil(Math.max(wpmTarget * 1.2, ...wpm) / 10) * 10
    : Math.ceil(wpmTarget * 1.2 / 10) * 10

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate('/student')}
          className="text-gray-500 hover:text-gray-800 text-sm min-h-[44px] flex items-center"
          aria-label="Back to home"
        >
          ← Back
        </button>
        <h1 className="text-base font-semibold text-gray-800">My Progress</h1>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {loading ? (
          <p className="text-sm text-gray-400">Loading...</p>
        ) : sessions.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-500 text-sm">No sessions yet.</p>
            <p className="text-gray-400 text-xs mt-1">Complete a reading to see your progress here.</p>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-2xl border border-gray-200 px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-gray-800">{sessions.length}</p>
                <p className="text-xs text-gray-500 mt-0.5">Sessions completed</p>
              </div>
              {sessions.length >= 2 && (
                <p className="text-xs text-gray-400 text-right">
                  {new Date(sessions[0].created_at).toLocaleDateString()}
                  {' → '}
                  {new Date(sessions[sessions.length - 1].created_at).toLocaleDateString()}
                </p>
              )}
            </div>

            <MetricCard
              label="Accuracy"
              values={accuracy}
              color="#3b82f6"
              fillColor="#dbeafe"
              unit="%"
            />
            <MetricCard
              label="Pace"
              values={wpm}
              color="#10b981"
              fillColor="#d1fae5"
              unit=" wpm"
              referenceY={wpmTarget}
              yMin={0}
              yMax={wpmMax}
              refLabel={`Dashed line — ${profile.grade === 'MBA' ? 'MBA' : `Grade ${profile.grade}`} target: ${wpmTarget} wpm`}
            />
            <MetricCard
              label="Phrasing"
              values={phrasing}
              color="#8b5cf6"
              fillColor="#ede9fe"
              unit="%"
            />
            {comprehension.length > 0 && (
              <MetricCard
                label="Comprehension"
                values={comprehension}
                color="#14b8a6"
                fillColor="#ccfbf1"
                unit="%"
              />
            )}
          </>
        )}
      </main>
    </div>
  )
}
