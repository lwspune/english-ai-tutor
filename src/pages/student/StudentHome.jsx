import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import { classifyPassages } from '../../lib/passageClassifier'
import { computeStreak } from '../../lib/streak'
import { shouldShowWeeklySummary, markWeeklySummaryShown, computeWeeklySummaryData } from '../../lib/weeklySummary'
import WeeklySummaryModal from '../../components/WeeklySummaryModal'
import Pagination, { PAGE_SIZE } from '../../components/Pagination'

export default function StudentHome() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [todo, setTodo] = useState([])
  const [retry, setRetry] = useState([])
  const [sessions, setSessions] = useState([])
  const [streak, setStreak] = useState(0)
  const [hasReadToday, setHasReadToday] = useState(false)
  const [todayCount, setTodayCount] = useState(0)
  const [dailyLimit, setDailyLimit] = useState(null)
  const [loading, setLoading] = useState(true)
  const [weeklySummary, setWeeklySummary] = useState(null)
  const [todoPage, setTodoPage] = useState(0)
  const [retryPage, setRetryPage] = useState(0)
  const [sessionsPage, setSessionsPage] = useState(0)

  useEffect(() => {
    async function load() {
      const [{ data: p }, { data: s }, { data: settings }] = await Promise.all([
        supabase.from('passages').select('*').or(`grade_level.eq.${profile.grade},grade_level.is.null`).order('created_at', { ascending: false }),
        supabase.from('sessions').select('*, passages(title)').eq('student_id', profile.id).order('created_at', { ascending: false }),
        supabase.from('app_settings').select('daily_session_limit').single(),
      ])
      const allSessions = s ?? []
      const { todo, retry } = classifyPassages(p ?? [], allSessions)
      const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
      const countToday = allSessions.filter(
        s => new Date(s.created_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) === todayStr
      ).length
      const currentStreak = computeStreak(allSessions)
      setTodo(todo)
      setRetry(retry)
      setStreak(currentStreak)
      setHasReadToday(countToday > 0)
      setTodayCount(countToday)
      setDailyLimit(settings?.daily_session_limit ?? 5)
      setSessions(allSessions)
      setTodoPage(0)
      setRetryPage(0)
      setSessionsPage(0)
      setLoading(false)
      if (allSessions.length > 0 && shouldShowWeeklySummary(profile.id)) {
        setWeeklySummary(computeWeeklySummaryData(allSessions))
      }
    }
    load()
  }, [profile.id])

  function dismissWeeklySummary() {
    markWeeklySummaryShown(profile.id)
    setWeeklySummary(null)
  }

  const pagedTodo = todo.slice(todoPage * PAGE_SIZE, (todoPage + 1) * PAGE_SIZE)
  const pagedRetry = retry.slice(retryPage * PAGE_SIZE, (retryPage + 1) * PAGE_SIZE)
  const pagedSessions = sessions.slice(sessionsPage * PAGE_SIZE, (sessionsPage + 1) * PAGE_SIZE)

  return (
    <div className="min-h-screen bg-gray-50">
      {weeklySummary && (
        <WeeklySummaryModal data={weeklySummary} streak={streak} onDismiss={dismissWeeklySummary} />
      )}
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

        {streak > 0 && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-orange-700">
                {streak}-day streak
              </p>
              <p className="text-xs text-orange-400 mt-0.5">
                {hasReadToday ? 'Session done for today — keep it going tomorrow' : 'Read a passage today to keep your streak'}
              </p>
            </div>
            <span className="text-3xl font-bold text-orange-200">{streak}</span>
          </div>
        )}

        {dailyLimit !== null && (
          <div className={`rounded-xl border px-4 py-3 flex items-center justify-between ${
            todayCount >= dailyLimit
              ? 'bg-red-50 border-red-200'
              : 'bg-gray-50 border-gray-200'
          }`}>
            <p className={`text-sm font-medium ${todayCount >= dailyLimit ? 'text-red-600' : 'text-gray-600'}`}>
              {todayCount >= dailyLimit
                ? `Daily limit reached — come back tomorrow`
                : `${todayCount} of ${dailyLimit} passages read today`}
            </p>
            <span className={`text-sm font-bold ${todayCount >= dailyLimit ? 'text-red-300' : 'text-gray-300'}`}>
              {todayCount}/{dailyLimit}
            </span>
          </div>
        )}

        <section>
          <h2 className="text-base font-semibold text-gray-700 mb-3">Assigned Passages</h2>
          {loading ? (
            <p className="text-sm text-gray-400">Loading...</p>
          ) : todo.length === 0 && retry.length === 0 ? (
            <p className="text-sm text-gray-400">No passages assigned yet.</p>
          ) : (
            <>
              <div className="space-y-2">
                {pagedTodo.map(p => (
                  <div key={p.id} className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{p.title}</p>
                      <p className="text-xs text-gray-400">{p.word_count} words · {p.grade_level === 'MBA' ? 'MBA' : `Grade ${p.grade_level}`} · {p.difficulty ?? 'Easy'}</p>
                    </div>
                    <button
                      onClick={() => navigate(`/student/session/${p.id}`)}
                      className="bg-blue-600 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                      Start Reading
                    </button>
                  </div>
                ))}
              </div>
              <Pagination
                page={todoPage}
                total={todo.length}
                onPrev={() => setTodoPage(p => p - 1)}
                onNext={() => setTodoPage(p => p + 1)}
              />
            </>
          )}
        </section>

        {retry.length > 0 && (
          <section>
            <h2 className="text-base font-semibold text-gray-700 mb-1">Keep Practising</h2>
            <p className="text-xs text-gray-400 mb-3">You haven't mastered these yet. Give them another go.</p>
            <div className="space-y-2">
              {pagedRetry.map(p => (
                <div key={p.id} data-testid="retry-row" className="bg-amber-50 rounded-xl border border-amber-200 px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{p.title}</p>
                    <p className="text-xs text-gray-500">
                      {p.difficulty ?? 'Easy'} · Best score: <span className="font-semibold text-amber-700">{p.bestScore}%</span>
                      {' · '}{3 - p.attemptsUsed} attempt{3 - p.attemptsUsed !== 1 ? 's' : ''} left
                    </p>
                  </div>
                  <button
                    onClick={() => navigate(`/student/session/${p.id}`)}
                    className="bg-amber-500 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-amber-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                  >
                    Retry
                  </button>
                </div>
              ))}
            </div>
            <Pagination
              page={retryPage}
              total={retry.length}
              onPrev={() => setRetryPage(p => p - 1)}
              onNext={() => setRetryPage(p => p + 1)}
              testIdPrefix="retry"
            />
          </section>
        )}

        <section>
          <h2 className="text-base font-semibold text-gray-700 mb-3">Recent Sessions</h2>
          {sessions.length === 0 ? (
            <p className="text-sm text-gray-400">No sessions yet.</p>
          ) : (
            <>
              <div className="space-y-2">
                {pagedSessions.map(s => (
                  <div
                    key={s.id}
                    data-testid="session-row"
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
              <Pagination
                page={sessionsPage}
                total={sessions.length}
                onPrev={() => setSessionsPage(p => p - 1)}
                onNext={() => setSessionsPage(p => p + 1)}
                testIdPrefix="sessions"
              />
            </>
          )}
        </section>
      </main>
    </div>
  )
}
