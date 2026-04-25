import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

export default function PassageCompletion() {
  const navigate = useNavigate()
  const [passages, setPassages] = useState([])
  const [students, setStudents] = useState([])
  const [readSet, setReadSet] = useState(new Set())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: p }, { data: st }, { data: se }] = await Promise.all([
        supabase.from('passages').select('id, title, grade_level, difficulty').order('created_at', { ascending: false }),
        supabase.from('profiles').select('id, full_name, grade').eq('role', 'student').order('full_name'),
        supabase.from('sessions').select('student_id, passage_id'),
      ])
      setPassages(p ?? [])
      setStudents(st ?? [])
      setReadSet(new Set((se ?? []).map(s => `${s.student_id}:${s.passage_id}`)))
      setLoading(false)
    }
    load()
  }, [])

  const totalStudents = students.length

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate('/teacher')}
          className="text-gray-500 hover:text-gray-800 text-sm min-h-[44px] flex items-center"
          aria-label="Back to dashboard"
        >
          ← Back
        </button>
        <h1 className="text-base font-semibold text-gray-800">Passage Completion</h1>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        {loading ? (
          <p className="text-sm text-gray-400">Loading...</p>
        ) : passages.length === 0 ? (
          <p className="text-sm text-gray-400">No passages yet.</p>
        ) : totalStudents === 0 ? (
          <p className="text-sm text-gray-400">No students yet.</p>
        ) : (
          passages.map(p => {
            const doneCount = students.filter(s => readSet.has(`${s.id}:${p.id}`)).length
            const notDone = students.filter(s => !readSet.has(`${s.id}:${p.id}`))
            const allDone = notDone.length === 0
            const pct = Math.round((doneCount / totalStudents) * 100)

            return (
              <div key={p.id} className="bg-white rounded-2xl border border-gray-200 p-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{p.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">Grade {p.grade_level} · {p.difficulty ?? 'Easy'}</p>
                  </div>
                  {allDone ? (
                    <span className="shrink-0 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-2.5 py-1 rounded-full">
                      ✓ All done
                    </span>
                  ) : (
                    <span className="shrink-0 text-xs font-semibold text-gray-600">
                      {doneCount} / {totalStudents}
                    </span>
                  )}
                </div>

                {/* Progress bar */}
                <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden mb-3">
                  <div
                    className={`h-full rounded-full transition-all ${allDone ? 'bg-green-500' : 'bg-blue-500'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>

                {/* Not-yet-read students */}
                {!allDone && (
                  <div>
                    <p className="text-xs text-gray-400 mb-2">Not read yet ({notDone.length}):</p>
                    <div className="flex flex-wrap gap-1.5">
                      {notDone.map(s => (
                        <button
                          key={s.id}
                          onClick={() => navigate(`/teacher/student/${s.id}`)}
                          className="text-xs px-2.5 py-1 bg-red-50 text-red-700 border border-red-100 rounded-full hover:bg-red-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                        >
                          {s.full_name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </main>
    </div>
  )
}
