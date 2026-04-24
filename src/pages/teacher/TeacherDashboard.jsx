import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'

export default function TeacherDashboard() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [aiFeedback, setAiFeedback] = useState(true)
  const [togglingAi, setTogglingAi] = useState(false)

  async function toggleAiFeedback() {
    setTogglingAi(true)
    const next = !aiFeedback
    const { error } = await supabase
      .from('app_settings')
      .update({ ai_feedback_enabled: next })
      .eq('id', true)
    if (!error) setAiFeedback(next)
    setTogglingAi(false)
  }

  useEffect(() => {
    supabase.from('app_settings').select('ai_feedback_enabled').single()
      .then(({ data }) => { if (data) setAiFeedback(data.ai_feedback_enabled) })
  }, [])

  useEffect(() => {
    async function load() {
      const { data: studentProfiles } = await supabase
        .from('profiles')
        .select('id, full_name, grade')
        .eq('role', 'student')
        .order('full_name')

      if (!studentProfiles?.length) { setLoading(false); return }

      const { data: sessionStats } = await supabase
        .from('sessions')
        .select('student_id, score_accuracy, score_wpm, created_at')
        .in('student_id', studentProfiles.map(s => s.id))

      const statsMap = {}
      for (const s of sessionStats ?? []) {
        if (!statsMap[s.student_id]) statsMap[s.student_id] = { sessions: 0, totalAccuracy: 0, totalWpm: 0, lastSession: null }
        statsMap[s.student_id].sessions++
        statsMap[s.student_id].totalAccuracy += s.score_accuracy
        statsMap[s.student_id].totalWpm += s.score_wpm
        if (!statsMap[s.student_id].lastSession || s.created_at > statsMap[s.student_id].lastSession) {
          statsMap[s.student_id].lastSession = s.created_at
        }
      }

      setStudents(studentProfiles.map(s => ({
        ...s,
        sessions: statsMap[s.id]?.sessions ?? 0,
        avgAccuracy: statsMap[s.id] ? Math.round(statsMap[s.id].totalAccuracy / statsMap[s.id].sessions) : null,
        avgWpm: statsMap[s.id] ? Math.round(statsMap[s.id].totalWpm / statsMap[s.id].sessions) : null,
        lastSession: statsMap[s.id]?.lastSession ?? null,
      })))
      setLoading(false)
    }
    load()
  }, [])

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-800">Teacher Dashboard</h1>
        <div className="flex items-center gap-3 flex-wrap justify-end">
          <button onClick={() => navigate('/teacher/passages')} className="text-sm text-blue-600 hover:text-blue-800 font-medium">Manage Passages</button>
          <button onClick={() => navigate('/teacher/completion')} className="text-sm text-blue-600 hover:text-blue-800 font-medium">Passage Completion</button>
          <button
            onClick={toggleAiFeedback}
            disabled={togglingAi}
            className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded-full border transition-colors ${
              aiFeedback
                ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
                : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
            } disabled:opacity-50`}
          >
            <span className={`w-2 h-2 rounded-full ${aiFeedback ? 'bg-white' : 'bg-gray-400'}`} />
            AI Feedback {aiFeedback ? 'On' : 'Off'}
          </button>
          <span className="text-sm text-gray-600">{profile.full_name}</span>
          <button onClick={signOut} className="text-sm text-gray-500 hover:text-gray-800">Sign out</button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">
        <h2 className="text-base font-semibold text-gray-700 mb-4">Class Performance</h2>

        {loading ? (
          <p className="text-sm text-gray-400">Loading...</p>
        ) : students.length === 0 ? (
          <p className="text-sm text-gray-400">No students found.</p>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Student</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Sessions</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Avg Accuracy</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Avg WPM</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Last Session</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s, i) => (
                  <tr
                    key={s.id}
                    onClick={() => navigate(`/teacher/student/${s.id}`)}
                    className={`cursor-pointer hover:bg-blue-50 transition-colors ${i < students.length - 1 ? 'border-b border-gray-100' : ''}`}
                  >
                    <td className="px-4 py-3 font-medium text-gray-800">{s.full_name}
                      <span className="ml-2 text-xs text-gray-400">Grade {s.grade}</span>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600">{s.sessions}</td>
                    <td className="px-4 py-3 text-center">
                      {s.avgAccuracy !== null ? (
                        <span className={`font-semibold ${s.avgAccuracy >= 80 ? 'text-green-600' : s.avgAccuracy >= 60 ? 'text-yellow-600' : 'text-red-500'}`}>
                          {s.avgAccuracy}%
                        </span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600">{s.avgWpm ?? <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-3 text-center text-gray-400 text-xs">
                      {s.lastSession ? new Date(s.lastSession).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}
