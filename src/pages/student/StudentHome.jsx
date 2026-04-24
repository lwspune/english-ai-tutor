import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'

export default function StudentHome() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [passages, setPassages] = useState([])
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: p }, { data: s }] = await Promise.all([
        supabase.from('passages').select('*').order('created_at', { ascending: false }),
        supabase.from('sessions').select('*, passages(title)').eq('student_id', profile.id).order('created_at', { ascending: false }),
      ])
      const allSessions = s ?? []
      const readPassageIds = new Set(allSessions.map(s => s.passage_id))
      setPassages((p ?? []).filter(p => !readPassageIds.has(p.id)))
      setSessions(allSessions.slice(0, 10))
      setLoading(false)
    }
    load()
  }, [profile.id])

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-800">English AI Tutor</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600">{profile.full_name}</span>
          <button onClick={signOut} className="text-sm text-gray-500 hover:text-gray-800">Sign out</button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <button
          onClick={() => navigate('/student/progress')}
          className="w-full bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center justify-between text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          aria-label="View my progress"
        >
          <div>
            <p className="text-sm font-semibold text-blue-700">My Progress</p>
            <p className="text-xs text-blue-400 mt-0.5">View your reading trends over time</p>
          </div>
          <span className="text-blue-400 text-lg" aria-hidden="true">→</span>
        </button>

        <section>
          <h2 className="text-base font-semibold text-gray-700 mb-3">Assigned Passages</h2>
          {loading ? (
            <p className="text-sm text-gray-400">Loading...</p>
          ) : passages.length === 0 ? (
            <p className="text-sm text-gray-400">No passages assigned yet.</p>
          ) : (
            <div className="space-y-2">
              {passages.map(p => (
                <div key={p.id} className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{p.title}</p>
                    <p className="text-xs text-gray-400">{p.word_count} words · Grade {p.grade_level}</p>
                  </div>
                  <button
                    onClick={() => navigate(`/student/session/${p.id}`)}
                    className="bg-blue-600 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Start Reading
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-700 mb-3">Recent Sessions</h2>
          {sessions.length === 0 ? (
            <p className="text-sm text-gray-400">No sessions yet.</p>
          ) : (
            <div className="space-y-2">
              {sessions.map(s => (
                <div
                  key={s.id}
                  onClick={() => navigate(`/student/report/${s.id}`)}
                  className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center justify-between cursor-pointer hover:border-blue-300 transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-800">{s.passages?.title}</p>
                    <p className="text-xs text-gray-400">{new Date(s.created_at).toLocaleDateString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-blue-600">{s.score_accuracy}%</p>
                    <p className="text-xs text-gray-400">{s.score_wpm} WPM</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
