import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import AddStudentModal from '../../components/AddStudentModal'
import { computeSessionCost, formatCost } from '../../lib/costUtils'
import { isOutlierSession } from '../../lib/anomalyFlag'

const DAY_MS = 24 * 60 * 60 * 1000
const INACTIVE_DAYS = 7
const NEVER_STARTED_MIN_AGE_DAYS = 2
const OUTLIER_WINDOW_DAYS = 14

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
  const [vocabByStudent, setVocabByStudent] = useState({})
  const [totalVocabWords, setTotalVocabWords] = useState(0)
  const [milestonesByStudent, setMilestonesByStudent] = useState({})
  const [outlierFlags, setOutlierFlags] = useState([])
  const [pulse, setPulse] = useState(null)
  // Frozen "now" so the inactive/never-started filters stay deterministic
  // and useMemo callbacks remain pure (react-hooks/purity).
  const [loadedAt] = useState(() => Date.now())

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
        .select('id, full_name, grade, created_at')
        .eq('role', 'student')
        .order('full_name')

      if (!studentProfiles?.length) { setLoading(false); return }

      const { data: sessionStats } = await supabase
        .from('sessions')
        .select('id, student_id, score_accuracy, score_wpm, created_at, whisper_duration_seconds, llm_input_tokens, llm_output_tokens, passages(title)')
        .in('student_id', studentProfiles.map(s => s.id))

      const statsMap = {}
      const sessionsByStudent = {}
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
        if (!sessionsByStudent[s.student_id]) sessionsByStudent[s.student_id] = []
        sessionsByStudent[s.student_id].push(s)
      }

      // Compute outlier-flagged sessions within the last OUTLIER_WINDOW_DAYS
      // window. Uses the same anomalyFlag heuristic the StudentDetail chip
      // uses, just aggregated across the class.
      const outlierWindowStart = Date.now() - OUTLIER_WINDOW_DAYS * DAY_MS
      const flags = []
      for (const sid of Object.keys(sessionsByStudent)) {
        const list = sessionsByStudent[sid]
        const profile = studentProfiles.find(p => p.id === sid)
        for (const s of list) {
          if (new Date(s.created_at).getTime() < outlierWindowStart) continue
          const { outlier, reason } = isOutlierSession(s, list)
          if (outlier) {
            flags.push({
              sessionId: s.id,
              studentId: sid,
              studentName: profile?.full_name ?? 'Unknown',
              passageTitle: s.passages?.title ?? 'Untitled',
              accuracy: s.score_accuracy,
              reason,
            })
          }
        }
      }
      setOutlierFlags(flags)

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

  // Pulse strip — weekly class activity counts
  useEffect(() => {
    async function loadPulse() {
      const weekAgoIso = new Date(loadedAt - 7 * DAY_MS).toISOString()
      const [sessionsR, drillsR, milestonesR, remindersR] = await Promise.all([
        supabase.from('sessions').select('*', { count: 'exact', head: true }).gte('created_at', weekAgoIso),
        supabase.from('drill_attempts').select('*', { count: 'exact', head: true }).gte('created_at', weekAgoIso),
        supabase.from('milestones').select('*', { count: 'exact', head: true }).gte('achieved_at', weekAgoIso),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'student').gte('last_reminder_sent', weekAgoIso),
      ])
      setPulse({
        sessions: sessionsR.count ?? 0,
        drills: drillsR.count ?? 0,
        milestones: milestonesR.count ?? 0,
        reminders: remindersR.count ?? 0,
      })
    }
    loadPulse()
  }, [loadedAt])

  // Derived: students inactive >7 days (had sessions, but lastSession is stale)
  const inactiveStudents = useMemo(() => {
    const threshold = loadedAt - INACTIVE_DAYS * DAY_MS
    return students.filter(s => s.lastSession && new Date(s.lastSession).getTime() < threshold)
  }, [students, loadedAt])

  // Derived: students whose account is >2 days old but have zero sessions
  const neverStartedStudents = useMemo(() => {
    const threshold = loadedAt - NEVER_STARTED_MIN_AGE_DAYS * DAY_MS
    return students.filter(s => s.sessions === 0 && s.created_at && new Date(s.created_at).getTime() < threshold)
  }, [students, loadedAt])

  useEffect(() => {
    async function loadVocabStats() {
      const eligibleIds = students.map(s => s.id)
      if (!eligibleIds.length) {
        setClassVocabMastery(null)
        setVocabByStudent({})
        setTotalVocabWords(0)
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
      const byStudent = {}
      for (const r of progressRows ?? []) {
        if (!byStudent[r.student_id]) byStudent[r.student_id] = 0
        if (r.mastered_at) byStudent[r.student_id]++
      }
      setVocabByStudent(byStudent)
      setTotalVocabWords(totalWords ?? 0)
      if (!totalWords) {
        setClassVocabMastery(null)
        return
      }
      setClassVocabMastery(Math.round(100 * masteredCount / (eligibleIds.length * totalWords)))
    }
    if (students.length > 0) loadVocabStats()
  }, [students])

  useEffect(() => {
    async function loadMilestones() {
      const eligibleIds = students.map(s => s.id)
      if (!eligibleIds.length) {
        setMilestonesByStudent({})
        return
      }
      const { data: milestoneRows } = await supabase
        .from('milestones')
        .select('student_id')
        .in('student_id', eligibleIds)
      const byStudent = {}
      for (const m of milestoneRows ?? []) {
        byStudent[m.student_id] = (byStudent[m.student_id] ?? 0) + 1
      }
      setMilestonesByStudent(byStudent)
    }
    if (students.length > 0) loadMilestones()
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

      {/* Nav row — pages */}
      <nav className="bg-white border-b border-slate-100 px-4 py-2.5 flex items-center gap-6 flex-wrap" aria-label="Teacher sections">
        <button onClick={() => navigate('/teacher/passages')} className="text-sm text-slate-600 hover:text-indigo-700 font-medium transition-colors">Manage Passages</button>
        <button onClick={() => navigate('/teacher/completion')} className="text-sm text-slate-600 hover:text-indigo-700 font-medium transition-colors">Passage Completion</button>
        <button onClick={() => navigate('/teacher/audio-review')} className="text-sm text-slate-600 hover:text-indigo-700 font-medium transition-colors">Audio Review</button>
        <button onClick={() => navigate('/teacher/waitlist')} className="text-sm text-slate-600 hover:text-indigo-700 font-medium transition-colors">Waitlist</button>
      </nav>

      {/* Settings row — class-wide toggles */}
      <div className="bg-slate-50 border-b border-slate-100 px-4 py-2 flex items-center gap-3 flex-wrap">
        {classCode && (
          <button
            onClick={copyCode}
            className="flex items-center gap-1.5 text-xs font-mono bg-white hover:bg-slate-100 text-slate-700 px-2.5 py-1.5 rounded-lg border border-slate-200 transition-colors"
            aria-label="Copy class code"
          >
            <span className="text-slate-400 font-sans">Code:</span>
            <span className="font-semibold tracking-widest">{classCode}</span>
            <span className="text-slate-400">{codeCopied ? '✓' : '⎘'}</span>
          </button>
        )}
        {dailyLimit !== null && (
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1" aria-label="Daily passage limit per student">
            <span className="text-xs text-slate-500">Daily limit:</span>
            <button
              onClick={() => updateDailyLimit(dailyLimit - 1)}
              disabled={dailyLimit <= 1 || updatingLimit}
              className="w-6 h-6 flex items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              aria-label="Decrease daily limit"
            >−</button>
            <span className="w-5 text-center text-sm font-semibold text-slate-800">{dailyLimit}</span>
            <button
              onClick={() => updateDailyLimit(dailyLimit + 1)}
              disabled={dailyLimit >= 20 || updatingLimit}
              className="w-6 h-6 flex items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
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

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Needs Your Attention — surfaces outliers, inactive, and never-started students */}
        {students.length > 0 && (
          <section className="bg-white rounded-2xl border border-slate-200 p-5">
            <h2 className="text-base font-semibold text-slate-700 mb-4">Needs Your Attention</h2>
            <div className="space-y-4">
              {/* Outlier sessions */}
              <div data-testid="attention-outliers">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                  Outlier sessions ({outlierFlags.length})
                </p>
                {outlierFlags.length === 0 ? (
                  <p className="text-sm text-slate-400">No suspicious sessions in the last {OUTLIER_WINDOW_DAYS} days ✓</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {outlierFlags.map(f => (
                      <button
                        key={f.sessionId}
                        onClick={() => navigate(`/teacher/student/${f.studentId}`)}
                        title={f.reason}
                        className="text-xs px-2.5 py-1 bg-amber-50 text-amber-900 border border-amber-200 rounded-full hover:bg-amber-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                      >
                        {f.studentName} · {f.passageTitle} · {f.accuracy}%
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Inactive students */}
              <div data-testid="attention-inactive">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                  Inactive &gt;{INACTIVE_DAYS} days ({inactiveStudents.length})
                </p>
                {inactiveStudents.length === 0 ? (
                  <p className="text-sm text-slate-400">Everyone active ✓</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {inactiveStudents.map(s => (
                      <button
                        key={s.id}
                        onClick={() => navigate(`/teacher/student/${s.id}`)}
                        className="text-xs px-2.5 py-1 bg-orange-50 text-orange-800 border border-orange-200 rounded-full hover:bg-orange-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
                      >
                        {s.full_name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Never-started students */}
              <div data-testid="attention-never-started">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                  Never started ({neverStartedStudents.length})
                </p>
                {neverStartedStudents.length === 0 ? (
                  <p className="text-sm text-slate-400">Everyone onboarded ✓</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {neverStartedStudents.map(s => (
                      <button
                        key={s.id}
                        onClick={() => navigate(`/teacher/student/${s.id}`)}
                        className="text-xs px-2.5 py-1 bg-red-50 text-red-800 border border-red-200 rounded-full hover:bg-red-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                      >
                        {s.full_name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* This Week — pulse strip of weekly activity */}
        {pulse && (
          <section>
            <h2 className="text-base font-semibold text-slate-700 mb-3">This Week</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div data-testid="pulse-sessions" className="bg-white rounded-2xl border border-slate-200 p-4 text-center">
                <p className="text-2xl font-bold text-slate-800">{pulse.sessions}</p>
                <p className="text-xs text-slate-500 mt-1">Sessions</p>
              </div>
              <div data-testid="pulse-drills" className="bg-white rounded-2xl border border-slate-200 p-4 text-center">
                <p className="text-2xl font-bold text-slate-800">{pulse.drills}</p>
                <p className="text-xs text-slate-500 mt-1">Drills</p>
              </div>
              <div data-testid="pulse-milestones" className="bg-white rounded-2xl border border-slate-200 p-4 text-center">
                <p className="text-2xl font-bold text-slate-800">{pulse.milestones}</p>
                <p className="text-xs text-slate-500 mt-1">Milestones</p>
              </div>
              <div data-testid="pulse-reminders" className="bg-white rounded-2xl border border-slate-200 p-4 text-center">
                <p className="text-2xl font-bold text-slate-800">{pulse.reminders}</p>
                <p className="text-xs text-slate-500 mt-1">Reminders Sent</p>
              </div>
            </div>
          </section>
        )}

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

              <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Student</th>
                      <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Sessions</th>
                      <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Avg Accuracy</th>
                      <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Avg WPM</th>
                      <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Vocab</th>
                      <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Milestones</th>
                      <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Last Session</th>
                      <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((s, i) => {
                      const vocabMastered = vocabByStudent[s.id] ?? 0
                      const milestoneCount = milestonesByStudent[s.id] ?? 0
                      const isInactive = s.lastSession && (loadedAt - new Date(s.lastSession).getTime()) > INACTIVE_DAYS * DAY_MS
                      return (
                      <tr
                        key={s.id}
                        onClick={() => navigate(`/teacher/student/${s.id}`)}
                        className={`cursor-pointer hover:bg-indigo-50 transition-colors ${i < students.length - 1 ? 'border-b border-slate-100' : ''}`}
                      >
                        <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">{s.full_name}
                          <span className="ml-2 text-xs text-slate-400">{s.grade === 'MBA' ? 'MBA' : `Grade ${s.grade}`}</span>
                        </td>
                        <td className="px-3 py-3 text-center text-slate-600">{s.sessions}</td>
                        <td className="px-3 py-3 text-center">
                          {s.avgAccuracy !== null ? (
                            <span className={`font-semibold ${s.avgAccuracy >= 80 ? 'text-green-600' : s.avgAccuracy >= 60 ? 'text-yellow-600' : 'text-red-500'}`}>
                              {s.avgAccuracy}%
                            </span>
                          ) : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-3 py-3 text-center text-slate-600">{s.avgWpm ?? <span className="text-slate-300">—</span>}</td>
                        <td data-testid={`vocab-cell-${s.id}`} className="px-3 py-3 text-center text-slate-600 whitespace-nowrap">
                          {totalVocabWords > 0
                            ? <span className={vocabMastered > 0 ? 'text-slate-700 font-medium' : 'text-slate-400'}>{vocabMastered} / {totalVocabWords}</span>
                            : <span className="text-slate-300">—</span>}
                        </td>
                        <td data-testid={`milestones-cell-${s.id}`} className="px-3 py-3 text-center">
                          {milestoneCount > 0
                            ? <span className="text-indigo-600 font-semibold">{milestoneCount}</span>
                            : <span className="text-slate-300">0</span>}
                        </td>
                        <td
                          data-testid={`last-session-cell-${s.id}`}
                          className={`px-3 py-3 text-center text-xs whitespace-nowrap ${isInactive ? 'text-red-500 font-semibold' : 'text-slate-400'}`}
                        >
                          {s.lastSession ? new Date(s.lastSession).toLocaleDateString() : '—'}
                        </td>
                        <td className="px-3 py-3 text-center text-xs font-mono text-slate-600 whitespace-nowrap">
                          {formatCost(s.totalCost)}
                        </td>
                      </tr>
                    )})}
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
