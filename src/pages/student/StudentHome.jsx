import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import { classifyPassages } from '../../lib/passageClassifier'
import { computeStreak } from '../../lib/streak'
import { shouldShowWeeklySummary, markWeeklySummaryShown, computeWeeklySummaryData } from '../../lib/weeklySummary'
import WeeklySummaryModal from '../../components/WeeklySummaryModal'
import Pagination, { PAGE_SIZE } from '../../components/Pagination'
import BottomNav from '../../components/BottomNav'

function passageMeta(p) {
  const grade = p.grade_level === 'MBA' ? 'MBA' : p.grade_level ? `Grade ${p.grade_level}` : 'All grades'
  const diff = p.difficulty ?? 'Easy'
  return `${grade} · ${diff}`
}

function TabButton({ id, label, active, onClick }) {
  return (
    <button
      onClick={() => onClick(id)}
      className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
        active ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'
      }`}
    >
      {label}
    </button>
  )
}

export default function StudentHome() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [todo, setTodo] = useState([])
  const [retry, setRetry] = useState([])
  const [sessions, setSessions] = useState([])
  const [streak, setStreak] = useState(0)
  const [todayCount, setTodayCount] = useState(0)
  const [dailyLimit, setDailyLimit] = useState(null)
  const [loading, setLoading] = useState(true)
  const [weeklySummary, setWeeklySummary] = useState(null)
  const [todoPage, setTodoPage] = useState(0)
  const [retryPage, setRetryPage] = useState(0)
  const [sessionsPage, setSessionsPage] = useState(0)
  const [tab, setTab] = useState('todo')

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
      setTodo(todo)
      setRetry(retry)
      setStreak(computeStreak(allSessions))
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

  const dailyLimitReached = dailyLimit !== null && todayCount >= dailyLimit
  const nextUp = dailyLimitReached
    ? null
    : todo.length > 0
    ? { passage: todo[0], type: 'todo' }
    : retry.length > 0
    ? { passage: retry[0], type: 'retry' }
    : null

  // Exclude the hero passage from the To Read list (it's already featured prominently above).
  // The hero hides when the user pages past the first page, so Passage 0 re-enters view there.
  const displayTodo = nextUp?.type === 'todo' ? todo.slice(1) : todo
  const displayRetry = retry
  const pagedTodo = displayTodo.slice(todoPage * PAGE_SIZE, (todoPage + 1) * PAGE_SIZE)
  const pagedRetry = displayRetry.slice(retryPage * PAGE_SIZE, (retryPage + 1) * PAGE_SIZE)
  const pagedSessions = sessions.slice(sessionsPage * PAGE_SIZE, (sessionsPage + 1) * PAGE_SIZE)

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {weeklySummary && (
        <WeeklySummaryModal data={weeklySummary} streak={streak} onDismiss={dismissWeeklySummary} />
      )}

      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <h1 className="text-base font-semibold text-slate-800">English AI Tutor</h1>
        <button onClick={signOut} className="text-xs text-slate-400 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 rounded">
          Sign out
        </button>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        {!loading && (
          <div className="flex items-center gap-2">
            {streak > 0 && (
              <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full">
                🔥 {streak}-day streak
              </span>
            )}
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ml-auto ${
              dailyLimitReached ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-500'
            }`}>
              {dailyLimitReached ? 'Daily limit reached' : `${todayCount}/${dailyLimit} today`}
            </span>
          </div>
        )}

        {!loading && nextUp && (nextUp.type !== 'todo' || todoPage === 0) && (
          <div className="bg-indigo-600 rounded-2xl shadow-md p-5">
            <p className="text-xs font-semibold text-indigo-200 uppercase tracking-wide mb-1">
              {nextUp.type === 'todo' ? 'Next Up' : 'Keep Practising'}
            </p>
            <h2 className="text-lg font-bold text-white mb-1">{nextUp.passage.title}</h2>
            <p className="text-xs text-indigo-200 mb-4">{passageMeta(nextUp.passage)}</p>
            <button
              onClick={() => navigate(`/student/session/${nextUp.passage.id}`)}
              className="w-full bg-white text-indigo-600 font-semibold text-sm py-2 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              {nextUp.type === 'todo' ? 'Read Now' : 'Retry Now'}
            </button>
          </div>
        )}

        {!loading && (
          <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
            <TabButton id="todo" label="To Read" active={tab === 'todo'} onClick={setTab} />
            <TabButton id="retry" label="Practise" active={tab === 'retry'} onClick={setTab} />
            <TabButton id="history" label="History" active={tab === 'history'} onClick={setTab} />
          </div>
        )}

        {!loading && tab === 'todo' && (
          <section>
            {displayTodo.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">No passages assigned yet.</p>
            ) : (
              <>
                <div className="space-y-2">
                  {pagedTodo.map(p => (
                    <div key={p.id} className="bg-white rounded-xl shadow-sm px-4 py-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-slate-800">{p.title}</p>
                        <p className="text-xs text-slate-400">{p.word_count} words · {passageMeta(p)}</p>
                      </div>
                      <button
                        onClick={() => navigate(`/student/session/${p.id}`)}
                        className="bg-indigo-600 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                      >
                        Start Reading
                      </button>
                    </div>
                  ))}
                </div>
                <Pagination
                  page={todoPage}
                  total={displayTodo.length}
                  onPrev={() => setTodoPage(p => p - 1)}
                  onNext={() => setTodoPage(p => p + 1)}
                />
              </>
            )}
          </section>
        )}

        {!loading && tab === 'retry' && (
          <section>
            {displayRetry.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">Nothing to practise — great work!</p>
            ) : (
              <>
                <div className="space-y-2">
                  {pagedRetry.map(p => (
                    <div key={p.id} data-testid="retry-row" className="bg-amber-50 rounded-xl shadow-sm px-4 py-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-slate-800">{p.title}</p>
                        <p className="text-xs text-slate-500">
                          Best: <span className="font-semibold text-amber-700">{p.bestScore}%</span>
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
                  total={displayRetry.length}
                  onPrev={() => setRetryPage(p => p - 1)}
                  onNext={() => setRetryPage(p => p + 1)}
                  testIdPrefix="retry"
                />
              </>
            )}
          </section>
        )}

        {!loading && tab === 'history' && (
          <section>
            {sessions.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">No sessions yet.</p>
            ) : (
              <>
                <div className="space-y-2">
                  {pagedSessions.map(s => (
                    <div
                      key={s.id}
                      data-testid="session-row"
                      onClick={() => navigate(`/student/report/${s.id}`)}
                      className="bg-white rounded-xl shadow-sm px-4 py-3 flex items-center justify-between cursor-pointer hover:shadow-md transition-shadow"
                    >
                      <div>
                        <p className="text-sm font-medium text-slate-800">{s.passages?.title}</p>
                        <p className="text-xs text-slate-400">{new Date(s.created_at).toLocaleDateString()}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-indigo-600">{s.score_accuracy}%</p>
                        <p className="text-xs text-slate-400">{s.score_wpm} WPM</p>
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
        )}
      </main>

      <BottomNav />
    </div>
  )
}
