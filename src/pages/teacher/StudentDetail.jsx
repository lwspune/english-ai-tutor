import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

export default function StudentDetail() {
  const { studentId } = useParams()
  const navigate = useNavigate()
  const [student, setStudent] = useState(null)
  const [sessions, setSessions] = useState([])

  useEffect(() => {
    async function load() {
      const [{ data: p }, { data: s }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', studentId).single(),
        supabase.from('sessions').select('*, passages(title)').eq('student_id', studentId).order('created_at', { ascending: false }),
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

  const avgAccuracy = sessions.length ? Math.round(sessions.reduce((a, s) => a + s.score_accuracy, 0) / sessions.length) : null
  const avgWpm = sessions.length ? Math.round(sessions.reduce((a, s) => a + s.score_wpm, 0) / sessions.length) : null

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate('/teacher')} className="text-gray-500 hover:text-gray-800 text-sm">← Back</button>
        <h1 className="text-base font-semibold text-gray-800">{student.full_name}</h1>
        <span className="text-sm text-gray-400">Grade {student.grade}</span>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Total Sessions', value: sessions.length },
            { label: 'Avg Accuracy', value: avgAccuracy !== null ? `${avgAccuracy}%` : '—' },
            { label: 'Avg WPM', value: avgWpm ?? '—' },
          ].map(stat => (
            <div key={stat.label} className="bg-white rounded-2xl border border-gray-200 p-4 text-center">
              <p className="text-2xl font-bold text-gray-800">{stat.value}</p>
              <p className="text-xs text-gray-500 mt-1">{stat.label}</p>
            </div>
          ))}
        </div>

        <div>
          <h2 className="text-base font-semibold text-gray-700 mb-3">Session History</h2>
          {sessions.length === 0 ? (
            <p className="text-sm text-gray-400">No sessions yet.</p>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Passage</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Accuracy</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">WPM</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Fluency</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s, i) => (
                    <tr key={s.id} className={i < sessions.length - 1 ? 'border-b border-gray-100' : ''}>
                      <td className="px-4 py-3 text-gray-800">{s.passages?.title}</td>
                      <td className="px-4 py-3 text-center text-gray-500">{new Date(s.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`font-semibold ${s.score_accuracy >= 80 ? 'text-green-600' : s.score_accuracy >= 60 ? 'text-yellow-600' : 'text-red-500'}`}>
                          {s.score_accuracy}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-gray-600">{s.score_wpm}</td>
                      <td className="px-4 py-3 text-center text-gray-600">{s.score_fluency}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
