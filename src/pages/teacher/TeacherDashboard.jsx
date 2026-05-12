import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import AddStudentModal from '../../components/AddStudentModal'
import { computeSessionCost, formatCost } from '../../lib/costUtils'

export default function TeacherDashboard() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [aiFeedback, setAiFeedback] = useState(true)
  const [togglingAi, setTogglingAi] = useState(false)
  const [classCode, setClassCode] = useState('')
  const [codeCopied, setCodeCopied] = useState(false)
  const [dailyLimit, setDailyLimit] = useState(null)
  const [updatingLimit, setUpdatingLimit] = useState(false)
  const [showAddStudent, setShowAddStudent] = useState(false)
  const [studentFetchTrigger, setStudentFetchTrigger] = useState(0)
  const [classVocabMastery, setClassVocabMastery] = useState(null)

  function copyCode() {
    navigator.clipboard.writeText(classCode)
    setCodeCopied(true)
    setTimeout(() => setCodeCopied(false), 2000)
  }

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

  async function updateDailyLimit(next) {
    const clamped = Math.max(1, Math.min(20, next))
    if (clamped === dailyLimit || updatingLimit) return
    setUpdatingLimit(true)
    const { error } = await supabase
      .from('app_settings')
      .update({ daily_session_limit: clamped })
      .eq('id', true)
    if (!error) setDailyLimit(clamped)
    setUpdatingLimit(false)
  }

  useEffect(() => {
    supabase.from('app_settings').select('ai_feedback_enabled, class_code, daily_session_limit').single()
      .then(({ data }) => {
        if (data) {
          setAiFeedback(data.ai_feedback_enabled)
          setClassCode(data.class_code ?? '')
          setDailyLimit(data.daily_session_limit ?? 5)
        }
      })
  }, [])

  useEffect(() => {
    async function loadStudents() {
      setLoading(true)
      const { data: studentProfiles } = await supabase
        .from('profiles')
        .select('id, full_name, grade')
        .eq('role', 'student')
        .order('full_name')

      if (!studentProfiles?.length) { setLoading(false); return }

      const { data: sessionStats } = await supabase
        .from('sessions')
        .select('student_id, score_accuracy, score_wpm, created_at, whisper_duration_seconds, llm_input_tokens, llm_output_tokens')
        .in('student_id', studentProfiles.map(s => s.id))

      const statsMap = {}
      for (const s of sessionStats ?? []) {
        if (!statsMap[s.student_id]) statsMap[s.student_id] = { sessions: 0, totalAccuracy: 0, totalWpm: 0, lastSession: null, totalCost: null }
        statsMap[s.student_id].sessions++
        statsMap[s.student_id].totalAccuracy += s.score_accuracy
        statsMap[s.student_id].totalWpm += s.score_wpm
        if (!statsMap[s.student_id].lastSession || s.created_at > statsMap[s.student_id].lastSession) {
          statsMap[s.student_id].lastSession = s.created_at
        }
        const sessionCost = computeSessionCost(s)
        if (sessionCost !== null) {
          statsMap[s.student_id].totalCost = (statsMap[s.student_id].totalCost ?? 0) + sessionCost
        }
      }

      setStudents(studentProfiles.map(s => ({
        ...s,
        sessions: statsMap[s.id]?.sessions ?? 0,
        avgAccuracy: statsMap[s.id] ? Math.round(statsMap[s.id].totalAccuracy / statsMap[s.id].sessions) : null,
        avgWpm: statsMap[s.id] ? Math.round(statsMap[s.id].totalWpm / statsMap[s.id].sessions) : null,
        lastSession: statsMap[s.id]?.lastSession ?? null,
        totalCost: statsMap[s.id]?.totalCost ?? null,
      })))
      setLoading(false)
    }
    loadStudents()
  }, [studentFetchTrigger])

  useEffect(() => {
    async function loadVocabStats() {
      const eligibleIds = students.filter(s => ['11', '12', 'MBA'].includes(String(s.grade))).map(s => s.id)
      if (!eligibleIds.length) {
        setClassVocabMastery(null)
        return
      }
      const { count: totalWords } = await supabase
        .from('vocabulary_words')
        .select('*', { count: 'exact', head: true })
      const { data: progressRows } = await supabase
        .from('student_word_progress')
        .select('student_id, mastered_at')
        .in('student_id', eligibleIds)
      const masteredCount = (progressRows ?? []).filter(r => r.mastered_at).length
      if (!totalWords) {
        setClassVocabMastery(null)
        return
      }
      setClassVocabMastery(Math.round(100 * masteredCount / (eligibleIds.length * totalWords)))
    }
    if (students.length > 0) loadVocabStats()
  }, [students])

  function handleModalClose(didAdd) {
    setShowAddStudent(false)
    if (didAdd) setStudentFetchTrigger(t => t + 1)
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Identity header */}
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-800">Teacher Dashboard</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-600">{profile.full_name}</span>
          <button onClick={signOut} className="text-sm text-slate-500 hover:text-slate-800">Sign out</button>
        </div>
      </header>

      {/* Controls strip: nav links + settings */}
      <div className="bg-white border-b border-slate-100 px-4 py-2 flex items-center gap-4 flex-wrap">
        <button onClick={() => navigate('/teacher/passages')} className="text-sm text-indigo-600 hover:text-indigo-800 font-medium">Manage Passages</button>
        <button onClick={() => navigate('/teacher/completion')} className="text-sm text-indigo-600 hover:text-indigo-800 font-medium">Passage Completion</button>
        <button onClick={() => navigate('/teacher/audio-review')} className="text-sm text-indigo-600 hover:text-indigo-800 font-medium">Audio Review</button>
        <div className="h-4 w-px bg-slate-200 mx-1 hidden sm:block" />
        {classCode && (
          <button
            onClick={copyCode}
            className="flex items-center gap-1.5 text-xs font-mono bg-slate-100 hover:bg-slate-200 text-slate-700 px-2.5 py-1.5 rounded-lg transition-colors"
            aria-label="Copy class code"
          >
            <span className="text-slate-400 font-sans">Code:</span>
            <span className="font-semibold tracking-widest">{classCode}</span>
            <span className="text-slate-400">{codeCopied ? '✓' : '⎘'}</span>
          </button>
        )}
        {dailyLimit !== null && (
          <div className="flex items-center gap-1.5" aria-label="Daily passage limit per student">
            <span className="text-xs text-slate-500">Daily limit:</span>
            <button
              onClick={() => updateDailyLimit(dailyLimit - 1)}
              disabled={dailyLimit <= 1 || updatingLimit}
              className="w-7 h-7 flex items-center justify-center rounded-md border border-slate-300 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              aria-label="Decrease daily limit"
            >−</button>
            <span className="w-5 text-center text-sm font-semibold text-slate-800">{dailyLimit}</span>
            <button
              onClick={() => updateDailyLimit(dailyLimit + 1)}
              disabled={dailyLimit >= 20 || updatingLimit}
              className="w-7 h-7 flex items-center justify-center rounded-md border border-slate-300 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              aria-label="Increase daily limit"
            >+</button>
          </div>
        )}
        <button
          onClick={toggleAiFeedback}
          disabled={togglingAi}
          className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded-full border transition-colors ${
            aiFeedback
              ? 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700'
              : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
          } disabled:opacity-50`}
        >
          <span className={`w-2 h-2 rounded-full ${aiFeedback ? 'bg-white' : 'bg-slate-400'}`} />
          AI Feedback {aiFeedback ? 'On' : 'Off'}
        </button>
      </div>

      {showAddStudent && <AddStudentModal onClose={handleModalClose} />}

      <main className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-slate-700">Class Performance</h2>
          <button
            onClick={() => setShowAddStudent(true)}
            className="flex items-center gap-1.5 text-sm font-medium bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            aria-label="Add student"
          >
            + Add Student
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-slate-400">Loading...</p>
        ) : students.length === 0 ? (
          <p className="text-sm text-slate-400">No students found.</p>
        ) : (() => {
          const classTotal = students.reduce((sum, s) => s.totalCost !== null ? sum + s.totalCost : sum, 0)
          const hasAnyCost = students.some(s => s.totalCost !== null)
          const totalSessions = students.reduce((sum, s) => sum + s.sessions, 0)
          const studentsWithSessions = students.filter(s => s.sessions > 0)
          const classAvgAccuracy = studentsWithSessions.length
            ? Math.round(studentsWithSessions.reduce((sum, s) => sum + s.avgAccuracy, 0) / studentsWithSessions.length)
            : null
          return (
            <>
              {/* Summary stat chips */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                <div data-testid="stat-students" className="bg-white rounded-2xl border border-slate-200 p-4 text-center">
                  <p className="text-2xl font-bold text-slate-800">{students.length}</p>
                  <p className="text-xs text-slate-500 mt-1">Students</p>
                </div>
                <div data-testid="stat-sessions" className="bg-white rounded-2xl border border-slate-200 p-4 text-center">
                  <p className="text-2xl font-bold text-slate-800">{totalSessions}</p>
                  <p className="text-xs text-slate-500 mt-1">Sessions</p>
                </div>
                <div data-testid="stat-accuracy" className="bg-white rounded-2xl border border-slate-200 p-4 text-center">
                  <p className="text-2xl font-bold text-slate-800">
                    {classAvgAccuracy !== null ? `${classAvgAccuracy}%` : '—'}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Avg Accuracy</p>
                </div>
                <div data-testid="stat-vocab" className="bg-white rounded-2xl border border-slate-200 p-4 text-center">
                  <p className="text-2xl font-bold text-slate-800">
                    {classVocabMastery !== null ? `${classVocabMastery}%` : '—'}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Vocab Mastery</p>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Student</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Sessions</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Avg Accuracy</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Avg WPM</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Last Session</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((s, i) => (
                      <tr
                        key={s.id}
                        onClick={() => navigate(`/teacher/student/${s.id}`)}
                        className={`cursor-pointer hover:bg-indigo-50 transition-colors ${i < students.length - 1 ? 'border-b border-slate-100' : ''}`}
                      >
                        <td className="px-4 py-3 font-medium text-slate-800">{s.full_name}
                          <span className="ml-2 text-xs text-slate-400">{s.grade === 'MBA' ? 'MBA' : `Grade ${s.grade}`}</span>
                        </td>
                        <td className="px-4 py-3 text-center text-slate-600">{s.sessions}</td>
                        <td className="px-4 py-3 text-center">
                          {s.avgAccuracy !== null ? (
                            <span className={`font-semibold ${s.avgAccuracy >= 80 ? 'text-green-600' : s.avgAccuracy >= 60 ? 'text-yellow-600' : 'text-red-500'}`}>
                              {s.avgAccuracy}%
                            </span>
                          ) : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-center text-slate-600">{s.avgWpm ?? <span className="text-slate-300">—</span>}</td>
                        <td className="px-4 py-3 text-center text-slate-400 text-xs">
                          {s.lastSession ? new Date(s.lastSession).toLocaleDateString() : '—'}
                        </td>
                        <td className="px-4 py-3 text-center text-xs font-mono text-slate-600">
                          {formatCost(s.totalCost)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {hasAnyCost && (
                <p className="text-xs text-slate-500 text-right mt-2">
                  Class total: <span className="font-semibold font-mono text-slate-700">{formatCost(classTotal)}</span>
                </p>
              )}
            </>
          )
        })()}
      </main>
    </div>
  )
}
